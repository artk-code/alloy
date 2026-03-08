# Alloy Auth And Login UX

Status: Draft
Authoring date: March 8, 2026
Purpose: Define how Alloy handles non-API, browser-based HTTPS authentication for Codex, Claude Code, and Gemini, and how the web UI should present login state and recovery actions to humans.

## 1. Requirement

Alloy's first demo and MVP should prioritize subscription-authenticated CLI use over direct API-key billing.

That means Alloy must support:
- browser or OAuth-style login flows launched from official provider CLIs
- clear provider login status in the operator UI
- a human-recoverable login path when a provider session is missing, expired, or unknown

## 2. Product Rule

The system should never pretend a provider is authenticated when it cannot verify that confidently.

Allowed auth states:
- `valid`
- `invalid`
- `unknown`
- `not_installed`

For MVP, `unknown` is an acceptable honest state when a provider offers no stable machine-readable auth-status command.

## 3. Provider Auth Model

### Codex
- auth approach: interactive ChatGPT sign-in launched from CLI
- expected human flow: run `codex`, then complete browser-based sign-in if prompted
- Alloy automation status: install can be checked automatically, auth validity may be `unknown` unless a stronger official status command is adopted later

### Claude Code
- auth approach: interactive browser-based login from Claude Code
- expected human flow: run `claude`, then run `/login` inside the session if needed
- Alloy automation status: install can be checked automatically, auth validity may be `unknown` unless a stronger official status command is adopted later

### Gemini CLI
- auth approach: interactive Google login launched from CLI
- expected human flow: run `gemini`, then choose Login with Google when prompted
- Alloy automation status: install can be checked automatically, auth validity may be `unknown` unless a stronger official status command is adopted later

## 4. Backend Contract

The provider health endpoint should return, per provider:
- installed
- auth_status
- auth_flow
- login_command
- login_instructions
- docs URL
- version if detectable

This gives the GUI enough information to guide a human even when auth cannot be fully validated automatically.

## 5. GUI Requirements

The web GUI should show a provider auth panel before any run starts.

Each provider row should show:
- provider name
- installed or missing
- auth state: valid, invalid, unknown
- version if known
- action button: Login, Retry Check, or Install Docs

Recommended display behavior:
- `valid`: green state, run allowed
- `invalid`: red state, run blocked unless operator overrides
- `unknown`: amber state, run allowed with warning for local demos, but prompt user to confirm
- `not_installed`: red state, run blocked

## 6. Login Recovery UX

When a provider is not valid:
- the GUI should offer an `Open Login` action
- that action should launch an interactive PTY-backed provider session using the provider's official CLI entrypoint
- the GUI should present provider-specific instructions next to the terminal
- after the human finishes, the GUI should let them re-run provider health checks

## 7. Recommended UI Pattern

Use a preflight modal or side panel before run launch.

Suggested sections:
- Provider Install Status
- Provider Login Status
- Open Login Actions
- Recheck Status
- Launch Blocking Reasons

This avoids confusing run failures later when auth was already broken at launch time.

## 8. Command Surface

Alloy CLI should support:
- `doctor` to inspect provider availability
- `login <provider>` to launch interactive login shell for that provider

The web GUI can later call the same backend orchestration logic through a PTY service.

## 9. Human-Facing Language

Do not tell the user:
- "authentication failed" with no remedy
- "provider unavailable" without explanation

Do tell the user:
- what Alloy checked
- whether the login state is confidently valid or merely unknown
- what command will be launched for login repair
- what the user should do next

## 10. Definition Of Success

This subsystem is successful when a human can open Alloy, see whether Codex, Claude Code, and Gemini are ready, launch a provider login flow if needed, re-check status, and understand why a run is allowed or blocked.
