# Performance: Claude Code in wmd-web

Measurements and the settings that change them. Machine: `chatwork/claude-code:2.1.316` (linux/arm64) in wmd-web, published with wmn 0.1.5, served locally, 1 vCPU, 1536 MiB. The Mac was shared with other wmn test runs, so single numbers carry noise of 20 s or more; compare runs made in the same page, interleaved.

## Where the time goes (Chromium)

| Step | Chromium | WebKit |
|---|---|---|
| Machine start and first block (`claude --version`) | 8 s | 9 s |
| `claude --version` alone (CPU only, exits early) | 1.3 s | 2.4 s |
| One HTTPS request through the relay (`curl`) | 2.7 to 3.3 s | 3.1 to 4.0 s |
| `claude -p "hi"` | 44 to 55 s | 136 s |
| 2000 lines printed in the Terminal | 3.5 s | 25 s |
| Interactive `claude` until its prompt shows | about 60 s | 3 to 8 min |

`claude -p "hi"` with `--debug` (Chromium, 55 s total):

- 12 s before Claude Code writes its first log line: Bun loading Claude Code's JavaScript bundle on the emulated CPU.
- about 9 s loading and filtering CA certificates, done twice (bundled 118 + system 147 each time).
- 16 s of event-loop stalls (Claude Code's own detector): CPU-bound JavaScript.
- 3.3 s for the API call itself (`api=3334ms`). The network is not the bottleneck.

## Settings tried (environment variables of `claude`, no code changes)

Round 1, one page, run in this order (Chromium):

| Setting | `claude -p "hi"` |
|---|---|
| none (baseline) | 50 s |
| `CLAUDE_CODE_CERT_STORE=bundled` | 49 s |
| `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` | 46 s |
| `BUN_JSC_useDFGJIT=0 BUN_JSC_useFTLJIT=0` | 46 s |
| `BUN_JSC_useJIT=0` | 34 s |
| cert store + non-essential traffic + DFG/FTL off | 29 s |
| none (baseline, again at the end) | 72 s |

- `BUN_JSC_useJIT=0` (JavaScriptCore runs its interpreter only) is the largest single gain: code the JIT writes at run time has to be translated again by wmd's CPU translator, which costs more than it saves.
- `CLAUDE_CODE_CERT_STORE` takes a list of stores (`bundled`, `system`); `bundled` skips the system store.

Round 2, one page, interleaved, each twice (Chromium, load average about 19):

| Setting | Run 1 | Run 2 |
|---|---|---|
| none (baseline) | 56 s | 52 s |
| cert store + non-essential traffic + `BUN_JSC_useJIT=0` | 41 s | 45 s |
| cert store + non-essential traffic + DFG/FTL off | 31 s | 36 s |

Chosen: `CLAUDE_CODE_CERT_STORE=bundled CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 BUN_JSC_useDFGJIT=0 BUN_JSC_useFTLJIT=0`, about 40% faster than none (54 s to 33 s). With the other two set, turning the whole JIT off is slower than keeping the baseline JIT: the interpreter alone costs more than the baseline JIT's translation.

The `BUN_JSC_*` options must be in the environment when `claude` starts (JavaScriptCore reads them at start), so the page writes all four to `~/.claude-env`, which `~/.bashrc` loads (the terminal) and the `claude -p` block loads itself, not to Claude Code's settings `env`.

## WebKit

The Terminal is about 7 times slower to draw in WebKit than in Chromium (2000 lines: 25 s against 3.5 s). Claude Code's interactive screen redraws all the time, so in WebKit the terminal, not the machine, is the limit. Not yet investigated further.

## Live site, first check (2026-11-01)

https://cc.threadedstack.com, built with wmn 0.1.7 and the chosen settings in `~/.claude-env`, checked with `tools/drive.mjs claude`, one browser at a time, while gate runs used the Mac (load average about 14). Times from `claude` started:

| | Chromium | Firefox | WebKit |
|---|---|---|---|
| Claude Code prompt shows | 41 s | 48 s | 38 s |
| Enter presses until the question was taken | 1 | 2 | 7 |
| Answer after the question was taken | 18 s | 30 s | 84 s |

In WebKit, the start took 3 to 8 minutes before (local build, wmn 0.1.5, no settings); now it takes under a minute. These are single runs: the change of build (wmn 0.1.7) and the settings were not measured apart. WebKit still takes more Enter presses and answers slower.

Claude Code 2.1.316 now opens in auto mode: the prompt footer reads "auto mode on" instead of "? for shortcuts", and the driver waits for either.

## Open

- Round 3, not run yet (stopped for low memory on the Mac): on top of the chosen settings, `--bare`, `CLAUDE_CODE_SIMPLE=1`, and `DISABLE_AUTOUPDATER=1 DISABLE_TELEMETRY=1 DISABLE_ERROR_REPORTING=1`. `--bare` and `CLAUDE_CODE_SIMPLE` skip hooks, LSP, plugin sync, auto-memory, background prefetches and keychain reads, and may turn off OAuth sign-in: use them only if `CLAUDE_CODE_OAUTH_TOKEN` still works and Claude Code keeps its full feature set.

- The 12 s bundle load at every start.
- WebKit terminal drawing.
