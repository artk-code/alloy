# Next Session

Status date: March 8, 2026
Purpose: Give the next compact-session agent an accurate starting point after the merge-plan, compare-page, in-app docs, and judge-rationale slice landed locally.

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

2. Improve synthesis review clarity
   - synthesized diff vs candidate diff review
   - clearer unresolved-conflict presentation
   - clearer final provenance summaries per file

3. Add `jj` stack shaping for synthesized results
   - split
   - squash
   - rebase
   - still keep publication out of scope until the stack is reviewable

4. Add a proper browser smoke harness only if it is made repo-local and reproducible
   - do not rely on vague global Playwright assumptions

## Plan For Priority 2: Synthesis Review Clarity

The next agent should treat synthesis review clarity as a UI/data contract pass, not just a styling pass.

### Goal

Make it obvious to a human reviewer:
- what the final synthesized result changed
- which candidate each final file came from
- which files were contested
- which files were manually overridden
- which conflicts remain unresolved

### Concrete Steps

1. Add a dedicated synthesized-diff summary block
- file:
  - [ui/compare.js](/Users/codex/stack-judge/ui/compare.js)
- show:
  - total changed files
  - total changed lines if available
  - synthesis verification status
  - synthesis `jj` change id

2. Add candidate-vs-synthesis comparison cues
- files:
  - [src/web/data.mjs](/Users/codex/stack-judge/src/web/data.mjs)
  - [ui/compare.js](/Users/codex/stack-judge/ui/compare.js)
- for each synthesized file, surface:
  - selected candidate label
  - whether the selection matched the merge plan
  - whether the human overrode the merge plan
  - whether the file was contested

3. Make unresolved conflicts impossible to miss
- files:
  - [src/web/data.mjs](/Users/codex/stack-judge/src/web/data.mjs)
  - [ui/compare.js](/Users/codex/stack-judge/ui/compare.js)
- add:
  - conflict count near the merge summary
  - red or high-visibility conflict rows
  - direct jump/filter to contested files only

4. Add a final provenance summary section
- file:
  - [ui/compare.js](/Users/codex/stack-judge/ui/compare.js)
- list:
  - `path`
  - selected candidate
  - provider
  - decision reason
  - confidence
  - risk level
  - `manual override` vs `merge plan selection`

5. Keep the diff review compact by default
- do not expand every patch at once
- keep file lists clickable
- default to the most important files first:
  - unresolved conflicts
  - manually overridden files
  - synthesized files with high risk

### Suggested Data Additions

The next agent should consider extending synthesis view data with:
- `manual_override`
- `planned_candidate_label`
- `selected_candidate_label`
- `contested`
- `selection_origin`
  - `merge_plan`
  - `manual_override`
  - `winner_only`

### Success Criteria For Priority 2

This priority is done when a human can open `Compare Diffs` and answer, without reading raw JSON:

1. Which final files came from which candidate?
2. Which files were contested?
3. Which selections were manual overrides?
4. Which unresolved conflicts still block safe publication?
5. What does the synthesized diff change relative to base?

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
