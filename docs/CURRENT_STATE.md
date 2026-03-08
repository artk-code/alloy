# Current State

Status date: March 8, 2026
Purpose: Capture the honest current Alloy proof boundary so future work starts from the actual implementation instead of the aspirational architecture.

## What Works Now

- Alloy Control Panel serves a real local web UI for:
  - project-labeled task cards
  - board project filtering and grouping
  - board pagination
  - provider readiness
  - per-provider run configuration
  - session monitor
  - parsed task brief view
  - native markdown task rendering inside the operator view
  - evaluation summary and candidate cards
  - dedicated `Compare Diffs` page for candidate and synthesis review
  - merge-plan and synthesis guidance in the operator view
  - per-file provenance in the merge workflow
  - dedicated in-app docs page for operator workflow guidance
  - tabbed operator detail sections to reduce clutter
- The default demo task is the tic-tac-toe perfect-play repair card at `samples/tasks/tic-tac-toe-perfect-play.task.md`.
- There is also a runnable security-lab card at `samples/tasks/security-sql-injection.task.md`.
- There is also a runnable bugfix-lab card at `samples/tasks/cache-invalidation.task.md`.
- The seeded tic-tac-toe demo repo is intentionally broken and fails real acceptance checks before any fix.
- Candidate runs use real workspaces, persistent session records, and real verifier commands.
- Each prepared candidate workspace is bootstrapped as a `jj` repo and produces a real captured patch.
- The deterministic evaluator produces:
  - scorecards
  - ranking
  - pairwise comparisons
  - winner vs synthesize recommendation
  - first-class `merge_plan` output
  - first-class `judge_rationale` output
- Alloy can create a fresh synthesis workspace from:
  - the evaluator-produced merge plan
  - the winning candidate
  - human-selected files from candidate diffs
- Synthesized results now include:
  - synthesized diff summaries
  - manual-override and contested-file cues
  - publication-readiness status
  - publication preview and approval state
  - review-oriented `jj` stack shaping metadata
- The board/detail UI now classifies run provenance so it can distinguish:
  - command previews
  - live CLI runs
  - fixture replay artifacts
  - legacy historical artifacts
- Root automated tests pass.

## What Is Real Versus Simulated

Real today:
- project metadata on tasks, runs, sessions, and prompt packets
- workspace mutation
- session records and event logs
- provider readiness probing where the CLI exposes a safe status command
- `jj` workspace bootstrap and patch capture
- `jj` diff/file APIs for the UI
- synthesis diff API for the UI
- verifier command execution
- deterministic scoring
- deterministic merge-plan generation
- conservative synthesis workspace creation and re-verification
- `jj` split/rebase/squash helper support for stack shaping
- persisted publication-readiness metadata for synthesized results
- persisted publication preview and approval metadata for synthesized results
- local API and browser UI
- persisted `judge-rationale.json` artifact per evaluated run
- a shared dark-mode toggle persisted across Control Panel, Compare Diffs, and Docs

Still limited:
- automated tests do not certify live Codex, Gemini, or Claude Code authoring end to end
- the automated integration path currently replays a stored working tic-tac-toe fix artifact into a real candidate workspace
- some historical run artifacts under `runs/` were created with older mock/replay helpers and still exist for audit purposes
- Gemini auth is intentionally treated as manual operator verification in the current build
- blind judge/composer logic is not implemented yet
- final remote branch/bookmark push and PR creation are not implemented yet
- no repo-local browser smoke harness exists yet, so browser validation is still mostly manual

## Demo Proof Boundary

Current demo proof:
1. The baseline repo is actually broken.
2. Alloy can prepare real candidate workspaces from the task brief.
3. Alloy can apply a stored replay artifact to a candidate workspace in tests.
4. Alloy runs the real acceptance commands.
5. Alloy captures the resulting `jj` patch and scores the candidate.
6. Alloy can materialize a new synthesis workspace from those captured candidate diffs and rerun the real verifier.
7. Alloy can expose merge-plan, synthesis diff, and operator guidance surfaces through the web UI.
8. Alloy persists and renders a separate judge rationale artifact for human review.
9. Alloy shapes synthesized results into a reviewable `jj` stack when multiple file categories are present.
10. Alloy computes publication-readiness blockers, publication previews, and explicit human approval state without pretending remote publish/PR automation is already implemented.

That is enough to prove the orchestration, verification, artifact, and conservative merge path. It is not yet enough to claim full live multi-provider synthesis with autonomous composition.

## UI State

- The desktop layout is a two-tier workspace:
  - providers and runtime on the left
  - task board and operator view side by side on the top row
  - routing and run controls underneath the board/operator span
- The heavy diff workflow now has its own `Compare Diffs` page with:
  - candidate diff inspection
  - synthesis diff inspection
  - per-file provenance
  - merge-plan review
  - synthesis actions
  - publication preview, approval, and stack-shape summaries
- The app now has an in-app `Docs` page backed by local markdown content.
- Cards now carry explicit project labels so multiple labs can coexist on the same board.
- The board can now filter by project and group by project or state.
- Task cards are directly selectable and sync the focused task into the URL and Operator View.
- Narrow screens collapse to a single-column flow.
- The UI now supports persistent light/dark theme switching across all top-level pages.
- Gemini always shows manual auth verification rather than a false precision status.
- Heavy operator sections are collapsible and the operator view is tabbed so only one dense pane is visible at a time.
- Control Panel, Compare Diffs, and Docs now share top-level navigation.
- Control Panel task editing now supports source and rendered-markdown modes.
- Card and detail states are now outcome-based and provenance-aware:
  - `Draft`
  - `Prepared`
  - `Previewed`
  - `Fixture Replay`
  - `Legacy Artifact`
  - `Passing Candidates`
  - `Winner Ready`
  - `Needs Merge`
  - `Synthesized`
  - `Failed`
  - `No Winner`

## Highest-Value Next Steps

1. Add a real publication flow from the shaped synthesis stack:
   - preview and approval are implemented
   - next remaining sub-step is branch/bookmark push
   - later PR creation
   - detailed method plan:
     - [PUBLICATION_FLOW_PLAN.md](/Users/codex/stack-judge/docs/PUBLICATION_FLOW_PLAN.md)
2. Add a blind judge/composer layer on top of deterministic evaluation for close-call synthesis decisions.
3. Add a local candidate/synthesis testing flow so operators can open or run a chosen workspace without hunting through artifacts.
4. Add broader smoke/algorithm cards so the board covers fast runner checks as well as richer synthesis demos.
5. Add a repo-local browser smoke harness once it is reproducible from this repo rather than dependent on ambient machine state.

## Appended Execution Order

For the next build slice, use this order:

1. Finish publication flow with branch/bookmark push from approved synthesis
2. Blind judge/composer
3. Local candidate/synthesis testing
4. Broader eval cards
5. Repo-local browser smoke harness

Reason:
- preview/approval now turn synthesis output into an actionable operator decision
- branch/bookmark push is the last missing publication sub-step before PR work
- judge/composer is the next biggest capability gain after that
- local testing improves trust quickly
- broader evals improve demo speed and regression coverage
- browser automation is useful, but lower leverage than the four items above

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

Bugfix repo baseline:

```bash
cd samples/repos/cache-service
npm test
npm run lint
npm run typecheck
node scripts/check-demo-state.mjs
```
