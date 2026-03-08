# Linux Setup Guide

Status: Draft
Audience: Engineers and future agents preparing a local development machine or runner host for Alloy.

This guide reflects the current architecture plan: Alloy orchestrates external tools rather than bundling provider CLIs into the product itself.

## 1. Scope

This guide prepares a Linux machine to run:
- Git
- Node.js and npm
- `jj`
- `codex`
- `claude` for Claude Code
- `gemini`

It does not yet install Alloy itself because the application bootstrap is still in planning.

## 2. Recommended Baseline

- a current Linux distribution with security updates applied
- build tools and `curl` installed
- Node.js 20 or newer
- Git available on `PATH`
- one active web-authenticated account for each provider CLI you intend to use

Ubuntu or Debian-like systems are a reasonable first target for documented support.

## 3. Install Core Tooling

### 3.1 Base Packages

Example for Ubuntu/Debian:

```bash
sudo apt-get update
sudo apt-get install -y curl git ca-certificates build-essential
```

Validation:

```bash
git --version
curl --version
```

### 3.2 Node.js

Use an officially supported Node distribution path for your distro. Alloy should standardize on Node 20 or newer because provider CLIs commonly depend on modern Node runtimes.

Validation:

```bash
node --version
npm --version
```

### 3.3 Jujutsu

Install `jj` using the official project instructions, Homebrew on Linux, or a supported package path for the target distro.

Validation:

```bash
jj --version
```

## 4. Install Provider CLIs

Alloy should invoke provider CLIs as external tools. Do not bundle them into the product.

### 4.1 Codex CLI

Preferred options:
- official package manager install
- official binary install

Common npm-based install:

```bash
npm install -g @openai/codex
codex --version
```

### 4.2 Claude Code

Claude Code is a proprietary external tool. It must not be vendored or redistributed by Alloy.

Common install paths in official docs include:
- npm global install
- official installer script

Example npm-based install:

```bash
npm install -g @anthropic-ai/claude-code
claude --version
```

### 4.3 Gemini CLI

Common install paths in official docs include:
- npm global install
- Homebrew on Linux

Example npm-based install:

```bash
npm install -g @google/gemini-cli
gemini --version
```

## 5. Authenticate CLIs

Current project scope expects these CLIs to authenticate through interactive web-account flows rather than API-key billing. Future API-backed adapters may be added later, but they are not part of MVP or the first demo.

### 5.1 Codex

Run:

```bash
codex
```

Then complete the ChatGPT login flow in the browser.

### 5.2 Claude Code

Run:

```bash
claude
```

Then complete the Claude login flow using the appropriate subscription or organizational account.

### 5.3 Gemini CLI

Run:

```bash
gemini
```

Then complete the Google login flow.

## 6. Validation Checklist

Run these commands and confirm they succeed:

```bash
git --version
node --version
npm --version
jj --version
codex --version
claude --version
gemini --version
```

Then confirm each provider can enter an authenticated session.

## 7. Alloy Runner Preflight Requirements

A future `alloy doctor` or bootstrap script should verify:
- Git available
- Node available
- `jj` available
- provider CLIs available
- writable workspace root configured
- provider login sessions valid
- GitHub credentials available if PR publishing is enabled

## 8. Recommended Linux Conventions

- use a dedicated runner user for unattended execution
- keep provider CLIs updated conservatively and pin supported versions in project docs
- avoid running provider CLIs as root
- use distro-specific service management only after the core orchestrator is stable
- mount workspaces on sufficiently fast local storage, not slow network shares

## 9. Known Caveats

- browser-based login may require a desktop session or device-flow equivalent depending on CLI behavior
- provider login sessions may expire and should be checked before task execution
- proprietary tools such as Claude Code must remain external dependencies
- npm global installs may land in different paths depending on distro and Node installation method
- non-interactive automation may still require PTY wrapping even when interactive login is complete

## 10. Official References

- Jujutsu install docs: https://docs.jj-vcs.dev/latest/install-and-setup/
- OpenAI Codex CLI repo: https://github.com/openai/codex
- Claude Code quickstart: https://code.claude.com/docs/en/quickstart
- Gemini CLI repo: https://github.com/google-gemini/gemini-cli
