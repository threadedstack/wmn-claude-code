// Drives the published Claude Code page in a real browser.
//   node drive.mjs <url> <out dir> [chromium|firefox|webkit] [stage]
// stage "version": run the first block only. "claude": also start Claude Code in the terminal and ask it something.
// The token is read from the keys file and typed through the keyboard; every printed line is redacted.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
// WMN_DIR: the wmn checkout (default: ../wmn next to this repo).
const wmnDir = process.env.WMN_DIR || path.resolve(import.meta.dirname, "../../wmn");
const require = createRequire(path.join(wmnDir, "package.json"));
const pw = require("@playwright/test");
const { secret } = await import(path.join(wmnDir, "e2e/lib/walk.mjs"));

const [url, out, browserName = "chromium", stage = "claude"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const token = stage === "version" ? "" : secret("TDSK_CLAUDE_CODE_API_KEY");
// Redact the token even when the terminal wraps it: any sk-ant- run (with line breaks inside it), and every 12+ char piece of it.
const pieces = token ? Array.from({ length: Math.ceil(token.length / 12) }, (_, i) => token.slice(i * 12, i * 12 + 12)).filter((p) => p.length >= 8) : [];
const red = (s) => {
  let r = String(s).replace(/sk-ant-[A-Za-z0-9_\-\s]*/g, "<token>");
  for (const p of pieces) r = r.split(p).join("<token>");
  return r;
};
const log = (...a) => console.log(red(a.join(" ")));
const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

const browser = await pw[browserName].launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.on("console", (m) => { if (m.type() === "error") log("console error:", m.text().slice(0, 300)); });
page.on("pageerror", (e) => log("page error:", e.message.slice(0, 300)));
const shot = (n) => page.screenshot({ path: path.join(out, `${browserName}-${n}.png` ) });

try {
  await page.goto(url);
  log(at(), "isolated:", await page.evaluate(() => crossOriginIsolated));
  await page.locator("button.run-btn").first().click();
  const blockOut = page.locator("[data-wmn-block], .block").first();
  await page.waitForFunction(() => /\d+\.\d+\.\d+ \(Claude Code\)/.test(document.body.innerText) || /Failed|error|exit (code|status) [1-9]/i.test(document.querySelector(".run-btn")?.closest("section,div")?.innerText ?? ""), null, { timeout: 600000, polling: 2000 });
  log(at(), "version block ran");
  const txt = await page.evaluate(() => document.body.innerText);
  log("version output:", (txt.match(/aarch64[\s\S]{0,200}/) || [""])[0].replace(/\n/g, " | "));
  await shot("1-version");
  if (stage === "version") process.exit(0);

  await page.locator("button.head-terminal").click();
  await page.locator("#wmn-terminal-panel").getByRole("button", { name: "New terminal" }).first().click();
  const term = page.locator("#wmn-terminal-panel .xterm");
  await term.waitFor({ timeout: 120000 });
  await term.click();
  await page.waitForTimeout(3000);
  const screen = () => page.evaluate(() => document.querySelector("#wmn-terminal-panel .xterm-rows")?.innerText ?? "");
  const waitScreen = async (re, ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { const s = await screen(); if (re.test(s)) return s; await page.waitForTimeout(1500); }
    throw new Error(`terminal never showed ${re}; screen:\n${red(await screen())}`);
  };
  // read -rs: the shell does not echo what is typed, so the token never reaches the screen.
  await page.keyboard.type("read -rs CLAUDE_CODE_OAUTH_TOKEN; export CLAUDE_CODE_OAUTH_TOKEN; echo token-set", { delay: 10 });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  await page.keyboard.type(token, { delay: 2 });
  await page.keyboard.press("Enter");
  await waitScreen(/^token-set/m, 30000);
  await page.keyboard.type("echo len=${#CLAUDE_CODE_OAUTH_TOKEN}", { delay: 5 });
  await page.keyboard.press("Enter");
  log(at(), "token length in machine:", (await waitScreen(/^len=\d+/m, 30000)).match(/^len=(\d+)/m)[1], "expected", token.length);
  if (stage === "dbg") {
    await page.keyboard.type("(umask 077; printf %s \"$CLAUDE_CODE_OAUTH_TOKEN\" > ~/.claude-token); echo file-written", { delay: 5 });
    await page.keyboard.press("Enter");
    await waitScreen(/^file-written/m, 60000);
    await page.locator("button.run-btn").nth(1).click();
    log(at(), "dbg block started");
    await page.waitForFunction(() => (document.body.innerText.match(/Done in/g) || []).length >= 2, null, { timeout: 900000, polling: 3000 });
    // The output sits in the block's folded live console: open every folded console, then read all text, hidden or not.
    for (const h of await page.getByText(/Live console/).all()) await h.click().catch(() => {});
    await page.waitForTimeout(2000);
    const t = await page.evaluate(() => document.body.textContent);
    fs.writeFileSync(path.join(out, `${browserName}-dbg.txt`), red(t.slice(t.indexOf("rc="))));
    log(at(), "dbg done");
    await browser.close();
    process.exit(0);
  }
  if (stage === "block") {
    // Section 3: the terminal writes the token file, then the #ask block runs claude -p.
    await page.keyboard.type("(umask 077; printf %s \"$CLAUDE_CODE_OAUTH_TOKEN\" > ~/.claude-token); echo file-written", { delay: 5 });
    await page.keyboard.press("Enter");
    await waitScreen(/^file-written/m, 60000);
    await page.locator("button.run-btn").nth(1).click();
    log(at(), "ask block started");
    await page.waitForFunction(() => /(aarch64|ARM64|ARM)[^\n]*Linux|Linux[^\n]*(aarch64|ARM)/i.test(document.body.innerText), null, { timeout: 600000, polling: 3000 });
    const t = await page.evaluate(() => document.body.innerText);
    log(at(), "ask block answer:", red((t.match(/You['’]re[^\n]{0,200}|This[^\n]{0,40}(aarch64|ARM)[^\n]{0,160}/) || ["(see screenshot)"])[0]));
    await page.locator("button.run-btn").nth(1).scrollIntoViewIfNeeded();
    await shot("block");
    await browser.close();
    process.exit(0);
  }
  if (stage === "diag") {
    // Times each part on its own: CPU (claude --version), relay connections (curl), the API without the TUI (claude -p),
    // and terminal drawing (a flood of lines). Each prints MARK<n> with its wall time in seconds.
    const cmds = [
      "claude --version >/dev/null",
      "curl -s -o /dev/null https://api.anthropic.com/",
      "curl -s -o /dev/null https://api.anthropic.com/",
      "curl -s -o /dev/null https://registry.npmjs.org/@anthropic-ai/claude-code",
      "cd ~ && claude -p 'Reply with exactly: hi' >/dev/null",
      "for i in $(seq 2000); do echo line-$i-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx; done",
    ];
    for (let i = 0; i < cmds.length; i++) {
      await page.keyboard.type(`s=$(date +%s%N); ${cmds[i]}; echo MARK${i}=$(( ($(date +%s%N) - s) / 1000000 ))ms`, { delay: 2 });
      await page.keyboard.press("Enter");
      const t1 = Date.now();
      const sc = await waitScreen(new RegExp(`^MARK${i}=`, "m"), 900000).catch((e) => e.message);
      const m = sc.match(new RegExp(`^MARK${i}=([^\\s]*)`, "m"));
      log(at(), `${browserName} step ${i} [${cmds[i].slice(0, 60)}]: machine ${m ? m[1] : "?"}, page ${((Date.now() - t1) / 1000).toFixed(1)} s`);
    }
    await shot("diag");
    await browser.close();
    process.exit(0);
  }
  await page.keyboard.type("cd ~ && claude", { delay: 20 });
  await page.keyboard.press("Enter");
  log(at(), "claude started");
  // First start: theme, security notes, trust prompt (default is "No, exit", so pick Yes), then the prompt box.
  let ready = false;
  for (let i = 0; i < 10 && !ready; i++) {
    const s = await waitScreen(/theme|trust this folder|Press Enter|\? for shortcuts|Try "|error|login/i, 600000);
    log(at(), `screen ${i}:\n` + red(s).split("\n").filter((l) => l.trim()).slice(-10).join("\n"));
    await shot(`2-claude-${i}`);
    if (/\? for shortcuts|Try "/i.test(s)) { ready = true; break; }
    if (/Yes, I trust this folder/.test(s)) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(5000);
  }
  if (!ready) throw new Error("Claude Code never showed its prompt");
  await page.waitForTimeout(8000);
  await page.keyboard.type("Run uname -a and tell me in one sentence what machine you are on.", { delay: 30 });
  await waitScreen(/what machine you are on/, 300000);
  await page.waitForTimeout(3000);
  log(at(), "asked");
  // Keys that queue while Claude Code is busy arrive as one chunk, which it reads as a paste (Enter becomes a new line).
  // Press Enter once the text is shown, and again while it still sits in the input box.
  for (let k = 0; k < 8; k++) {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(8000);
    const s = await screen();
    if (/esc to interrupt|Bash\(uname|●/.test(s)) { log(at(), `submitted after ${k + 1} Enter`); break; }
  }
  for (let i = 0; i < 150; i++) {
    await page.waitForTimeout(6000);
    const s = await screen();
    if (/Do you want to proceed/.test(s)) { log(at(), "permission prompt: allowing"); await page.keyboard.press("Enter"); continue; }
    if (/●[^\n]*(aarch64|ARM|arm64|Linux)/i.test(s) && !/esc to interrupt/i.test(s)) { log(at(), "answer:\n" + red(s).split("\n").filter((l) => l.trim()).slice(-16).join("\n")); break; }
    if (i % 3 === 2) log(at(), "waiting:\n" + red(s).split("\n").filter((l) => l.trim()).slice(-14).join("\n"));
  }
  await shot("3-answer");
} catch (e) {
  log(at(), "FAILED:", e.message);
  await shot("fail").catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
