# macOS Setup Guide

Status: Active reference
Audience: Engineers and future agents preparing a local development machine or runner host for Alloy.

This guide reflects the current Alloy implementation: the product orchestrates external CLIs rather than bundling provider tools into the repo.

## 1. Scope

This guide prepares a macOS machine to run:
- Git
- Node.js LTS
- `corepack`
- `pnpm`
- `jj`
- `codex`
- `claude`
- `gemini`

## 2. Baseline

Recommended baseline:
- current macOS with security updates applied
- Xcode Command Line Tools installed
- Homebrew installed
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

macOS usually ships with Git once Xcode Command Line Tools are installed.

Validation:

```bash
git --version
```

### 3.4 Node.js LTS Through Homebrew

As of March 8, 2026, the Node.js LTS line is `24.x`, and Homebrew exposes it as `node@24`.

Install it explicitly instead of the unversioned `node` formula so the machine stays on LTS.

```bash
brew install node@24
```

Because `node@24` is keg-only, add it to your shell path.

Apple Silicon:

```bash
echo 'export PATH="/opt/homebrew/opt/node@24/bin:$PATH"' >> ~/.zprofile
source ~/.zprofile
```

Intel Mac:

```bash
echo 'export PATH="/usr/local/opt/node@24/bin:$PATH"' >> ~/.zprofile
source ~/.zprofile
```

Then enable `corepack` and activate `pnpm`:

```bash
node --version
corepack enable
corepack prepare pnpm@latest --activate
pnpm setup
```

After `pnpm setup`, reload your shell if it modifies startup files.

Validation:

```bash
node --version
corepack --version
pnpm --version
```

### 3.5 Jujutsu

Install `jj` using Homebrew or the official project instructions.

```bash
brew install jj
jj --version
```

## 4. Install Provider CLIs

Alloy should invoke provider CLIs as external tools. Do not bundle them into the product.

Preferred pattern on macOS:
- use Homebrew for base packages
- use `corepack` to manage `pnpm`
- use `pnpm add -g ...` for Node-based provider CLIs
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

If Anthropic changes the official package path, follow the upstream docs and keep Alloy treating `claude` as an external binary.

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

## 8. Recommended macOS Conventions

- prefer Homebrew for base packages and `corepack` + `pnpm` for Node-based CLIs
- avoid `sudo npm install -g`
- avoid mixing `npm -g` and `pnpm -g` on the same machine unless you are very clear about precedence on `PATH`
- keep provider CLIs updated conservatively and pin supported versions in project docs
- use a dedicated runner user for unattended execution if this moves beyond local experimentation

## 9. Known Caveats

- provider login sessions may expire and should be checked before task execution
- proprietary tools such as Claude Code must remain external dependencies
- Homebrew paths differ between Apple Silicon and Intel Macs; ensure your shell exports the correct `PATH`
- `pnpm setup` modifies shell startup files; reload the shell before expecting global binaries to resolve
- non-interactive automation may still require PTY wrapping even when interactive login is complete

## 10. Official References

- Homebrew install docs: https://brew.sh/
- Homebrew `node@24` formula: https://formulae.brew.sh/formula/node@24
- Node.js download page: https://nodejs.org/en/download
- Jujutsu install docs: https://docs.jj-vcs.dev/latest/install-and-setup/
- OpenAI Codex CLI repo: https://github.com/openai/codex
- Claude Code quickstart: https://code.claude.com/docs/en/quickstart
- Gemini CLI repo: https://github.com/google-gemini/gemini-cli
