# macOS Setup Guide

Status: Draft
Audience: Engineers and future agents preparing a local development machine or runner host for Alloy.

This guide reflects the current architecture plan: Alloy orchestrates external tools rather than bundling provider CLIs into the product itself.

## 1. Scope

This guide prepares a macOS machine to run:
- Git
- Node.js and npm
- `jj`
- `codex`
- `claude` for Claude Code
- `gemini`

It does not yet install Alloy itself because the application bootstrap is still in planning.

## 2. Recommended Baseline

- macOS with current security updates applied
- Xcode Command Line Tools installed
- Homebrew installed
- Node.js 20 or newer
- Git available on `PATH`
- one active web-authenticated account for each provider CLI you intend to use

## 3. Install Core Tooling

### 3.1 Xcode Command Line Tools

```bash
xcode-select --install
```

### 3.2 Homebrew

Install Homebrew using the official instructions if it is not already present.

Validation:

```bash
brew --version
```

### 3.3 Git

macOS usually ships with Git after Xcode Command Line Tools are installed.

Validation:

```bash
git --version
```

### 3.4 Node.js

Use Homebrew or another officially supported Node installer. Alloy should standardize on Node 20 or newer because provider CLIs commonly depend on modern Node runtimes.

Example with Homebrew:

```bash
brew install node
node --version
npm --version
```

### 3.5 Jujutsu

Install `jj` using Homebrew or the official project instructions.

Example:

```bash
brew install jj
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

Alternative Homebrew path may also exist in current upstream docs.

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
- Homebrew

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

## 8. Recommended macOS Conventions

- use Homebrew-managed installs where possible
- avoid `sudo npm install -g`
- keep provider CLIs updated conservatively and pin supported versions in project docs
- separate personal shell customizations from runner automation accounts
- use a dedicated runner user for unattended execution if this moves beyond local experimentation

## 9. Known Caveats

- provider login sessions may expire and should be checked before task execution
- proprietary tools such as Claude Code must remain external dependencies
- Homebrew paths differ between Apple Silicon and Intel Macs; ensure `PATH` is correct
- non-interactive automation may still require PTY wrapping even when interactive login is complete

## 10. Official References

- Jujutsu install docs: https://docs.jj-vcs.dev/latest/install-and-setup/
- OpenAI Codex CLI repo: https://github.com/openai/codex
- Claude Code quickstart: https://code.claude.com/docs/en/quickstart
- Gemini CLI repo: https://github.com/google-gemini/gemini-cli
