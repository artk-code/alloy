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
- operator-controlled `run_config` with:
  - provider enable/disable
  - agent counts per provider
  - profile IDs
  - run transport selection (`pipe` vs `pty` where supported)
- per-candidate workspace seeding and prompt packet generation
- persistent `SessionManager` records for candidate runs and login launches
- `jj` workspace bootstrap with per-candidate patch capture
- deterministic evaluation with winner vs synthesize recommendation output
- real verification commands against real demo repos
- dry-run orchestration for `codex`, `gemini`, and `claude-code`

Not implemented yet:
- live provider execution through the real installed CLIs from the web UI
- blind judging and synthesis
- `jj`-backed change shaping and final PR publishing

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
- `docs/DEMO_AND_OPERATOR_EXPERIENCE.md`
- `docs/RUNTIME_AND_AUTH_ARCHITECTURE.md`
- `docs/JJ_AND_EVALUATION.md`
- `docs/TWO_WEEK_BUILD_ORDER.md`
- `docs/MILESTONE_CHECKLIST.md`
- `docs/SYMPHONY_FORK_VS_BUILD_FRESH.md`

## Quick Start

Requirements:
- Node.js 20+

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

## Current Scaffold Outputs

For a given task brief, the scaffold generates:
- `task/task.json`
- `task/source.task.md`
- `prompt-packets/*.json`
- `prompt-packets/*.md`
- `candidates/*/manifest.json`
- `events/run-events.jsonl`
- per-candidate workspaces, logs, and artifact directories
- persistent session records under `runtime/sessions` or a run-scoped session root

## Provider Auth Note

Alloy is CLI-first and subscription-login-first.

- `doctor` reports install state, transport capability, and login guidance
- login status is currently treated conservatively as `unknown` unless a provider exposes a reliable machine-checkable signal
- `login <provider>` launches the provider's interactive login entrypoint for human repair

## Runtime Note

The current `SessionManager` supports:
- `pipe` transport for non-interactive candidate runs
- `pty` transport through the system `script` utility where available
- persisted session records, event logs, stdout/stderr logs, and exit status

This is enough for the first CLI-orchestrated demo slice without introducing a separate PTY dependency yet.
