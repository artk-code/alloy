# Alloy

Alloy is a multi-agent orchestration system for running `codex`, `gemini`, and `claude-code` against the same coding task, evaluating the results, and synthesizing a stronger final pull request with `jj`.

Current architecture note:
- The prototype is Alloy-native and Node-based.
- The current product flow is:

```text
Queue  ->  Tasks  ->  Review
monitor    author     diff / merge / publish
run work   import     inspect provenance
```

- `Queue` only shows tasks that are actually queued in `runtime/task-queue.json`.
- `Tasks` is the task catalog and task setup surface.
- `Review` is the merge, blind-review, and publication surface.

## Current POC Status

Working today:
- Queue web shell for project-labeled queued tasks, provider readiness, run config, and candidate visibility
- dedicated `Tasks` for structured task setup, source generation/import, parsed task review, and candidate detail
- dedicated `Review` view for candidate review, synthesis, blind review, and publication
- primary demo card: tic-tac-toe perfect-play repair
- fast smoke demo card: FizzBuzz CLI
- fast algo demo card: Roman Numerals
- additional runnable security demo card: SQL injection remediation + writeup
- board project filter and grouping controls
- board pagination and cards-per-page controls
- direct task-card selection that focuses the selected task and syncs task context into the URL
- compact Queue plus separate Tasks and Review surfaces
- collapsible/tabbed operator sections for dense task detail views
- native markdown rendering for task briefs and docs
- structured Task Setup with template-driven task generation for:
  - new projects
  - existing repos
  - security repairs
- task creation from guided fields, pasted markdown, or imported markdown files in `Tasks`
- first-class demo scenario loading in `Tasks`
- dedicated in-app docs page for operator guidance
- Markdown task brief parsing into canonical task JSON
- human-readable parsed task and evaluator summaries in the operator UI
- compare and synthesis guidance panels backed by evaluator and `jj` artifact data
- first-class judge rationale artifact and UI summaries for winner/synthesis decisions
- real per-candidate diff viewing in the operator UI from captured `jj` patches
- explicit per-file merge provenance in the operator UI
- synthesized diff summaries with contested/manual-override cues and publication-readiness status
- publication preview and approval state in `Review`
- publication push state in `Review`
- blind-review consensus and disagreement gating for publication in `Review`
- target-by-target local testing from `Review` with visible validation commands
- run provenance labeling in the UI so cards distinguish:
  - command previews
  - live CLI runs
  - fixture replays
  - legacy artifacts
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
- review-oriented `jj` stack shaping for synthesized results
  - split
  - rebase
  - squash helper support for later cleanup flows
- real verification commands against real demo repos
- fixture-backed replay integration tests that mutate a real workspace, capture a real `jj` patch, and pass the real verifier
- dry-run and live-run launch paths for `codex`, `gemini`, and `claude-code` from the web UI
- provider auth probes where the CLI exposes a reliable status command
- manual `Test Auth` launch flow for providers that still need operator confirmation
- honest board/detail outcome states instead of generic completion labels
- honest board/detail provenance labels instead of implying that every passing artifact came from a live provider run

Not implemented yet:
- blind-review recommendation consumption in merge-plan or synthesis selection before publication
- a fully hardened structured task editor and import path for non-expert users
- final PR publishing
- persisted project-level dashboards and saved board preferences

## Repository Contents

This repository currently contains:
- the implementation plan
- demo and operator experience specs
- setup guides
- task brief and GUI specs
- current queue/tasks/review workflow notes
- adapter and runner notes
- runtime/auth architecture notes
- a working Node scaffold for `task brief -> run config -> prompt packet -> session-backed candidate run`
- the Queue surface for queued work, provider readiness, run config, evaluator summaries, and candidate/session visibility

Core planning docs:
- `IMPLEMENTATION_PLAN.md`
- `docs/CURRENT_STATE.md`
- `docs/DEMO_AND_OPERATOR_EXPERIENCE.md`
- `docs/EVAL_PROJECT_CATALOG.md`
- `docs/RUNTIME_AND_AUTH_ARCHITECTURE.md`
- `docs/JJ_AND_EVALUATION.md`
- `docs/PUBLICATION_FLOW_PLAN.md`
- `docs/TWO_WEEK_BUILD_ORDER.md`
- `docs/MILESTONE_CHECKLIST.md`
- `docs/NEXT_SESSION.md`

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

Launch the Alloy web UI:

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

Important UI honesty note:
- older run artifacts can still exist under `runs/`
- Alloy now flags replay-backed or legacy artifacts explicitly in the board/detail views instead of presenting them as live provider proof

Current task-authoring limitation:
- custom tasks are still stored as markdown files under `samples/tasks`
- `Tasks` can now generate those files from guided fields, open demo scenarios, or import trusted markdown from disk
- importing arbitrary markdown is not yet a hardened security path; only import trusted local files you understand

## Current Scaffold Outputs

For a given task brief, the scaffold generates:
- `project_id` / `project_label` metadata throughout the run record
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
