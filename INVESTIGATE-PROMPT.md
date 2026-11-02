You are fixing two performance problems in the example repo `~/keg-hub/external/apps/wmn-claude-code`. It runs Claude Code inside the browser: a wmn runnable page boots `chatwork/claude-code:2.1.316` (linux/arm64) in wmd-web (WebAssembly, with a dynamic binary translator), and the machine reaches the API through the relay `wss://relay.threadedstack.com`. Everything already works in Chromium and Firefox. Two things are too slow:

1. **Overall speed.** `claude -p "hi"` takes about 33 s in Chromium even with the best settings found so far. Without them it takes 54 s. Interactive `claude` takes about 60 s to show its prompt. Find where every second goes and cut it as far as possible, in wmn, wmd and the example as needed.
2. **WebKit.** `claude -p "hi"` takes 136 s, and interactive `claude` takes 3 to 8 minutes to show its prompt, and typed text can take minutes to appear. A longer timeout is not a fix. Find the real cause and fix it.

## Source code you have

- **wmn:** `~/keg-hub/external/apps/wmn` (github.com/threadedstack/wmn). It holds the publish output, the runnable page, the Terminal panel (xterm.js), the Console strip, and the vendored wmd-web at `packages/wmd-web`, updated with `packages/wmd-web/update.sh`.
- **wmd:** `~/keg-hub/external/apps/wmd` (github.com/threadedstack/wmd). It holds the engine: vm.wasm, the guest kernel, the dynamic binary translator (guest/vm, cp_emit, wasm_enc), and the browser host for wmd-web.
- **The example:** `~/keg-hub/external/apps/wmn-claude-code`.

Use the source to test your ideas, not only to read: build a changed vm.wasm or wmd-web, point a local publish at it, and measure the example against it before you land anything.

- **Building the engine:**
  - Build vm.wasm with `make guest-vm` (Homebrew off PATH) into your own folder. It must carry the W21 heap reserve; the browser host sets `WMD_HEAP_RESERVE=1`.
  - Move vm.wasm and wmd-web together. An old wmd-web with a new vm.wasm can fail.
  - Publish against your build with `WMN_ENGINE_DIR=<dir> ./build.sh` (the `--engine` flag), and use a `wmn` built from your wmn checkout via `WMN_BIN`.
- **Private daemons:** never write `~/.wmd/bin` and never relink `bin/wmd-run`. Use private daemons with their own `WMD_SNAPSHOT` and data roots.
- **Timing runs:** check the P-core canary `~/.wmd/bench-tmp/canary/canary` before each one (normally about 620 ms). If it is much slower, the Mac is busy and your numbers are noise.
- **Use worktrees** in both repos for your changes, so you don't disturb the other sessions' checkouts.

Start by reading `PERFORMANCE.md`, `README.md`, `PLAN.md`, `notebook/index.wmn.md` and `tools/` in that repo. `PERFORMANCE.md` has every measurement and setting tried so far. Don't repeat those runs: the numbers there are the baseline. Re-measure only after something has changed.

## Hard rules

- **You may change code** in wmn (`~/keg-hub/external/apps/wmn`), wmd and the engine, as well as the wmn-claude-code repo. This session exists to write the fixes, not only to measure. Fix where the cause is: if the slowness is in the translator, the terminal panel, the machine-to-terminal path or the publish output, change that code. Don't paper over it in the example.
- **Follow each repo's own rules** for changing and landing code: its CLAUDE.md, and the memory rules for that project (the item gate, landing on main, tests for the changed code only, goldens in three browsers). Read them before your first change.
- Keep the wmn-claude-code example working the whole time. A wmn or wmd change that the example needs must be released (or the example pointed at the build) before the example depends on it.
- **You are the wmd session.** No other session works on wmd, so you own it, translator included (guest/vm, cp_emit, wasm_enc). Change whatever the performance work needs. Follow wmd's own CLAUDE.md for building, testing and landing.
- **Another session ("WMN Items") works on wmn's main branch.** Before any change to wmn's main branch, and before any boots, publishes or servers, check with it via ListAgents/SendMessage. Agree on who touches which files, so neither of you breaks the other's work. If it is running a release or gate runs, ask it to tell you when it's done, and wait. Don't start heavy work during a release.
- **The Mac has 16 GB and is shared.** Run one browser at a time. Browser boots go through `~/.wmd/bootlock/bootlock.sh run --max 1800 -- <cmd>`. No run may take longer than 30 minutes. If the harness stops a run for low memory, don't restart it on your own: report it and ask.
- **The token is never printed.** Use `TDSK_CLAUDE_CODE_API_KEY` as `CLAUDE_CODE_OAUTH_TOKEN`, never `TDSK_ANTHROPIC_API_KEY`. `tools/drive.mjs` reads it with `secret()` and types it into `read -rs`. Run `node tools/scan.mjs <file>` on every log and screenshot text before you read it. Never cat `~/.config/tdsk/values.yaml`.
- **Cleanup:** no `pkill` by pattern and no `rm -rf` on variable paths. Stop only the processes you started (record their pids). Keep at least 50 GiB of disk free.
- Commits and landings follow the repos' rules above. In wmn-claude-code (no remote yet), don't commit or push unless the user asks.
- **Record every optimization in `PERFORMANCE.md`:** the setting or change, the before and after numbers, the browser, how it was run, and whether it was kept. The user wants to reuse them later.

## How to run it

- Build: `./build.sh` (needs `wmn` on PATH or `WMN_BIN`). Serve: `bun serve.ts ../wmn-claude-code-site 31810`. Open http://127.0.0.1:31810/.
  - The built site is out of date: it doesn't include the `~/.claude-env` settings yet, so rebuild first.
  - A server from the earlier session may still run on 31810. Check it with `lsof -i :31810` before you start one.
- Driver: `node tools/drive.mjs <url> <outdir> <chromium|firefox|webkit> <version|claude|block|diag|dbg>` (Playwright).
  - It imports `secret()` from `~/keg-hub/external/apps/wmn/e2e/lib/walk.mjs`.
  - `dbg` uses the debug notebook in `tools/dbg/index.wmn.md` (publish it to its own site and port, e.g. 31811). It runs timed variants in one page and writes the Console strip text to `<browser>-dbg.txt`.
  - The Console strip hides long output from `innerText`: open "Live console" and read `textContent`, and summarize inside the machine (awk) instead of printing long output.
- Noise: single runs vary by 20 s or more when the Mac is busy. Compare variants interleaved, in one page, at least twice each, and write down the load average.

## What is already known

- Settings in use (in `~/.claude-env`, which `.bashrc` loads and the ask block loads itself): `CLAUDE_CODE_CERT_STORE=bundled CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 BUN_JSC_useDFGJIT=0 BUN_JSC_useFTLJIT=0`. `BUN_JSC_*` must be in the environment when `claude` starts.
- `claude -p "hi"` with `--debug` (Chromium, 55 s, no settings):
  - 12 s before the first log line (Bun loading the JS bundle on the emulated CPU)
  - about 9 s of CA certificate loading, done twice
  - 16 s of event-loop stalls (CPU-bound JS)
  - 3.3 s for the API call
  The network isn't the bottleneck: one relay HTTPS request takes about 3 s.
- `claude --version` takes 1.3 s in Chromium and 2.4 s in WebKit, so the machine's CPU in WebKit is about 2× slower. `claude -p` is 2.7× slower in WebKit.
- WebKit terminal: 2000 lines take 25 s against 3.5 s in Chromium (7×). Claude Code's TUI redraws constantly, so in WebKit the terminal is a large part of the delay.
- Turning the whole JIT off (`BUN_JSC_useJIT=0`) is slower than keeping the baseline JIT once the other settings are set. JIT-written code has to be translated again by wmd's translator.
- The machine runs with 1 vCPU and 1536 MiB (`memory: 1536` in the front matter).

## Questions to answer, with measurements

**Overall speed:**
1. Not yet run ("round 3"): `--bare`, `CLAUDE_CODE_SIMPLE=1`, and `DISABLE_AUTOUPDATER=1 DISABLE_TELEMETRY=1 DISABLE_ERROR_REPORTING=1` on top of the current settings. Keep `--bare` or `CLAUDE_CODE_SIMPLE` only if `CLAUDE_CODE_OAUTH_TOKEN` sign-in still works and interactive Claude Code keeps its features.
2. The 12 s bundle load:
   - Is it parsing, translation, or reading the ~200 MB binary from the guest disk?
   - Is a second `claude -p` in the same machine faster? That would show whether wmd's translation cache or the page cache helps.
   - Can Bun or JSC options help: bytecode cache, `BUN_JSC_*` options for the baseline JIT and the LLInt?
   - Can a warm-up step in the first block help, by pre-reading the binary or running a dummy start?
3. Do the CA certificates still load twice with `CLAUDE_CODE_CERT_STORE=bundled`? Can the second load be avoided with settings?
4. What do the front matter options allow (vCPUs, memory, other machine settings wmn exposes to documents), and do more vCPUs or memory help? Read wmn's docs for the document options. If the limits hold it back, change them.
5. For scale, how long does the same `claude -p "hi"` take on this Mac natively and in an arm64 container? This shows how much time is emulation cost versus Claude Code's own start time.
6. Is the remaining time in the guest kernel (syscalls, page faults, futex), in the translator, or in user JS? Use what the guest offers (`strace -c` or `/proc` stats if the image has them, timestamps) to find out.

**WebKit:**
7. Separate the three possible causes:
   - (a) xterm.js drawing in WebKit: test a plain xterm.js page with the same renderer, without wmd.
   - (b) the path from the machine to the terminal in WebKit: SharedArrayBuffer/Atomics, postMessage, worker scheduling.
   - (c) the slower wasm CPU.
   Measure each one separately.
8. Which xterm renderer does the Terminal panel use (DOM, canvas or WebGL), and how fast is each one in WebKit? Switch it or fix it in wmn if another renderer or a batching change is faster.
9. Can Claude Code redraw less? Look for settings that reduce TUI redraws: spinner, animations, reduced motion, `TERM`, terminal size. Measure the time until the prompt shows and the time for typed text to appear.
10. Is Playwright's WebKit representative of Safari? Check once in real Safari, by hand or with safaridriver.

## Done when

- `PERFORMANCE.md` shows where each second of `claude -p "hi"` and of the interactive start goes, in Chromium and WebKit, with numbers.
- The fixes are made: in wmn/wmd where the cause is there, in the notebook where it is a setting. The site is rebuilt and checked once in Chromium, Firefox and WebKit with `drive.mjs claude` and `drive.mjs block`. Before/after numbers are recorded.
- Anything not fixed is listed under "Still open" in `PERFORMANCE.md`, with evidence, the expected gain and what blocks it.
- Report to the user in plain words:
  - what got faster and by how much
  - what the WebKit cause is
  - what code changed, and where
  - what is left and what it would take
