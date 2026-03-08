# Next Session

Status date: March 8, 2026
Purpose: Give the next compact-session agent an accurate starting point from the current pushed state after merge-plan, compare/docs, judge-rationale, synthesis-review, publication, blind-review, and Operator View work landed on `main`.

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
- dedicated `Operator View` page added
- task creation/import from `Operator View` added
- synthesis `jj` stack shaping added
- dedicated `Compare Diffs` page added
- dedicated in-app `Docs` page added
- native markdown rendering added for task and docs surfaces
- task-aware top-nav links added across Control Panel, Operator View, Compare Diffs, and Docs
- task cards now focus the selected task directly instead of relying on a separate `Open Card` button
- the Control Panel now stays compact while Operator View holds the heavy task-detail workflow
- persistent light/dark mode across all top-level pages via local storage

Tests last verified locally:
- `33/33` passing

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
- [ui/operator.html](/Users/codex/stack-judge/ui/operator.html)
- [ui/operator.js](/Users/codex/stack-judge/ui/operator.js)
- [ui/compare.html](/Users/codex/stack-judge/ui/compare.html)
- [ui/compare.js](/Users/codex/stack-judge/ui/compare.js)
- [ui/docs.html](/Users/codex/stack-judge/ui/docs.html)
- [ui/docs.js](/Users/codex/stack-judge/ui/docs.js)
- [ui/markdown-viewer.mjs](/Users/codex/stack-judge/ui/markdown-viewer.mjs)
- [ui/index.html](/Users/codex/stack-judge/ui/index.html)
- [ui/styles.css](/Users/codex/stack-judge/ui/styles.css)
- [docs/OPERATOR_GUIDE.md](/Users/codex/stack-judge/docs/OPERATOR_GUIDE.md)

## What To Verify First

Do not begin by re-implementing the merge-plan slice.

Start by validating the current pushed build:

1. confirm the running web server is serving the current tree
2. manually verify these routes and pages:
   - `/`
   - `/operator.html`
   - `/compare.html?task=task_20260308_tic_tac_toe_perfect_play`
   - `/docs.html?doc=operator-guide&task=task_20260308_tic_tac_toe_perfect_play`
   - `/api/tasks/task_20260308_tic_tac_toe_perfect_play`
   - `/api/tasks/task_20260308_tic_tac_toe_perfect_play/synthesis/diff`
   - `/api/docs/operator-guide`
   - `POST /api/tasks/create`
3. verify task-aware nav links:
   - Control Panel -> Operator View -> Compare Diffs -> Docs
   - Docs -> Control Panel / Operator View / Compare Diffs
4. verify theme persistence across page navigation and refresh
5. verify the task markdown source/render toggle in `Operator View`
6. verify task creation/import from `Operator View`
7. only after that, clean up any remaining UI/data inconsistencies before adding new product features

## Current Limitation On Browser Smoke Tests

There is still no repo-local browser smoke harness.

This means:
- syntax checks passed
- unit/integration tests passed
- manual live browsing has been used successfully
- but there is no reproducible repo-local browser automation path yet

If the next agent wants browser automation, they should add a repo-local Playwright dependency or another reproducible driver path instead of assuming ambient machine state.

## New Priority List

After manual verification of the current pushed build, the next priorities should be:

1. Consume blind-review recommendations in the synthesis/publication flow
   - deterministic evaluation remains the gatekeeper
   - blind review already exists as a persisted async artifact; the gap is using it productively

2. Add a local candidate/synthesis testing workflow
   - one-click or one-command path from the UI/docs into the selected workspace
   - make local validation easy once a candidate or synthesis is chosen

3. Expand the in-app Task Composer
   - operators can already create/import markdown task files from `Operator View`
   - the next step is a safer structured editor and richer validation/preview, not re-adding basic creation

4. Add broader eval cards
   - smoke
   - compact algorithms
   - realistic bugfix/security demos

5. Add PR creation from the approved, pushed synthesis ref
   - keep it behind explicit human approval
   - do not let PR creation bypass the pushed-ref state

6. Refine the compare surface after the core workflow gaps are closed
   - better side-by-side candidate vs synthesis ergonomics
   - explicit `jj` stack timeline/history view for humans

7. Add a proper browser smoke harness only if it is made repo-local and reproducible
   - do not rely on vague global Playwright assumptions

8. Add trace grading and `jj` operation-history mining only after the merge loop is stable
   - useful later, not a current bottleneck

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

Current next publication increment:
- PR creation from the approved, pushed ref

The publication slice is considered complete enough when a human can open `Compare Diffs` and answer, without reading raw JSON:

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

## Appended Priority Ladder

Use this order unless a blocking regression is found:

1. Blind-review recommendation consumption
   - The next highest-value gap is using saved blind-review output to shape merge and publication decisions without weakening deterministic gates.
   - Keep deterministic checks as the hard gate and layer persisted blind-review output on top.
   - Deliverables:
     - decision rules for when blind review changes merge guidance
     - UI emphasis for aligned vs conflicting deterministic/blind recommendations
     - publication gating when blind review raises high-risk objections

2. Local testing workflow
   - Operators need a direct path from the UI to a chosen candidate or synthesis workspace.
   - This improves trust faster than more analytics or more visual work.
   - Deliverables:
      - one-click or one-command open path
      - explicit local validation commands beside the chosen workspace

3. Structured Task Composer expansion
   - Custom tasks can now be created or imported from `Operator View`.
   - Keep markdown as the persisted source format, but add a safer GUI composer/editor and save flow on top.
   - Deliverables:
     - structured field inputs for Alloy frontmatter
     - markdown/body preview beside parsed validation
     - safe import guidance and clearer validation errors before save
     - edit existing task files without dropping to the filesystem

4. Broader eval coverage
   - Add a smoke task and a compact algorithm task so Alloy is easier to demo and regress-test quickly.
   - Keep the current richer cards for synthesis credibility.

5. PR creation from the pushed synthesis ref
   - Remote push is now the gating publication step.
   - Add PR creation only on top of a successful pushed-ref state.

6. Compare-surface refinement
   - Improve side-by-side review and add a clearer `jj` history/timeline view for the final stack.

7. Repo-local browser smoke harness
   - Useful, but only after the core publish/judge/test loop is stronger.
   - Make it reproducible from this repo rather than dependent on machine-specific tooling.

8. Trace grading and `jj` operation-history mining
   - Useful learning signals later, but explicitly not a current bottleneck.
