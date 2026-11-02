---
title: Claude Code in your browser
image: chatwork/claude-code:2.1.316
memory: 1536
---

# Claude Code in your browser

This page runs [Claude Code](https://code.claude.com/docs/en/overview) in a Linux machine inside your browser tab. The machine is compiled to WebAssembly (wmd-web) and starts from the Docker image `chatwork/claude-code:2.1.316`: Debian bookworm with Claude Code installed by Anthropic's install script. Nothing runs on a server. The machine reaches the internet, including Claude's API, through the relay. The relay carries encrypted TLS traffic and cannot read it.

## 1. Start the machine

Press **Run**. The first run starts the machine. The block also writes Claude Code's settings file, `~/.claude.json`, marking the first-run setup as done and trusting the home folder, so `claude` opens straight to its prompt. It leaves a settings file that already records the setup as done. It also writes four settings to `~/.claude-env`, which `~/.bashrc` loads, that make Claude Code start faster in this machine: only Claude Code's own CA certificates, no non-essential network traffic, and the JavaScript engine's two top compilers off (their code is costly to translate in a WebAssembly machine).

```sh {#version}
grep -qs hasCompletedOnboarding ~/.claude.json || cat > ~/.claude.json <<EOF
{
  "hasCompletedOnboarding": true,
  "theme": "dark",
  "projects": { "$HOME": { "hasTrustDialogAccepted": true, "hasCompletedProjectOnboarding": true } }
}
EOF
echo 'export CLAUDE_CODE_CERT_STORE=bundled CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 BUN_JSC_useDFGJIT=0 BUN_JSC_useFTLJIT=0' > ~/.claude-env
grep -qs claude-env ~/.bashrc || echo '. ~/.claude-env' >> ~/.bashrc
uname -m
claude --version
```

## 2. Sign in and start Claude Code

Open **Terminal** at the top of the page and press **New terminal**. It is a shell in the same machine. Run this line, then paste your token and press Enter. Nothing shows while you paste:

```text
read -rs CLAUDE_CODE_OAUTH_TOKEN && export CLAUDE_CODE_OAUTH_TOKEN
```

Then start Claude Code:

```text
cd ~ && claude
```

To make a token, run `claude setup-token` on a computer where Claude Code is installed. An Anthropic API key works too: use `ANTHROPIC_API_KEY` in place of `CLAUDE_CODE_OAUTH_TOKEN`. The token stays in the machine in your tab. When you close the tab, the machine and everything in it are gone.

## 3. Ask from a block

Blocks run in their own shell, so they do not see the terminal's variables. To let this block use your token, first run this in the terminal (it writes a file only you can read):

```text
(umask 077; printf %s "$CLAUDE_CODE_OAUTH_TOKEN" > ~/.claude-token)
```

```sh {#ask}
. ~/.claude-env
export CLAUDE_CODE_OAUTH_TOKEN="$(cat ~/.claude-token)"
cd ~ && claude -p "Run uname -a and tell me in one sentence what machine you are on." --allowedTools "Bash(uname:*)"
```
