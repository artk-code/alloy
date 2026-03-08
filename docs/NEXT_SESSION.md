# Next Session

Status date: March 8, 2026
Purpose: Give the next compact-session agent an accurate starting point from the current pushed state after merge-plan, compare/docs, judge-rationale, synthesis-review, stack-shaping, and dark-mode work landed on `main`.

## Read First

1. [CURRENT_STATE.md](/Users/codex/stack-judge/docs/CURRENT_STATE.md)
2. [AGENT_MERGE_PLAN.md](/Users/codex/stack-judge/docs/AGENT_MERGE_PLAN.md)
3. [OPERATOR_GUIDE.md](/Users/codex/stack-judge/docs/OPERATOR_GUIDE.md)
4. [README.md](/Users/codex/stack-judge/README.md)

## Current Pushed Baseline

The current pushed repo already includes:

- merge-plan schema added
- deterministic evaluation now emits `merge_plan`
- deterministic evaluation now emits `judge_rationale`
- synthesis now accepts `merge_plan`
- synthesis diff API added
- synthesis publication-readiness metadata added
- synthesis `jj` stack shaping added
- dedicated `Compare Diffs` page added
- dedicated in-app `Docs` page added
- native markdown rendering added for task and docs surfaces
- task-aware top-nav links added across Control Panel, Compare Diffs, and Docs
- task cards now focus the selected task directly instead of relying on a separate `Open Card` button
- the Control Panel desktop layout now keeps Task Board and Operator View side by side, with routing controls below them
- persistent light/dark mode across all top-level pages via local storage

Tests last verified locally:
- `28/28` passing

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
- [ui/app.js](/Users/codex/stack-judge/ui/app.js)
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
   - `/compare.html?task=task_20260308_tic_tac_toe_perfect_play`
   - `/docs.html?doc=operator-guide&task=task_20260308_tic_tac_toe_perfect_play`
   - `/api/tasks/task_20260308_tic_tac_toe_perfect_play`
   - `/api/tasks/task_20260308_tic_tac_toe_perfect_play/synthesis/diff`
   - `/api/docs/operator-guide`
3. verify task-aware nav links:
   - Control Panel -> Compare Diffs -> Docs
   - Docs -> Control Panel / Compare Diffs
4. verify theme persistence across page navigation and refresh
5. verify the task markdown source/render toggle
6. only after that, clean up any remaining UI/data inconsistencies before adding new product features

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

1. Add final publication flow from the shaped synthesis stack
   - stay honest about review vs publish readiness
   - keep PR publication behind explicit human approval

2. Add a blind judge/composer layer on top of deterministic evaluation
   - deterministic evaluation remains the gatekeeper
   - judge/composer should improve close-call synthesis, not replace hard gates

3. Add a local candidate/synthesis testing workflow
   - one-click or one-command path from the UI/docs into the selected workspace
   - make local validation easy once a candidate or synthesis is chosen

4. Add broader eval cards
   - smoke
   - compact algorithms
   - realistic bugfix/security demos

5. Add a proper browser smoke harness only if it is made repo-local and reproducible
   - do not rely on vague global Playwright assumptions

## Plan For Priority 2: Publication Flow

### Goal

Turn publication readiness into a real operator decision flow without pretending PR publishing is already automatic.

### Concrete Steps

1. Add a dedicated publication panel to `Compare Diffs`
- show:
  - review readiness
  - publication blockers
  - explicit human approval requirement
  - next publishable action

2. Define a publishable synthesis contract
- final shaped stack present
- verification passed
- no unresolved conflicts
- no hidden manual override without provenance

3. Keep remote publication out of the browser until the contract is clear
- first land a local `publish preview`
- then branch/bookmark push
- only then PR automation

### Suggested Data Additions

The next agent should consider extending publication data with:
- `publish_status`
- `publish_blockers`
- `human_approved_at`
- `publish_preview`
- `target_remote`
- `target_branch_or_bookmark`

### Success Criteria For Priority 2

This priority is done when a human can open `Compare Diffs` and answer, without reading raw JSON:

1. Is this synthesis only reviewable, or actually publishable?
2. What specific blockers still prevent publication?
3. What human action is required before any remote publish step?
4. What exact stack/diff will be published when that step is enabled?

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

1. Publication flow
   - Alloy already knows how to evaluate, synthesize, and shape a stack.
   - The next highest-value gap is telling the operator exactly what is publishable and what still blocks publication.
   - Deliverables:
     - publication panel in `Compare Diffs`
     - `publish_status`
     - `publish_blockers`
     - explicit human approval capture
     - local publish preview

2. Blind judge/composer
   - After publication readiness, the next differentiator is better close-call synthesis.
   - Keep deterministic checks as the hard gate and layer blind judge/composer output on top.
   - Deliverables:
     - anonymized candidate presentation
     - structured judge output artifact
     - composer path for close-call synthesis only

3. Local testing workflow
   - Operators need a direct path from the UI to a chosen candidate or synthesis workspace.
   - This improves trust faster than more analytics or more visual work.
   - Deliverables:
     - one-click or one-command open path
     - explicit local validation commands beside the chosen workspace

4. Broader eval coverage
   - Add a smoke task and a compact algorithm task so Alloy is easier to demo and regress-test quickly.
   - Keep the current richer cards for synthesis credibility.

5. Repo-local browser smoke harness
   - Useful, but only after the core publish/judge/test loop is stronger.
   - Make it reproducible from this repo rather than dependent on machine-specific tooling.
