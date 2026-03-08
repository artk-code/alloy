# Next Session

Status date: March 8, 2026
Purpose: Give the next compact-session agent an accurate starting point after the merge-plan, compare-page, in-app docs, judge-rationale, synthesis-review, and stack-shaping slice landed locally.

## Read First

1. [CURRENT_STATE.md](/Users/codex/stack-judge/docs/CURRENT_STATE.md)
2. [AGENT_MERGE_PLAN.md](/Users/codex/stack-judge/docs/AGENT_MERGE_PLAN.md)
3. [OPERATOR_GUIDE.md](/Users/codex/stack-judge/docs/OPERATOR_GUIDE.md)
4. [README.md](/Users/codex/stack-judge/README.md)

## Current Local Baseline

The working tree now includes a major local slice that is not reflected in the last pushed handoff docs:

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

Tests last verified locally:
- `27/27` passing

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

Start by validating the local work:

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
4. verify the task markdown source/render toggle
5. only after that, clean up any remaining UI/data inconsistencies and commit

## Current Limitation On Browser Smoke Tests

A browser-automation smoke pass was attempted, but the local environment does not currently expose a usable Playwright package or CLI from this repo:

- `import 'playwright'` failed with `ERR_MODULE_NOT_FOUND`
- `playwright --version` failed because the CLI is not in `PATH`
- Safari WebDriver is present, but session creation failed because `Allow remote automation` is disabled in Safari settings

This means:
- syntax checks passed
- unit/integration tests passed
- server cwd on `127.0.0.1:4173` was confirmed as `/Users/codex/stack-judge`
- `curl` against `/` showed the updated Control Panel HTML and nav
- but a full scripted browser sanity pass was not completed in this session

If the next agent wants browser automation, they should add a repo-local Playwright dependency or use another available browser driver path instead of assuming a global install.

## New Priority List

After manual verification of the current local slice, the next priorities should be:

1. Commit and push the current merge-plan + compare/docs + markdown-viewer work
   - only after validating the live UI routes above

2. Add final publication flow from the shaped synthesis stack
   - stay honest about review vs publish readiness
   - keep PR publication behind explicit human approval

3. Add a blind judge/composer layer on top of deterministic evaluation
   - deterministic evaluation remains the gatekeeper
   - judge/composer should improve close-call synthesis, not replace hard gates

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
```

## Notes

- Keep README high-level.
- Keep operator workflow detail in the in-app docs and [OPERATOR_GUIDE.md](/Users/codex/stack-judge/docs/OPERATOR_GUIDE.md).
- Keep `docs/COMPETITIVE_ANALYSIS.md` out of commits unless explicitly requested.
- Preserve the conservative synthesis strategy: winner-only first, file-level composition second, deeper merge units later.
