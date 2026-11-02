# wmn-claude-code

Claude Code running in your browser. One wmn document (`notebook/index.wmn.md`) is published as a runnable page: it starts a Linux machine in the tab with wmd-web (WebAssembly) from the Docker image `chatwork/claude-code:2.1.316`, and its Terminal panel gives you a shell where `claude` runs. The machine reaches Claude's API through the relay (`wss://relay.threadedstack.com`), which carries TLS bytes it cannot read.

## Run it

Needs the `wmn` command (or `WMN_BIN` pointing at it) and Bun.

```
./build.sh                                   # writes ../wmn-claude-code-site (about 600 MB: the image is baked in)
bun serve.ts ../wmn-claude-code-site 31810   # serves it with the isolation headers the machine needs
```

Open http://127.0.0.1:31810/ in Chrome, Firefox or Safari, then:

1. Press **Run** on the first block: the machine starts, prints `2.1.316 (Claude Code)` and writes Claude Code's settings so it skips its first-run questions.
2. Open **Terminal**, press **New terminal**, run `read -rs CLAUDE_CODE_OAUTH_TOKEN && export CLAUDE_CODE_OAUTH_TOKEN`, paste your token (nothing shows), press Enter.
3. Run `cd ~ && claude` and talk to Claude Code. It starts in under a minute in Chrome, Firefox and Safari. If you type while it is still busy, it may take your Enter as a new line: press Enter again to send.

Make a token with `claude setup-token` on a computer where Claude Code is installed. Closing the tab ends the machine.

## Live site

https://cc.threadedstack.com (also https://wmn-claude-code.web.app): Firebase Hosting, site `wmn-claude-code` in project `wmn-runbooks`. The first visit downloads about 500 MB (the machine image); the page keeps it for later visits.

Deploy with `./deploy.sh` from a clean checkout. It follows wmn's runbooks deploy:
1. Build with `--host firebase` and aim `firebase.json` at this site only.
2. Stamp the build with `wmn-claude-code-version.json` (the commit).
3. Copy the live site to the `previous` channel, deploy, and check that the new version is served.
4. Put `previous` back if anything fails.

`cc` is a CNAME at Porkbun to `wmn-claude-code.web.app`.

## Files

- `notebook/index.wmn.md`: the page (the only folder published)
- `build.sh`: publishes the site
- `deploy.sh`: deploys it to Firebase Hosting
- `serve.ts`: a static server that sends Cross-Origin-Opener-Policy, Cross-Origin-Embedder-Policy and Cross-Origin-Resource-Policy
- `PLAN.md`: the spec and plan
- `PERFORMANCE.md`: measurements and the speed settings tried, kept or dropped
- `INVESTIGATE-PROMPT.md`: the brief for the performance work (Claude Code start time, WebKit terminal speed)
- `tools/drive.mjs`: drives the page in Chromium, Firefox or WebKit with Playwright (`node tools/drive.mjs <url> <out dir> <browser> <stage>`); the token is typed unseen and every printed line is redacted
- `tools/scan.mjs`: counts token pieces in a log before anyone reads it
- `tools/dbg/`: a debug document that times `claude -p` variants in one page

The tools use wmn's Playwright and key reader: they look for the wmn checkout at `../wmn`, or set `WMN_DIR`.
