# Ubuntu And Linux Setup Guide

Status: Active reference
Audience: Engineers and future agents preparing a local development machine or runner host for Alloy.

This guide reflects the current Alloy implementation: the product orchestrates external CLIs rather than bundling provider tools into the repo.

## 1. Scope

This guide prepares an Ubuntu-first Linux machine to run:
- Git
- Node.js LTS
- `corepack`
- `pnpm`
- `jj`
- `codex`
- `claude`
- `gemini`

Ubuntu or Debian-like systems are the first documented Linux target.

## 2. Baseline

Recommended baseline:
- current Ubuntu or Debian-like distribution with security updates applied
- `curl`, `git`, and build tools installed
- one active web-authenticated account for each provider CLI you intend to use

## 3. Install Core Tooling

### 3.1 Base Packages

Example for Ubuntu/Debian:

```bash
sudo apt-get update
sudo apt-get install -y curl git ca-certificates build-essential xz-utils
```

Validation:

```bash
git --version
curl --version
```

### 3.2 Recommended Node.js LTS Install For Ubuntu

Do not rely on Ubuntu's default `apt` Node package if you want the current LTS line.

As of March 8, 2026, the Node.js LTS line is `24.x`. The cleanest way to get the exact current LTS on Ubuntu is the official Node.js Linux binary tarball.

Example for `x64` Linux:

```bash
cd /tmp
curl -fsSLO https://nodejs.org/dist/latest-v24.x/node-v24.13.1-linux-x64.tar.xz
sudo mkdir -p /opt/node-v24.13.1
sudo tar -xJf node-v24.13.1-linux-x64.tar.xz -C /opt/node-v24.13.1 --strip-components=1
echo 'export PATH="/opt/node-v24.13.1/bin:$PATH"' >> ~/.profile
source ~/.profile
```

If you are on `arm64`, use the matching `linux-arm64` tarball from the Node.js download page instead.

Then enable `corepack` and activate `pnpm`:

```bash
node --version
corepack enable
corepack prepare pnpm@latest --activate
pnpm setup
```

After `pnpm setup`, reload your shell so `PNPM_HOME` is on `PATH`.

Validation:

```bash
node --version
corepack --version
pnpm --version
```

### 3.3 Alternative Ubuntu Path: NodeSource Repo

If you prefer repo-managed updates instead of the official tarball, use the current NodeSource major-line repo for the active LTS major. That is still better than Ubuntu's default `apt` package for current LTS work.

Example pattern for Node 24:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version
```

Use this only if you are comfortable trusting the NodeSource repository for system package management.

### 3.4 Jujutsu

Install `jj` using the official project instructions, Homebrew on Linux, or another supported package path for the target distro.

Validation:

```bash
jj --version
```

## 4. Install Provider CLIs

Alloy should invoke provider CLIs as external tools. Do not bundle them into the product.

Preferred Linux pattern:
- install Node correctly first
- enable `corepack`
- use `pnpm add -g ...` for provider CLIs
- avoid `sudo`

### 4.1 Codex CLI

```bash
pnpm add -g @openai/codex
codex --version
```

### 4.2 Claude Code

Claude Code is a proprietary external tool. It must remain an external dependency.

```bash
pnpm add -g @anthropic-ai/claude-code
claude --version
```

If Anthropic changes the official package path, follow the upstream docs but keep `claude` external to Alloy.

### 4.3 Gemini CLI

```bash
pnpm add -g @google/gemini-cli
gemini --version
```

## 5. Authenticate CLIs

Current project scope expects these CLIs to authenticate through interactive web-account flows rather than API-key billing.

### 5.1 Codex

```bash
codex
```

Then complete the ChatGPT login flow in the browser.

### 5.2 Claude Code

```bash
claude
```

Then complete the Claude login flow using the correct subscription or organizational account.

### 5.3 Gemini CLI

```bash
gemini
```

Then complete the Google login flow.

## 6. Validation Checklist

Run these commands and confirm they succeed:

```bash
git --version
node --version
corepack --version
pnpm --version
jj --version
codex --version
claude --version
gemini --version
```

Then run Alloy's current preflight:

```bash
npm run doctor
```

## 7. Alloy Runner Preflight Requirements

A healthy local runner should have:
- Git available
- Node LTS available
- `corepack` enabled
- `pnpm` available on `PATH`
- `jj` available
- provider CLIs available
- provider login sessions repaired before live runs

## 8. Recommended Linux Conventions

- prefer distro package management for base tools and `corepack` + `pnpm` for Node-based CLIs
- avoid running provider CLIs as root
- avoid mixing `npm -g` and `pnpm -g` unless you are very clear about shell precedence
- use a dedicated runner user for unattended execution
- mount workspaces on sufficiently fast local storage, not slow network shares

## 9. Known Caveats

- browser-based login may require a desktop session or device-flow equivalent depending on CLI behavior
- provider login sessions may expire and should be checked before task execution
- proprietary tools such as Claude Code must remain external dependencies
- `pnpm setup` modifies shell startup files; reload the shell before expecting global binaries to resolve
- the exact Node tarball version will move over time; always check the Node.js download page before copying a pinned URL
- non-interactive automation may still require PTY wrapping even when interactive login is complete

## 10. Official References

- Node.js download page: https://nodejs.org/en/download
- Node.js release index: https://nodejs.org/dist/latest-v24.x/
- NodeSource distributions repo: https://github.com/nodesource/distributions
- Jujutsu install docs: https://docs.jj-vcs.dev/latest/install-and-setup/
- OpenAI Codex CLI repo: https://github.com/openai/codex
- Claude Code quickstart: https://code.claude.com/docs/en/quickstart
- Gemini CLI repo: https://github.com/google-gemini/gemini-cli
