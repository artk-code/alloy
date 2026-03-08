# Current State

Status date: March 8, 2026
Purpose: Capture the honest current Alloy proof boundary so future work starts from the actual implementation instead of the aspirational architecture.

Current product split:

```text
Queue  ->  Tasks  ->  Review
monitor    author     inspect / synthesize / publish
run work   import     blind review / approve / push
```

## What Works Now

- Alloy serves a real local web UI for:
  - project-labeled task cards
  - board project filtering and grouping
  - board pagination
  - provider readiness
  - per-provider run configuration
  - optional blind-review CLI selection inside the run plan
  - session monitor
  - compact selected-task summary
  - queue-backed monitoring from `runtime/task-queue.json`
  - dedicated `Tasks` page for structured task setup, demo loading, source generation/import, parsed task review, and candidate detail
  - dedicated `Review` page for candidate and synthesis review
  - merge-plan and synthesis guidance in the operator view
  - per-file provenance in the merge workflow
  - dedicated in-app docs page for operator workflow guidance
  - task creation from pasted markdown or imported markdown files
  - tabbed/collapsible operator detail sections to reduce clutter
- The default demo task is the tic-tac-toe perfect-play repair card at `samples/tasks/tic-tac-toe-perfect-play.task.md`.
- There is now a fast smoke-lab card at `samples/tasks/fizzbuzz-cli.task.md`.
- There is now a fast algo-lab card at `samples/tasks/roman-numerals.task.md`.
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
  - anonymized `blind_review` output
  - first-class `composer_plan` output
- Alloy can create a fresh synthesis workspace from:
  - the evaluator-produced merge plan
  - the winning candidate
  - human-selected files from candidate diffs
- Synthesized results now include:
  - synthesized diff summaries
  - manual-override and contested-file cues
  - publication-readiness status
  - publication preview and approval state
  - blind-review consensus and disagreement state for publication
  - operator-controlled branch/bookmark push state
  - review-oriented `jj` stack shaping metadata
- Alloy can launch an optional blind-review CLI later against saved run artifacts and persist a structured recommendation for human approval.
- `Review` now exposes local testing targets directly with:
  - `Open Workspace`
  - `Copy Commands`
  - visible validation commands per candidate or synthesis workspace
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
- persisted publication push results for synthesized results
- persisted blind-review publication gate state for synthesized results
- local API and browser UI
- persisted `judge-rationale.json` artifact per evaluated run
- persisted `blind-judge-packet.json` and `composer-plan.json` artifacts per evaluated run
- persisted async blind-review agent recommendations
- a shared dark-mode toggle persisted across Queue, Review, and Docs
- task creation/import sanity checks:
  - markdown-only source import
  - file existence check
  - file-size guard
  - binary-content rejection
  - Alloy task-brief validation before save

Still limited:
- automated tests do not certify live Codex, Gemini, or Claude Code authoring end to end
- the automated integration path currently replays a stored working tic-tac-toe fix artifact into a real candidate workspace
- some historical run artifacts under `runs/` were created with older mock/replay helpers and still exist for audit purposes
- Gemini auth is intentionally treated as manual operator verification in the current build
- blind-review recommendations do not automatically rewrite the merge plan or synthesis file allocations yet
- the current in-app Task Composer is now guided-field-first, but the raw markdown source is still part of the save path and the overall flow is not hardened for non-expert users yet
- final PR creation is not implemented yet
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
10. Alloy computes publication-readiness blockers, publication previews, explicit human approval state, and real remote push results without pretending PR automation is already implemented.
11. Alloy can run an optional blind-review CLI later against saved artifacts, compare that recommendation to the deterministic plan, and block publication until a human approves any disagreement.
12. Alloy can open candidate or synthesis workspaces directly from `Review` and show the exact validation commands beside each target.

That is enough to prove the orchestration, verification, artifact, and conservative merge path. It is not yet enough to claim full live multi-provider synthesis with autonomous composition.

## UI State

- The product is now split into three top-level surfaces:
  - `Queue`
  - `Tasks`
  - `Review`
- `Queue` stays compact:
  - providers and runtime
  - real queued work only
  - run plan and actions
  - selected-task summary
- `Tasks` now holds the heavy task-detail surface:
  - guided task setup
  - demo scenario loading
  - markdown source/render
  - parsed task review
  - candidate cards
  - evaluation summary
  - task file creation/import
- The heavy diff workflow now has its own `Review` page with:
  - candidate diff inspection
  - synthesis diff inspection
  - per-file provenance
  - merge-plan review
  - synthesis actions
  - publication preview, approval, push, and stack-shape summaries
- The app now has an in-app `Docs` page backed by local markdown content.
- Cards now carry explicit project labels so multiple labs can coexist on the same board.
- The board can now filter by project and group by project or state.
- Task cards are directly selectable and sync the focused task into the URL and Tasks.
- Narrow screens collapse to a single-column flow.
- The UI now supports persistent light/dark theme switching across all top-level pages.
- Gemini always shows manual auth verification rather than a false precision status.
- Heavy operator sections are collapsible and the operator view is tabbed so only one dense pane is visible at a time.
- Queue, Tasks, Review, and Docs now share top-level navigation.
- The run plan now mirrors the actual execution order:
  - candidate runs first
  - deterministic evaluation from disk
  - optional blind review later
  - synthesis and publication after human approval
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

1. Make blind review change real decisions, not just the UI.
   - Blind review now gates publication.
   - The next step is to let it influence merge recommendations before synthesis, without bypassing deterministic gates.

2. Tighten the `Tasks` page.
   - Keep guided fields as the main path.
   - Make it easy to edit an existing saved task without manually touching raw markdown.
   - Keep source import behind explicit warnings and validation.

3. Add PR creation only after push succeeds.
   - Use the pushed synthesis ref as the only source for PR creation.
   - Keep PR creation behind explicit human approval.

4. Add repo-local browser smoke tests later.
   - Only do this with a reproducible repo-local runner.
   - Do not rely on ambient browser tooling.

## Execution Order

Build in this order:

1. Blind-review decision consumption
2. `Tasks` editing and validation cleanup
3. PR creation from a pushed synthesis ref
4. Repo-local browser smoke tests

Why this order:
- blind review is now consumed at publication time, so the next value is to move that judgment earlier into merge guidance
- the `Tasks` page is now usable but still needs cleanup around save/edit flow
- fast cards now exist and should be used as the first regression demos
- PR creation should stay behind push and approval
- browser smoke tests are useful, but not a product bottleneck

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
