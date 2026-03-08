# Current State

Status date: March 8, 2026
Purpose: Capture the honest current Alloy proof boundary so future work starts from the actual implementation instead of the aspirational architecture.

## What Works Now

- Alloy Control Panel serves a real local web UI for:
  - project-labeled task cards
  - board project filtering and grouping
  - provider readiness
  - per-provider run configuration
  - session monitor
  - parsed task brief view
  - evaluation summary and candidate cards
  - per-candidate diff viewer
  - merge builder for winner-only and manual file selection
  - per-file provenance in the merge builder
- The default demo task is the tic-tac-toe perfect-play repair card at `samples/tasks/tic-tac-toe-perfect-play.task.md`.
- There is also a runnable security-lab card at `samples/tasks/security-sql-injection.task.md`.
- The seeded tic-tac-toe demo repo is intentionally broken and fails real acceptance checks before any fix.
- Candidate runs use real workspaces, persistent session records, and real verifier commands.
- Each prepared candidate workspace is bootstrapped as a `jj` repo and produces a real captured patch.
- The deterministic evaluator produces:
  - scorecards
  - ranking
  - pairwise comparisons
  - winner vs synthesize recommendation
- Alloy can create a fresh synthesis workspace from:
  - the winning candidate
  - human-selected files from candidate diffs
- Root automated tests pass.

## What Is Real Versus Simulated

Real today:
- project metadata on tasks, runs, sessions, and prompt packets
- workspace mutation
- session records and event logs
- provider readiness probing where the CLI exposes a safe status command
- `jj` workspace bootstrap and patch capture
- `jj` diff/file APIs for the UI
- verifier command execution
- deterministic scoring
- conservative synthesis workspace creation and re-verification
- local API and browser UI

Still limited:
- automated tests do not certify live Codex, Gemini, or Claude Code authoring end to end
- the automated integration path currently replays a stored working tic-tac-toe fix artifact into a real candidate workspace
- Gemini auth is intentionally treated as manual operator verification in the current build
- blind judge/composer logic is not implemented yet
- final `jj` stack shaping and PR publication are not implemented yet

## Demo Proof Boundary

Current demo proof:
1. The baseline repo is actually broken.
2. Alloy can prepare real candidate workspaces from the task brief.
3. Alloy can apply a stored replay artifact to a candidate workspace in tests.
4. Alloy runs the real acceptance commands.
5. Alloy captures the resulting `jj` patch and scores the candidate.
6. Alloy can materialize a new synthesis workspace from those captured candidate diffs and rerun the real verifier.

That is enough to prove the orchestration, verification, artifact, and conservative merge path. It is not yet enough to claim full live multi-provider synthesis with autonomous composition.

## UI State

- The desktop layout is a three-column workspace:
  - providers and runtime on the left
  - board and operator view stacked in the center
  - routing and run controls on the right
- Cards now carry explicit project labels so multiple labs can coexist on the same board.
- The board can now filter by project and group by project or state.
- Narrow screens collapse to a single-column flow.
- The UI uses a light corporate palette at the moment because that is the current operator preference.
- Gemini always shows manual auth verification rather than a false precision status.
- Heavy operator sections are collapsible.
- Card and detail states are now outcome-based:
  - `Draft`
  - `Prepared`
  - `Previewed`
  - `Winner Ready`
  - `Needs Merge`
  - `Synthesized`
  - `Failed`
  - `No Winner`

## Highest-Value Next Steps

1. Add richer compare controls on top of the new diff viewer:
   - patch stats
   - synthesis result diff inspection
2. Add a blind judge/composer layer on top of deterministic evaluation.
3. Add `jj` stack shaping for the synthesized result:
   - split
   - squash
   - rebase
4. Add final publication flow from the synthesized stack.
5. Add persisted project-level dashboards and saved board preferences.

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

Security repo baseline:

```bash
cd samples/repos/security-sqli
npm test
node scripts/eval-security-fix.mjs
```
