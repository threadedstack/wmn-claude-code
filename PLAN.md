# Claude Code in the browser: spec and plan

## Goal

Open a web page, start a Linux machine in the tab (wmd-web, WebAssembly) from a Docker image that has Claude Code installed, and use Claude Code interactively from that page. Every outbound connection from the machine (Claude's API) goes through the relay. Nothing in the wmn or wmd repositories changes.

## What is already proven (2026-11-01, Chromium, local copy of the site)

- `chatwork/claude-code:2.1.316` (Debian bookworm, Claude Code installed by Anthropic's install script, linux/arm64) is baked into the site by `wmn publish --runnable` (released wmn 0.1.4): 420 MB image, 532 MB engine, 58 MB base snapshot.
- The machine boots in about 6 s; `uname -m` prints `aarch64` and `claude --version` prints `2.1.316 (Claude Code)`.
- The page's Terminal panel opens a shell in the same machine; `claude` starts and shows its first-run screens.
- Not yet proven: a prompt answered by Claude's API through the relay (the run stopped at the trust prompt).

## Design

| Piece | Choice | Why |
|---|---|---|
| Image | `chatwork/claude-code:2.1.316` (pinned) | Public, arm64 (the browser machine is linux/arm64), current Claude Code, plain official install. Nothing to build or push. |
| Page | one wmn document, `index.wmn.md`, published with `wmn publish --runnable` | Uses wmn's existing runnable pages: run blocks, Terminal panel, relay wiring. |
| Network | the public relay `wss://relay.threadedstack.com` (the page's default) | Accepts pages from any origin; carries TLS bytes it cannot read. |
| Sign-in | the reader types the token into `read -rs` in the terminal | The token never appears on screen and never sits in the page or the site. |
| Serving | `serve.ts`: a static server that sends COOP/COEP/CORP | The machine needs cross-origin isolation. |

## Steps

1. Notebook (`notebook/index.wmn.md`, the only folder published): version check block; terminal instructions with `read -rs CLAUDE_CODE_OAUTH_TOKEN`; a `claude -p` block that reads the token from a 0600 file the terminal writes.
2. `build.sh`: publish the site with the wmn binary (PATH or `WMN_BIN`) to `../wmn-claude-code-site`.
3. `serve.ts` and `README.md`: build, serve, open, use.
4. Prove it: a browser driver (kept outside the repo) runs the version block, opens the terminal, types the Claude Code token without echo, accepts the trust prompt, asks a question, and waits for Claude's answer. Chromium first, then Firefox and WebKit. Every log is scanned for the token before it is read.
5. Hand over: the command to build and serve, and the URL to open.

## Not in scope

- Changes to wmn or wmd code.
- A public deploy of the site (outward-facing; asked for separately).
