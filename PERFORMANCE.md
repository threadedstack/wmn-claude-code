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

## Native and terminal-only baselines (2026-11-02, wmd session)

### Claude Code on this Mac, natively

The same Claude Code 2.1.316 (darwin-arm64 binary from downloads.claude.ai, checksum checked), `claude -p "Reply with exactly: hi"` with `CLAUDE_CODE_CERT_STORE=bundled CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, a fresh HOME, `/usr/bin/time -l`:

| | Native (M-series Mac) |
|---|---|
| wall | 2.6 to 3.3 s (5.5 s once), mostly the API |
| CPU | 0.37 to 0.42 s user + 0.07 to 0.11 s sys |
| start to first debug line | about 0.3 s (includes spawning it from node) |
| first debug line to the API request | 0.14 s |
| API first byte | 2.7 s |
| `claude --version` | 0.01 s |
| max RSS | 212 MB |

So the browser's about 30 s beyond the API is the emulated CPU running about 0.4 s of native work, roughly 70 times slower. The binary is Bun 1.4.4 and already carries JavaScriptCore bytecode (`// @bun @bytecode` in its `__BUN` section, 184 MB), so a bytecode cache has nothing left to gain. The certificates load once with `bundled`.

### Round 3, decided natively (no guest run needed)

| Setting | Result | Kept |
|---|---|---|
| `--bare` | "Not logged in": OAuth is never read under `--bare` (its help says so) | no |
| `CLAUDE_CODE_SIMPLE=1` | "Not logged in" as well | no |
| `DISABLE_AUTOUPDATER=1 DISABLE_TELEMETRY=1 DISABLE_ERROR_REPORTING=1` | works natively; timed in the machine below | (pending) |

### The terminal alone: xterm.js 6 with no machine behind it

`tools/term-bench` (plain page, xterm.js 6.0.0, 120x40, the panel's font size and line height), Playwright browsers, headless, one at a time under the boot lock, load average about 19 (busy Mac), times in ms:

| | Chromium DOM | Chromium WebGL | WebKit DOM | WebKit WebGL | Firefox DOM | Firefox WebGL |
|---|---|---|---|---|---|---|
| 2000 lines, 64-byte writes | 66 / 132 | 114577 / 78062 (headless software GL) | 364 / 317 | 358 / 266 | 141 / 107 | 139 / 109 |
| 2000 lines, 4 KB writes | 33 | 72 | 33 | 32 | 41 | 40 |
| 200 Claude-style 30-row redraws, 64-byte writes | 218 | 374 | 1366 | 1303 | 439 | 439 |
| same, 4 KB writes | 50 | 75 | 67 | 100 | 51 | 50 |
| one key echo drawn | 16.7 | 16.7 | 16.7 | 16.7 | 8.3 | 8.3 |

- xterm.js draws 2000 lines in WebKit in 0.03 to 0.36 s, while the real page takes 25 s. Drawing is at most about 1.5% of it, so the WebKit terminal delay is not xterm.js. It is in the machine-to-page path or the machine itself.
- WebKit is slower only when the bytes come in many small writes (64 bytes: 1.4 s for 200 redraws against 0.07 s at 4 KB). Batching the panel's writes would help a little; it is not the main cause.
- WebGL does not help in WebKit, and headless Chromium's software WebGL is unusable with small writes.
- Kept: nothing changed (measurement only).

## Live site, wmn 0.1.9 (2026-11-02)

Redeployed with wmn 0.1.9 (P407 output fold, P409 no "runs on" pill, wide column, machine-files alerts), same settings. `tools/drive.mjs claude`, one browser at a time. Times from `claude` started:

| | Chromium | Firefox | WebKit |
|---|---|---|---|
| Claude Code prompt shows | 27 s | 45 s | 27 s |
| Answer after the question was asked | 20 s | 34 s | 202 s |
| Load average at start | 13 | 12 | 5 |

WebKit's answer took far longer than on 0.1.7 (84 s after the question was taken). This is a single run: not yet repeated or explained.

### Round 3 in the machine (Chromium, 2026-11-02 16:27)

`tools`-style debug page (`dbg2`, published with wmn 0.1.9), one page, 12 `claude -p "Reply with exactly: hi"` in a row with the chosen four settings plus the variant named, load average 23 to 26 (busy Mac), canary 666 ms. CPU columns are the guest's own `/proc/stat` (all of its time in the run); faults from `/proc/vmstat`.

| # | wall s | guest user s | guest sys s | guest idle s | page faults | major faults | variant |
|---|---|---|---|---|---|---|---|
| 1 | 54.7 | 43.3 | 9.7 | 0.8 | 11338 | 376 | chosen |
| 2 | 43.7 | 31.0 | 8.4 | 3.0 | 10813 | 366 | chosen |
| 3 | 38.7 | 30.4 | 5.4 | 2.0 | 10868 | 368 | + `DISABLE_AUTOUPDATER/TELEMETRY/ERROR_REPORTING=1` |
| 4 | 29.5 | 23.8 | 3.1 | 1.7 | 10732 | 369 | + `BUN_JSC_useConcurrentJIT=0` |
| 5 | 31.6 | 26.7 | 3.5 | 0.8 | 9469 | 365 | + `BUN_JSC_useConcurrentGC=0` |
| 6 | 31.2 | 26.5 | 3.4 | 0.8 | 10961 | 367 | + `BUN_JSC_thresholdForJITAfterWarmUp=2000 thresholdForJITSoon=2000` |
| 7 | 25.2 | 21.1 | 2.4 | 1.2 | 10772 | 366 | chosen |
| 8 | 23.9 | 19.8 | 2.4 | 0.9 | 10746 | 366 | + `DISABLE_*` |
| 9 | 26.2 | 21.3 | 3.0 | 1.3 | 10728 | 368 | + `useConcurrentJIT=0` |
| 10 | 27.1 | 22.5 | 3.1 | 1.0 | 9481 | 366 | + `useConcurrentGC=0` |
| 11 | 27.6 | 22.9 | 2.7 | 1.4 | 10920 | 367 | + JIT thresholds 2000 |
| 12 | 27.3 | 23.0 | 2.7 | 1.0 | 10981 | 366 | chosen, `--debug-file` |

- **Correction (see the cold-start check below):** the fall from 55 to 25 s across this page was mostly the Mac's load, not warm-up. Load was 26 at the start of the page and fell during it. Measured in fresh pages at lower load, a cold first run is 30 to 34 s and a second run 26.5 to 30 s. Warm-up is worth about 3 s.
- Guest system time does fall from the first to the later runs (9.7 to 2.4 s here, 3.9 to 4.4 s falling to 3.0 to 3.6 s below).
- None of the four variants is measurably better than the chosen settings: in the second round they fall within 24 to 28 s, inside the noise. Not kept.
- The vCPU is almost never idle (about 1 s in 25 to 55 s), even though the API wait natively is 2.7 s: the relay round trip overlaps with CPU work.
- Reading the 328 MB binary from the guest disk takes 1.36 s, and 1.19 s once it is cached. Faults during a run are about 11,000, with 370 major. Disk is not the bottleneck.
- Warm run timeline (`--debug-file`, run 12, 27 s), against native:
  - process start to first log line: about 9 s (native about 0.25 s)
  - to the API request: 16 s (native 0.14 s); setup() alone takes 2.3 s, and the gap after `installPluginsForHeadless` takes 6.3 s (native 46 ms)
  - API: 2.2 s
- Certificates: one load of 118 bundled certs, in about 0.6 s. With `bundled` they no longer load twice.

### Cold start and address randomisation (Chromium, 2026-11-02 22:37)

4 fresh pages one after another (each a new machine), 2 `claude -p "Reply with exactly: hi"` in each with the chosen settings, alternating normal and `setarch -R` (no address randomisation for `claude`), load average 4 to 16, canary 644 ms.

| Page | Run 1 (cold) s | Run 2 s | guest user s (1/2) | guest sys s (1/2) |
|---|---|---|---|---|
| normal 1 | 30.1 | 26.5 | 24.2 / 21.9 | 3.9 / 3.0 |
| `setarch -R` 1 | 31.1 | 29.9 | 25.5 / 25.3 | 4.4 / 3.6 |
| normal 2 | 29.9 | 28.5 | 24.2 / 23.2 | 4.1 / 3.2 |
| `setarch -R` 2 | 34.2 | 30.3 | 28.3 / 25.4 | 3.9 / 3.3 |

- **Warm-up is small.** The cold first run is 1.4 to 4 s slower than the second. A warm-up step or a warm snapshot could save at most those few seconds.
- **Address randomisation is not what limits reuse:** with it off, runs are not faster (slightly slower). Not kept.
- On a quiet Mac, `claude -p` in Chromium is about 30 s. About 24 s of it is guest user CPU (JavaScript running on the translated CPU), 3 to 4 s guest kernel and about 2.5 s the API. The emulated CPU is the cost; the lever is the translator's speed on this kind of code (a JavaScript engine with its own JIT), not settings.

### WebKit: the cause (2026-11-03 00:27)

`tools/drive.mjs diag` in Playwright WebKit (26.6), local site built with wmn 0.1.9, load average about 15, canary 644 ms. Alongside it, `footprint` of the page's WebContent process every 10 s ("JS JIT generated code").

| Step | WebKit, in the machine | Chromium (2026-11-01) |
|---|---|---|
| `claude --version` | 2.5 s | 1.3 s |
| `curl` through the relay (3 times) | 4.3, 3.6, 3.9 s | 2.7 to 3.3 s |
| `claude -p` | 72.9 s | 30 s (quiet Mac) |
| 2000 lines echoed in the Terminal | 24.8 s (timed inside the machine) | 3.5 s |

WebKit's JIT code for the page: 59 MB at the start of the run, 134 MB after 30 s, 246 MB after 60 s, 344 MB after 85 s (during `claude -p`). After that it stays flat at 344 to 346 MB to the end. That is the ceiling of WebKit's executable memory pool (wmd W32: about 343 MB of the 512 MiB pool). Past it, WebKit cannot compile the modules wmd's translator makes, so newly translated guest code runs at interpreter speed.

- **This is the WebKit cause.** Both slow steps (the end of `claude -p` and the whole 2000-line flood) ran after the pool was full. The flood is slow inside the machine (24.8 s timed by the guest's own clock), not in xterm.js, which draws the same 2000 lines in 0.03 to 0.36 s in WebKit (see "The terminal alone").
- wmd-web has a guard for exactly this (W34/D-445: a 144 MiB budget of live modules in WebKit, after which the guest drops its compiled blocks and starts again). It never fired: no "module budget reached" line in the console. The budget assumes about 2.1x module bytes of JSC code, and Claude Code's code (a JavaScript engine with its own JIT, about 47,000 modules in 2 minutes) evidently makes more per byte. A second run with the engine's live-module counters is under way.
- The fix belongs in wmd-web (`web/src/boot.js` budget, `web/src/host/jit.js`).

Second run with the engine's own counters added to the page's JIT log line (local build only), 2026-11-03 02:25, load about 10:

| Step | WebKit |
|---|---|
| `claude --version` | 1.8 s |
| `curl` (3 times) | 3.5, 3.0, 3.4 s |
| `claude -p` | 47.2 s |
| 2000 lines | 18.5 s |

| Page time | live module bytes (budget counts these) | modules | WebKit JIT code |
|---|---|---|---|
| 6 s | 13 MiB | 203 | 65 MB |
| 31 s | 70 MiB | 807 | about 140 MB |
| 41 s | 137 MiB | 1157 | about 190 to 250 MB |
| 46 s | budget reached at 144 MiB: one release (gen 1) | | |
| 56 to 111 s | 30 to 58 MiB (new generation) | 134 to 339 | 344 to 346 MB (pool full), never comes down |

- This time the budget did fire, once, at about 137 MiB of live modules (about 2.3 MB of WebKit code per MiB of module, close to the 2.1 the budget assumes).
- The pool still filled. After a release, WebKit gives the old code back only 30 to 40 s later (W32). Meanwhile the guest translates its hot code again at once, so new code meets a full pool and runs interpreted until the end.
- Levers to try: a higher compile threshold in WebKit (fewer, hotter blocks compiled, so the budget is reached later or never), and a lower budget (more room for the 30 to 40 s gap).

WebKit variants, 2026-11-03 08:34 to 08:44, one after another in fresh pages. Each changes one constant in the local build's `wmn-run.js` (wmd-web's `WEBKIT_JIT_THRESHOLD`, default 300, or `WEBKIT_CODE_BUDGET_MIB`, default 144); load average 7 to 28:

| Variant | `claude --version` | `curl` | `claude -p` | 2000 lines | functions compiled | modules | WebKit JIT code, max |
|---|---|---|---|---|---|---|---|
| threshold 1000 | 2.3 s | 7.9 / 5.3 / 6.3 s (load 28) | 59.7 s | 11.8 s | 18,908 | 18,908 | 363 MB (full) |
| budget 96 MiB | 2.1 s | 3.2 / 4.3 / 3.5 s | 41.9 s | 47.3 s | 47,404 | 1,578 (2 releases) | 346 MB (full) |
| threshold 3000 | 2.1 s | 6.6 / 4.8 / 5.8 s | 53.6 s | **8.0 s** | 10,235 | 10,235 | **210 MB** |
| default (300, 144 MiB) | 2.1 s | 3.6 / 4.4 / 3.7 s | 57.3 s | 31.7 s | 45,099 | 1,550 (1 release) | 345 MB (full) |

- Threshold 3000 is the only variant whose pool never fills, and its terminal flood is 4 times faster than the default.
- A lower budget is worse: it releases more often, and every release is followed by 30 to 40 s with old code still held.
- Above the default threshold every module holds one function. A hot block reaches its own compile trigger (4 times the threshold) before a batch fills, so each block gets its own module. Each such function costs WebKit about 20 KB of code (threshold 1000: 363 MB for 18,908). Fewer, larger modules would cost less.
- `claude -p` is within the load noise for all four. It runs much of its time either interpreted (high threshold) or with a full pool (default).


### WebKit: batched modules at threshold 3000 (D-505, 2026-11-03 22:01)

Cause: the batch-compile point `jit_hot` is fixed at 512 runs. With a compile threshold above 128, a block is already past 512 runs when it is queued, so it flushes a batch holding only itself. At threshold 3000, every block became its own module, at about 20 KB of WebKit code each. The fix in vm.wasm keeps `jit_hot` at least 4 times the threshold, so queued blocks batch again. Nothing changes at the default threshold of 50.

Method: two vm.wasm builds, both from the wmd-web pin 94fa04b, with the WebKit threshold set to 3000 in both:
- old: the engine's own vm.wasm, a1461dc2
- new: the pin plus the D-505 change, 9a0dde6b (wmd worktree `wt-jithot-pin`)

The example was published against each and run in Playwright WebKit with `drive.mjs diag`, one after the other on a quiet queue (load 5 to 7, canary 600 to 635 ms).

| vm.wasm | `claude --version` | `curl` x3 | `claude -p` | 2000 lines | blocks translated | modules | WebKit JIT code at the end |
|---|---|---|---|---|---|---|---|
| old (one block per module) | 2.7 s | 5.4 / 4.7 / 5.2 s | 48.7 s | 6.7 s | 10,066 | 10,066 | 186 MB |
| new (D-505) | 2.5 s | 5.2 / 4.4 / 5.2 s | 45.8 s | 6.5 s | 10,609 | 235 | **84 MB** |

- The same work in 43 times fewer modules, and less than half the WebKit code. The pool (about 345 MB) now has room for a long session.
- `diag` times are equal within noise: at threshold 3000 the old build's pool did not fill in `diag` either.
- Interactive `claude` with the new build: started at 28.6 s, question typed at 94 s, answer drawn at 126 s. JIT code peaked at 123 MB.
- The interactive runs of the old build (2026-11-03, 11:19 and 11:50) cannot be compared. Claude Code's account had hit its weekly usage limit, so the answer never came: one run hit the 30-minute limit, the other ended on the limit screen. In the 11:50 run, the old build's JIT code reached 259 MB while it waited.
- Kept: D-505 goes to wmd main, together with `WEBKIT_JIT_THRESHOLD` 3000 in wmd-web. Still to measure: interactive old vs new, once the account allows it and no release is running.
- Revised on 2026-11-04 (next section): 3000 doubles wmd-web's b8 build, so the threshold that landed is 1000.

### WebKit: choosing the threshold with D-505 (2026-11-04 18:48 to 19:02)

Method: wmd main plus D-505 (vm.wasm 551ac6d6), wmd-web's b8 `smp` test at 2 vCPUs in Playwright WebKit. Then the example, published with wmn 0.1.9 against the pin build with D-505 (9a0dde6b) and against wmn's stock engine (a1461dc2). Every run was alone on an empty boot-lock queue (wmn paused its work), load 3 to 10, canary 597 to 614 ms.

b8 build (C build of Lua inside the guest), seconds, 2 jobs / 1 job:

| vm.wasm | threshold 300 | 1000 | 3000 |
|---|---|---|---|
| D-505 | 21.2, 22.1 / 24.6, 24.8 | 25.5, 26.3 / 24.1, 24.8 | 40.6 / 32.3 |
| without D-505 | | | 49.0 / 42.4 |

Claude Code example in WebKit:

| Run | `claude -p` | 2000 lines | interactive answer | Claude Code's own time | WebKit JIT code, max |
|---|---|---|---|---|---|
| stock vm.wasm, threshold 300 (today's default) | 57.3 s (11-03) | 31.7 s (11-03) | 145.4 s | "Worked for 1m 3s" | 349 MB (pool full) |
| D-505, threshold 3000 (11-03) | 45.8 s | 6.5 s | 126 s | | 123 MB |
| D-505, threshold 1000 | **32.9 s** | **4.2 s** | **93.9 s** | "Crunched for 17s" | 220 MB |

- Both interactive answers came back; no usage-limit screen.
- Kept: D-505 with `WEBKIT_JIT_THRESHOLD` 1000. It is the fastest Claude Code variant and costs the b8 build about 4 s with 2 jobs and nothing with 1 job. Threshold 3000 doubles the build.
- Landed: wmd main 4e1b75a4; wmn moved its pin and shipped it in v0.1.31.

### Check on wmn 0.1.31 (2026-11-04 21:32 to 22:36)

The example was rebuilt with the v0.1.31 release binary and its engine (vm.wasm 551ac6d6; the published `wmn-run.js` holds threshold 1000) and driven with `drive.mjs` in each browser. These runs shared the machine with wmn's package checks (load 7 to 16), so they are a pass check, not a benchmark.

| Browser | `claude`: answer drawn | `block`: answer |
|---|---|---|
| Chromium | 90.5 s | 58.4 s |
| Firefox | 142.9 s | 97.1 s |
| WebKit | 100.7 s | 90.1 s |

All six answered; there was no usage-limit screen.

## Open

- Round 3, not run yet (stopped for low memory on the Mac): on top of the chosen settings, `--bare`, `CLAUDE_CODE_SIMPLE=1`, and `DISABLE_AUTOUPDATER=1 DISABLE_TELEMETRY=1 DISABLE_ERROR_REPORTING=1`. `--bare` and `CLAUDE_CODE_SIMPLE` skip hooks, LSP, plugin sync, auto-memory, background prefetches and keychain reads, and may turn off OAuth sign-in: use them only if `CLAUDE_CODE_OAUTH_TOKEN` still works and Claude Code keeps its full feature set.

- The 12 s bundle load at every start.
- WebKit terminal drawing: 2000 lines now take 4.2 s (was 31.7 s); small-write batching is still untried.
- Translator throughput on JIT-heavy JS: about 24 s of guest CPU for `claude -p` in Chromium, against 0.4 s natively.
- Real Safari: not measured for the example (wmn's own engine walk P276 passes in Safari 26.5.2 on v0.1.31).
