# Current State

Status date: March 8, 2026
Purpose: Capture the honest current Alloy proof boundary so future work starts from the actual implementation instead of the aspirational architecture.

## What Works Now

- Alloy Control Panel serves a real local web UI for:
  - task cards
  - provider readiness
  - per-provider run configuration
  - session monitor
  - parsed task brief view
  - evaluation summary and candidate cards
- The default demo task is the tic-tac-toe perfect-play repair card at `samples/tasks/tic-tac-toe-perfect-play.task.md`.
- The seeded tic-tac-toe demo repo is intentionally broken and fails real acceptance checks before any fix.
- Candidate runs use real workspaces, persistent session records, and real verifier commands.
- Each prepared candidate workspace is bootstrapped as a `jj` repo and produces a real captured patch.
- The deterministic evaluator produces:
  - scorecards
  - ranking
  - pairwise comparisons
  - winner vs synthesize recommendation
- Root automated tests pass.

## What Is Real Versus Simulated

Real today:
- workspace mutation
- session records and event logs
- provider readiness probing where the CLI exposes a safe status command
- `jj` workspace bootstrap and patch capture
- verifier command execution
- deterministic scoring
- local API and browser UI

Still limited:
- automated tests do not certify live Codex, Gemini, or Claude Code authoring end to end
- the automated integration path currently replays a stored working tic-tac-toe fix artifact into a real candidate workspace
- Gemini auth is intentionally treated as manual operator verification in the current build
- final synthesis and final PR publication are not implemented yet

## Demo Proof Boundary

Current demo proof:
1. The baseline repo is actually broken.
2. Alloy can prepare real candidate workspaces from the task brief.
3. Alloy can apply a stored replay artifact to a candidate workspace in tests.
4. Alloy runs the real acceptance commands.
5. Alloy captures the resulting `jj` patch and scores the candidate.

That is enough to prove the orchestration, verification, and artifact path. It is not yet enough to claim full live multi-provider synthesis.

## UI State

- The desktop layout is a three-column workspace:
  - providers and runtime on the left
  - board and operator view stacked in the center
  - routing and run controls on the right
- Narrow screens collapse to a single-column flow.
- The UI uses a light corporate palette at the moment because that is the current operator preference.
- Gemini always shows manual auth verification rather than a false precision status.

## Highest-Value Next Steps

1. Expose real candidate diffs and changed files in the UI.
2. Add merge-mode controls: `auto`, `hybrid`, `manual`.
3. Implement winner-only synthesis workspace creation.
4. Implement human file-selection synthesis.
5. Only after that, add blind judge/composer and final `jj` stack shaping.

## Validation Commands

Repo root:

```bash
npm test
npm run doctor
npm run task:run:dry
```

Demo repo baseline:

```bash
cd samples/repos/tic-tac-toe
npm test
node scripts/eval-perfect-play.mjs
```
