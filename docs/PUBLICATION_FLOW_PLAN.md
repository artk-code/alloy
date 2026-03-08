# Publication Flow Plan

Status date: March 8, 2026
Purpose: Turn Alloy's current publication-readiness metadata into a real operator-controlled publication flow without pretending remote PR publication is already complete.

## Goal

Make publication a first-class, reviewable workflow:

1. Alloy determines whether a synthesis is publishable.
2. The operator can see the exact blockers.
3. The operator can approve publication explicitly.
4. Alloy can generate a local publish preview.
5. Alloy can later push a named branch or bookmark from the shaped `jj` stack.

This step does not require PR automation yet.

## Current Baseline

Already implemented:

- synthesis manifests include `publication_readiness`
- `Compare Diffs` renders publication-readiness status and blockers
- synthesized runs include `stack_shape`
- synthesized runs include `jj` capture metadata
- operator UI already separates review from synthesis actions

Current shipped slice:

- publication is no longer read-only
- explicit approval state is persisted
- local publish preview is persisted
- publish target metadata is persisted
- publication endpoints exist for preview and approval

Current limitation:

- branch/bookmark push is not implemented yet
- PR automation is not implemented yet

## Scope For This Step

Publication now exists in three layers:

1. publication contract
2. publication preview
3. publication approval

Remaining layer for the next slice:

4. publication push

Defer:

- automatic PR creation
- browser-triggered remote push before the contract is clear
- provider-driven publish decisions

## Contract

Publication should be derived from one synthesis manifest.

Required conditions:

- synthesis verification passed
- merge plan has no unresolved conflicts
- `jj` diff capture succeeded
- stack shape is either `shaped` or `not_needed`
- all manual overrides are visible in provenance
- the operator has explicitly approved publication

Suggested states:

- `blocked`
- `review_ready`
- `awaiting_approval`
- `approved`
- `push_ready`
- `pushed`
- `publish_failed`

## Method-Level Plan

### 1. `src/synthesis.mjs`

Add or refactor these methods:

- `buildPublicationReadiness({ manifest, mergePlan })`
  - keep as the low-level readiness calculator
  - return stricter machine-readable fields:
    - `status`
    - `ready`
    - `blockers`
    - `required_actions`
    - `eligible_for_approval`

- `buildPublicationPreview({ manifest, task, summary })`
  - produce the exact publish candidate summary:
    - selected synthesis ID
    - stack groups
    - candidate contributors
    - target files
    - target diff summary
    - target branch/bookmark suggestion

- `buildPublicationState({ manifest, task, summary })`
  - unify readiness + approval + preview shape
  - this should become the source of truth consumed by the UI and APIs

- `approvePublication({ runDir, approvedBy, approvedAt, note })`
  - persist explicit approval metadata into synthesis manifest and run summary
  - do not push anything yet

- `refreshPublicationState({ runDir, task })`
  - recompute publication state from current synthesis artifacts
  - used after synthesis, after approval, and later after push

### 2. `src/jj.mjs`

Add publication-prep helpers:

- `suggestPublishRef({ taskId, synthesisId })`
  - deterministic bookmark/branch suggestion

- `readStackForPublication({ workspacePath })`
  - summarize current shaped stack for preview
  - return revisions, change IDs, and commit messages

- `exportPublicationPatchRange({ workspacePath, fromRev, toRev, outputPath })`
  - optional artifact for preview/debug

Next helper to implement:

- `pushBookmark({ workspacePath, bookmark, remote })`
  - push an approved synthesized stack
  - persist success/failure data for the UI and artifacts

### 3. `src/web/data.mjs`

Add a publication view model:

- `buildPublicationView(summary, synthesis, task)`
  - flatten publication state for the UI
  - include:
    - status
    - blockers
    - required actions
    - approval state
    - preview summary
    - target remote
    - target branch/bookmark

Expose it from:

- `getTaskDetail()`
- `getSynthesisDiff()`

### 4. `src/web/server.mjs`

Add explicit publication endpoints:

- `GET /api/tasks/:taskId/publication`
  - return publication view/state only

- `POST /api/tasks/:taskId/publication/preview`
  - recompute and persist the preview/state
  - no remote side effects

- `POST /api/tasks/:taskId/publication/approve`
  - record operator approval
  - accept:
    - `approved_by`
    - `note`

Next endpoint to implement:

- `POST /api/tasks/:taskId/publication/push`

Still defer:

- `POST /api/tasks/:taskId/publication/pr`

### 5. `ui/compare.js`

Add a dedicated publication panel renderer:

- `renderPublicationPanel(publicationView)`
  - show:
    - publication status
    - blockers
    - required actions
    - approval state
    - publish preview
    - target branch/bookmark

Add actions:

- `Preview Publication`
  - calls `/publication/preview`

- `Approve Publication`
  - calls `/publication/approve`

Next action to add:

- `Push Approved Ref`

Still do not add:

- `Open PR`

### 6. `ui/app.js`

Add a compact publication summary in the operator view:

- synthesis status
- approval status
- blocker count
- link into `Compare Diffs` publication panel

This should stay summary-only.
The detailed publication workflow belongs on `Compare Diffs`.

## Data Additions

Add to synthesis manifest and run summary:

- `publish_status`
- `publish_blockers`
- `publish_required_actions`
- `human_approved_at`
- `human_approved_by`
- `human_approval_note`
- `publish_preview`
- `target_remote`
- `target_branch_or_bookmark`
- `pushed_at`
- `push_result`

Keep these under a single nested object when possible:

```json
{
  "publication": {
    "status": "awaiting_approval",
    "blockers": [],
    "required_actions": ["Approve publication before any remote push."],
    "human_approved_at": null,
    "human_approved_by": null,
    "human_approval_note": null,
    "target_remote": "origin",
    "target_branch_or_bookmark": "alloy/task_20260308_tic_tac_toe_perfect_play/synth_...",
    "publish_preview": {
      "stack_group_count": 3,
      "diff_summary": "3 files changed, 82 insertions, 17 deletions",
      "selected_candidates": ["cand_a", "cand_c"]
    }
  }
}
```

## UI Rules

The publication UI should answer four questions immediately:

1. Is this only reviewable, or publishable?
2. What blocks publication right now?
3. Has a human approved publication?
4. What exact stack/ref would be published?

Display rules:

- blocked state is red
- awaiting approval is neutral
- approved/push-ready is positive
- always show blockers before any action buttons
- always show provenance and manual overrides beside publication status

## Tests

Add tests for:

### `test/synthesis.test.mjs`

- publication state is `blocked` when verification fails
- publication state is `blocked` when unresolved conflicts exist
- publication state becomes `awaiting_approval` when all readiness checks pass
- approval persistence updates the synthesis manifest and run summary

### `test/web.test.mjs`

- publication endpoints return expected shape
- approval endpoint rejects tasks without synthesis
- preview endpoint returns target branch/bookmark and blocker state

### `test/ui-state.test.mjs`

- publication panel state mapping
- blocker rendering
- approval button visibility rules

## Acceptance Criteria

This step is complete when:

Already complete:

1. `Compare Diffs` shows a dedicated publication panel.
2. The operator can trigger a local publication preview.
3. The operator can record explicit approval.
4. Alloy persists approval and preview metadata in artifacts.
5. The operator can tell the exact next publishable ref without reading raw JSON.

Remaining for publication flow:

6. Alloy can push the approved shaped ref and persist the result honestly.
7. No PR automation is implied before that push contract is clear.

## Out Of Scope For This Step

- automatic remote push
- automatic PR creation
- GitHub metadata generation
- SQLite metadata storage
- browser automation for publication actions

## Recommended Implementation Order

Completed:

1. data model and synthesis helpers
2. publication API endpoints for preview and approval
3. compare-page publication panel
4. operator summary panel
5. tests

Next:

6. push helper in `jj`
7. publication push endpoint
8. compare-page push action
9. push-result persistence and tests
