# Next Session

Status date: March 8, 2026
Purpose: Give the next compact-session agent a direct starting point for Alloy's next implementation slice.

## Read First

1. [AGENT_MERGE_PLAN.md](/Users/codex/stack-judge/docs/AGENT_MERGE_PLAN.md)
2. [CURRENT_STATE.md](/Users/codex/stack-judge/docs/CURRENT_STATE.md)

## Current Baseline

- latest pushed merge-plan doc commit: `87e5cb1`
- latest pushed control-panel regression fix: `c643318`
- tests last verified passing: `23/23`
- current synthesis modes:
  - `winner_only`
  - `file_select`

Core files:
- [evaluation.mjs](/Users/codex/stack-judge/src/evaluation.mjs)
- [synthesis.mjs](/Users/codex/stack-judge/src/synthesis.mjs)
- [jj.mjs](/Users/codex/stack-judge/src/jj.mjs)
- [data.mjs](/Users/codex/stack-judge/src/web/data.mjs)
- [app.js](/Users/codex/stack-judge/ui/app.js)

## Next Implementation Target

Do not start with more visual polish or analytics.

Start with the merge contract:

1. define a merge-plan schema
2. have evaluation emit a merge plan
3. render the merge plan in the UI
4. make synthesis consume the merge plan
5. show the final synthesized diff and provenance clearly

## Concrete Steps

### 1. Add Merge-Plan Schema

Create:
- `schemas/merge-plan.schema.json`

Include:
- `base_candidate_id`
- `mode`
- `confidence`
- `file_decisions`
- `unresolved_conflicts`
- `rationale`
- `verification_expectation`

Per file:
- `path`
- `chosen_candidate_id`
- `contender_candidate_ids`
- `decision_reason`
- `risk_level`
- `confidence`

### 2. Extend Evaluation

Update:
- [evaluation.mjs](/Users/codex/stack-judge/src/evaluation.mjs)

Keep:
- deterministic scorecards
- ranking
- pairwise preferences

Add:
- merge-plan generation from:
  - winner
  - contested files
  - uncontested files
  - contribution map

### 3. Move Synthesis Onto Merge Plan

Update:
- [synthesis.mjs](/Users/codex/stack-judge/src/synthesis.mjs)

Goal:
- synthesis should accept a merge plan as its primary contract
- not only `winnerCandidateId` or raw `fileSelections`

### 4. Render Merge Plan In UI

Update:
- [data.mjs](/Users/codex/stack-judge/src/web/data.mjs)
- [app.js](/Users/codex/stack-judge/ui/app.js)

Show:
- base candidate
- contested files
- selected source per file
- unresolved conflicts
- rationale
- confidence

### 5. Add Final Synthesis Diff View

Add a view for:
- final synthesis vs base
- per-file provenance beside the synthesized diff

## Success Criteria

The next slice is successful if Alloy can:

1. generate a merge-plan object from evaluation
2. show that plan in the UI
3. materialize synthesis from that plan
4. rerun verification
5. show final synthesized diff and provenance

## What To Defer

Do not start with:
- symbol-level synthesis
- hunk-level synthesis
- `jj` operation mining
- database backend
- live LLM judge
- PR publishing

## Database Guidance

Do not add a database in the next slice.

Current recommendation:
- keep using `jj` + JSON manifests + session records

Later recommendation:
- add SQLite after the merge-plan and synthesis flow is stable

Reason:
- the current bottleneck is merge execution quality, not metadata indexing

## Suggested Test Coverage

Add tests for:
- merge-plan generation
- merge-plan schema validation
- synthesis from merge plan
- final synthesized diff exposure
- provenance exposure for synthesized files

## Notes

- Keep the synthesis strategy conservative.
- File-level composition is the target.
- Preserve reviewability over cleverness.
- Keep the competitive analysis doc out of scope unless explicitly requested.
