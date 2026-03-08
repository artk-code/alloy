# Alloy

Alloy is a multi-agent orchestration system for running `codex`, `gemini`, and `claude-code` against the same coding task, evaluating the results, and synthesizing a stronger final pull request with `jj`.

This repository currently contains:
- the implementation plan
- demo and operator experience specs
- setup guides
- task brief and GUI specs
- Symphony manager integration notes
- 2-week build order and milestone checklist
- Symphony fork-vs-build-fresh decision notes
- adapter and runner notes
- a no-dependency Node scaffold for `task brief -> prompt packet -> candidate run artifacts`
- a first runner slice for `doctor -> prepare -> run -> live JSONL events`

Core planning docs:
- `IMPLEMENTATION_PLAN.md`
- `docs/TWO_WEEK_BUILD_ORDER.md`
- `docs/MILESTONE_CHECKLIST.md`
- `docs/SYMPHONY_FORK_VS_BUILD_FRESH.md`

## Quick Start

Requirements:
- Node.js 20+

Run the sample pipeline:

```bash
node src/cli.mjs prepare samples/tasks/cache-invalidation.task.md
```

Or:

```bash
npm run task:sample
npm run task:run:dry
npm run doctor
node src/cli.mjs login codex
```

Artifacts are written under `runs/<task-id>*`.

## Current Scaffold Outputs

For a given task brief, the scaffold generates:
- `task/task.json`
- `task/source.task.md`
- `prompt-packets/*.json`
- `prompt-packets/*.md`
- `candidates/*/manifest.json`
- candidate event streams and run-level event stream
- workspaces, logs, and artifact directories ready for provider execution

## Important Scope Note

The current runner can build real subprocess launch commands for `codex`, `gemini`, and `claude-code`, and it can capture live stdout/stderr events into JSONL. Verification, diff capture, and `jj` integration are still upcoming slices.

Provider auth note:
- Alloy is currently CLI-first and subscription-login-first.
- `doctor` reports install state and auth readiness hints.
- `login <provider>` launches the provider's interactive login entrypoint for human repair.
