# Next Session

Status date: March 8, 2026
Purpose: Give the next agent a concrete starting point from the current pushed state.

## Read First

1. [CURRENT_STATE.md](/Users/codex/stack-judge/docs/CURRENT_STATE.md)
2. [AGENT_MERGE_PLAN.md](/Users/codex/stack-judge/docs/AGENT_MERGE_PLAN.md)
3. [OPERATOR_GUIDE.md](/Users/codex/stack-judge/docs/OPERATOR_GUIDE.md)
4. [README.md](/Users/codex/stack-judge/README.md)
5. [PUBLICATION_FLOW_PLAN.md](/Users/codex/stack-judge/docs/PUBLICATION_FLOW_PLAN.md)

## Current Pushed Baseline

The current pushed repo already includes:

- merge-plan schema added
- deterministic evaluation now emits `merge_plan`
- deterministic evaluation now emits `judge_rationale`
- synthesis now accepts `merge_plan`
- synthesis diff API added
- synthesis publication-readiness metadata added
- publication preview and approval state added
- publication push state and API added
- optional async blind-review agent runs added
- dedicated `Tasks` page added
- task creation/import from `Tasks` added
- synthesis `jj` stack shaping added
- dedicated `Review` page added
- dedicated in-app `Docs` page added
- native markdown rendering added for task and docs surfaces
- task-aware top-nav links added across Queue, Tasks, Review, and Docs
- task cards now focus the selected task directly instead of relying on a separate `Open Card` button
- the Queue now stays compact while Tasks holds the heavy task-detail workflow
- persistent light/dark mode across all top-level pages via local storage
- fast demo tasks added:
  - `FizzBuzz CLI`
  - `Roman Numerals`

Tests last verified locally:
- `45/45` passing

Important local files added or heavily changed:
- [schemas/merge-plan.schema.json](/Users/codex/stack-judge/schemas/merge-plan.schema.json)
- [src/merge-plan.mjs](/Users/codex/stack-judge/src/merge-plan.mjs)
- [src/evaluation.mjs](/Users/codex/stack-judge/src/evaluation.mjs)
- [src/judge-rationale.mjs](/Users/codex/stack-judge/src/judge-rationale.mjs)
- [src/synthesis.mjs](/Users/codex/stack-judge/src/synthesis.mjs)
- [src/jj.mjs](/Users/codex/stack-judge/src/jj.mjs)
- [src/runner.mjs](/Users/codex/stack-judge/src/runner.mjs)
- [src/web/data.mjs](/Users/codex/stack-judge/src/web/data.mjs)
- [src/web/server.mjs](/Users/codex/stack-judge/src/web/server.mjs)
- [src/web/docs-data.mjs](/Users/codex/stack-judge/src/web/docs-data.mjs)
- [src/blind-review.mjs](/Users/codex/stack-judge/src/blind-review.mjs)
- [src/blind-review-agent.mjs](/Users/codex/stack-judge/src/blind-review-agent.mjs)
- [ui/app.js](/Users/codex/stack-judge/ui/app.js)
- [ui/tasks.html](/Users/codex/stack-judge/ui/tasks.html)
- [ui/tasks.js](/Users/codex/stack-judge/ui/tasks.js)
- [ui/operator.html](/Users/codex/stack-judge/ui/operator.html)
- [ui/operator.js](/Users/codex/stack-judge/ui/operator.js)
- [ui/review.html](/Users/codex/stack-judge/ui/review.html)
- [ui/review.js](/Users/codex/stack-judge/ui/review.js)
- [ui/compare.html](/Users/codex/stack-judge/ui/compare.html)
- [ui/compare.js](/Users/codex/stack-judge/ui/compare.js)
- [ui/docs.html](/Users/codex/stack-judge/ui/docs.html)
- [ui/docs.js](/Users/codex/stack-judge/ui/docs.js)
- [ui/markdown-viewer.mjs](/Users/codex/stack-judge/ui/markdown-viewer.mjs)
- [ui/index.html](/Users/codex/stack-judge/ui/index.html)
- [ui/styles.css](/Users/codex/stack-judge/ui/styles.css)
- [ui/task-composer.mjs](/Users/codex/stack-judge/ui/task-composer.mjs)
- [src/task-queue.mjs](/Users/codex/stack-judge/src/task-queue.mjs)
- [docs/OPERATOR_GUIDE.md](/Users/codex/stack-judge/docs/OPERATOR_GUIDE.md)

## What To Verify First

Do not begin by re-implementing the merge-plan slice.

Start by validating the current pushed build:

1. confirm the running web server is serving the current tree
2. manually verify these routes and pages:
   - `/`
   - `/tasks.html`
   - `/review.html?task=task_20260308_tic_tac_toe_perfect_play`
   - `/docs.html?doc=operator-guide&task=task_20260308_tic_tac_toe_perfect_play`
   - `/operator.html` redirects to `/tasks.html`
   - `/compare.html` redirects to `/review.html`
   - `/api/tasks/task_20260308_tic_tac_toe_perfect_play`
   - `/api/tasks/task_20260308_tic_tac_toe_perfect_play/synthesis/diff`
   - `/api/queue`
   - `/api/tasks/catalog`
   - `/api/docs/operator-guide`
   - `POST /api/tasks/create`
3. verify task-aware nav links:
   - Queue -> Tasks -> Review -> Docs
   - Docs -> Queue / Tasks / Review
4. verify theme persistence across page navigation and refresh
5. verify demo loading on `Tasks`
   - pick a demo from `Quick Start`
   - `Load Demo Into Setup`
   - `Open Demo`
   - confirm `FizzBuzz CLI` and `Roman Numerals` appear in the demo list
6. verify guided task creation on `Tasks`
   - choose a template
   - `Generate Task Source`
   - `Save Task File`
7. only after that, add new product features

## Current Limitation On Browser Smoke Tests

There is still no repo-local browser smoke harness.

This means:
- syntax checks passed
- unit/integration tests passed
- manual live browsing has been used successfully
- but there is no reproducible repo-local browser automation path yet

If the next agent wants browser automation, they should add a repo-local Playwright dependency or another reproducible driver path instead of assuming ambient machine state.

## Concrete Next Priorities

1. Make blind review influence merge guidance before publication.
   - Blind review already gates publication.
   - The next step is to surface aligned/disagreeing blind recommendations earlier in merge decisions, without letting them bypass deterministic failures.

2. Finish the `Tasks` page cleanup.
   - Keep guided fields as the primary flow.
   - Make saved-task editing clearer.
   - Keep raw markdown for advanced use only.

3. Add PR creation from a pushed synthesis ref.
   - Only allow this after approval and successful push.

4. Add repo-local browser smoke tests later.
   - Only with repo-local tooling.

## Publication Flow Status

The publication push slice is now implemented.

Detailed method plan:
- [PUBLICATION_FLOW_PLAN.md](/Users/codex/stack-judge/docs/PUBLICATION_FLOW_PLAN.md)

What now works:
- preview publication
- approve publication
- push approved bookmark/branch target
- persist success/failure result
- show publish target and push outcome in the UI
- compare async blind-review recommendations to the deterministic publication plan
- block publication on blind-review disagreement until a human approves
- open candidate or synthesis workspaces directly from `Review`
- show exact validation commands per local testing target

Current next publication increment:
- PR creation from the approved, pushed ref

The publication slice is considered complete enough when a human can open `Review` and answer, without reading raw JSON:

1. Has this synthesis been approved for publication?
2. What exact branch/bookmark will be pushed?
3. Did the push succeed or fail?
4. What exact stack/diff was pushed?

## What Not To Prioritize Yet

Do not jump first to:
- database work
- PR publishing
- hunk-level synthesis
- `jj` operation mining
- more visual restyling
- broad analytics

## Validation Commands

Repo root:

```bash
npm test
npm run doctor
npm run web
```

Demo repo baselines:

```bash
cd samples/repos/tic-tac-toe
npm test
node scripts/eval-perfect-play.mjs

cd ../security-sqli
npm test
node scripts/eval-security-fix.mjs

cd ../cache-service
npm test
npm run lint
npm run typecheck
node scripts/check-demo-state.mjs
```

## Notes

- Keep README high-level.
- Keep operator workflow detail in the in-app docs and [OPERATOR_GUIDE.md](/Users/codex/stack-judge/docs/OPERATOR_GUIDE.md).
- Keep `docs/COMPETITIVE_ANALYSIS.md` out of commits unless explicitly requested.
- Preserve the conservative synthesis strategy: winner-only first, file-level composition second, deeper merge units later.

## Done Means

For the next slice to count as complete:

1. Blind review can influence merge guidance before publication, not only the publication gate.
2. A human can edit and save an existing task from `Tasks` without dropping into raw markdown for normal cases.
3. A human can load a fast demo task, queue it, run it, and review its diff without touching the filesystem manually.
