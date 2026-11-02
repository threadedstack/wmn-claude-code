// Prints how many token pieces a file holds (0 means safe to read). Never prints the token.
import fs from "node:fs";
import path from "node:path";
// WMN_DIR: the wmn checkout (default: ../wmn next to this repo).
const wmnDir = process.env.WMN_DIR || path.resolve(import.meta.dirname, "../../wmn");
const { secret } = await import(path.join(wmnDir, "e2e/lib/walk.mjs"));
const t = secret("TDSK_CLAUDE_CODE_API_KEY");
const text = fs.readFileSync(process.argv[2], "utf8").replace(/\s/g, "");
let n = 0;
for (let i = 0; i + 8 <= t.length; i += 8) if (text.includes(t.slice(i, i + 8))) n++;
console.log(`${process.argv[2]}: ${n} token pieces, sk-ant- occurrences ${(text.match(/sk-ant-/g) || []).length}`);
