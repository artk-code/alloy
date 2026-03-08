# Alloy

Alloy is a multi-agent orchestration system for running `codex`, `gemini`, and `claude-code` against the same coding task, evaluating the results, and synthesizing a stronger final pull request with `jj`.

Current architecture note:
- The prototype is Alloy-native and Node-based.
- It is Symphony-inspired in workflow and demo UX, but it is not currently booting or embedding Symphony's Elixir runtime.
- That split is intentional for the MVP so the team can validate CLI orchestration, judging, and synthesis before deciding whether any Symphony code should be pulled in directly.

## Current POC Status

Working today:
- Alloy Control Panel web shell for task cards, provider readiness, run config, and candidate visibility
- primary demo card: tic-tac-toe perfect-play repair
- Markdown task brief parsing into canonical task JSON
- human-readable parsed task and evaluator summaries in the operator UI
- compare and synthesis guidance panels backed by evaluator and `jj` artifact data
- real per-candidate diff viewing in the operator UI from captured `jj` patches
- operator-controlled `run_config` with:
  - provider enable/disable
  - agent counts per provider
  - profile IDs
  - run transport selection (`pipe` vs `pty` where supported)
  - merge mode selection (`auto`, `hybrid`, `manual`)
- per-candidate workspace seeding and prompt packet generation
- persistent `SessionManager` records for candidate runs and login launches
- `jj` workspace bootstrap with per-candidate patch capture
- deterministic evaluation with winner vs synthesize recommendation output
- conservative synthesis workspace creation:
  - winner-only finalization
  - human file-select merge
- real verification commands against real demo repos
- fixture-backed replay integration tests that mutate a real workspace, capture a real `jj` patch, and pass the real verifier
- dry-run and live-run launch paths for `codex`, `gemini`, and `claude-code` from the web UI
- provider auth probes where the CLI exposes a reliable status command
- manual `Test Auth` launch flow for providers that still need operator confirmation

Not implemented yet:
- blind judge/composer layers
- `jj` cross-candidate rebase/split/squash shaping for the final stack
- final PR publishing

## Repository Contents

This repository currently contains:
- the implementation plan
- demo and operator experience specs
- setup guides
- task brief and GUI specs
- Symphony-inspired workflow notes and integration references
- adapter and runner notes
- runtime/auth architecture notes
- a working Node scaffold for `task brief -> run config -> prompt packet -> session-backed candidate run`
- the Alloy Control Panel for task cards, provider readiness, run config, evaluator summaries, and candidate/session visibility

Core planning docs:
- `IMPLEMENTATION_PLAN.md`
- `docs/CURRENT_STATE.md`
- `docs/DEMO_AND_OPERATOR_EXPERIENCE.md`
- `docs/RUNTIME_AND_AUTH_ARCHITECTURE.md`
- `docs/JJ_AND_EVALUATION.md`
- `docs/TWO_WEEK_BUILD_ORDER.md`
- `docs/MILESTONE_CHECKLIST.md`
- `docs/SYMPHONY_FORK_VS_BUILD_FRESH.md`

## Quick Start

Requirements:
- Node.js 24 LTS

Install and inspect provider readiness:

```bash
npm test
npm run doctor
```

Prepare the primary demo task:

```bash
npm run task:prepare
npm run task:run:dry
```

Launch the Alloy Control Panel:

```bash
npm run web
```

Repair provider login interactively if needed:

```bash
npm run login:codex
npm run login:gemini
npm run login:claude
```

## Primary Demo Repo

The default demo is an intentionally broken tic-tac-toe engine under `samples/repos/tic-tac-toe`.

Its acceptance checks are real:
- `npm test`
- `node scripts/eval-perfect-play.mjs`

Before any fix, the repo fails both human-readable unit tests and the exhaustive perfect-play evaluator.

Current automated proof level:
- the seeded demo repo is genuinely broken at baseline
- the integration test replays a stored perfect-play fix artifact into a real candidate workspace
- Alloy then runs the real acceptance checks, captures the real `jj` diff, and scores the result deterministically
- automated tests do not yet prove live Codex, Gemini, or Claude Code authoring end to end

## Current Scaffold Outputs

For a given task brief, the scaffold generates:
- `task/task.json`
- `task/source.task.md`
- `prompt-packets/*.json`
- `prompt-packets/*.md`
- `candidates/*/manifest.json`
- `events/run-events.jsonl`
- `synthesis/*/manifest.json`
- per-candidate workspaces, logs, and artifact directories
- persistent session records under `runtime/sessions` or a run-scoped session root

## Provider Auth Note

Alloy is CLI-first and subscription-login-first.

- `doctor` reports install state, transport capability, and login guidance
- Codex and Claude Code use official CLI status commands for auth probing
- Gemini is always treated as manual verification through the `Test Auth` button
- `login <provider>` launches the provider's interactive login entrypoint for human repair

## Runtime Note

The current `SessionManager` supports:
- `pipe` transport for non-interactive candidate runs
- `pty` transport through the system `script` utility where available
- persisted session records, event logs, stdout/stderr logs, and exit status

This is enough for the first CLI-orchestrated demo slice without introducing a separate PTY dependency yet.
