# Publication Flow Plan

Status date: March 8, 2026
Purpose: Turn Alloy's current publication-readiness metadata into a real operator-controlled publication flow without pretending remote PR publication is already complete.

## Goal

Make publication a first-class, reviewable workflow:

1. Alloy determines whether a synthesis is publishable.
2. The operator can see the exact blockers.
3. The operator can approve publication explicitly.
4. Alloy can generate a local publish preview.
5. Alloy can push a named branch or bookmark from the shaped `jj` stack.

This plan does not require PR automation yet.

## Current Baseline

Already implemented:

- synthesis manifests include `publication_readiness`
- `Review` renders publication-readiness status and blockers
- synthesized runs include `stack_shape`
- synthesized runs include `jj` capture metadata
- operator UI already separates review from synthesis actions

Current shipped slice:

- publication is no longer read-only
- explicit approval state is persisted
- local publish preview is persisted
- publish target metadata is persisted
- publication endpoints exist for preview, approval, and push
- approved syntheses can push a real bookmark/branch target through `jj`
- push success and failure are persisted for the UI and artifacts

Current limitation:

- PR automation is not implemented yet

## Scope For This Step

Publication now exists in four layers:

1. publication contract
2. publication preview
3. publication approval
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

- `Push Approved Ref`

Still do not add:

- `Open PR`

### 6. `ui/app.js`

Add a compact publication summary in the operator view:

- synthesis status
- approval status
- blocker count
- link into `Review` publication panel

This should stay summary-only.
The detailed publication workflow belongs on `Review`.

## Data Additions

Shipped in synthesis manifest and run summary:

- `publish_status`
- `publish_blockers`
- `publish_required_actions`
- `human_approved_at`
- `human_approved_by`
- `human_approval_note`
- `publish_preview`
- `target_remote`
- `target_branch_or_bookmark`
- `published_ref`
- `pushed_at`
- `push_result`
- `push_error`

Keep these under a single nested object when possible:

```json
{
  "publication": {
    "status": "push_ready",
    "blockers": [],
    "required_actions": ["Push the approved bookmark or branch to the configured remote."],
    "human_approved_at": "2026-03-08T12:00:00.000Z",
    "human_approved_by": "human-ui",
    "human_approval_note": "Reviewed in Review",
    "target_remote": "origin",
    "target_branch_or_bookmark": "alloy/task_20260308_tic_tac_toe_perfect_play/synth_...",
    "published_ref": null,
    "publish_preview": {
      "stack_group_count": 3,
      "diff_summary": "3 files changed, 82 insertions, 17 deletions",
      "selected_candidates": ["cand_a", "cand_c"]
    },
    "pushed_at": null,
    "push_result": null,
    "push_error": null
  }
}
```

## Recommended Next Step After This Plan

Publication push is now stable enough for the current prototype.

Next:

1. consume blind-review recommendations in synthesis/publication decisions
2. add local candidate/synthesis testing
3. add PR automation from the pushed ref only after those two layers are solid

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
- push button visibility rules

## Acceptance Criteria

This step is complete when:

1. `Review` shows a dedicated publication panel.
2. The operator can trigger a local publication preview.
3. The operator can record explicit approval.
4. Alloy persists approval and preview metadata in artifacts.
5. The operator can tell the exact next publishable ref without reading raw JSON.
6. Alloy can push the approved shaped ref and persist the result honestly.
7. No PR automation is implied before that push contract is clear.

## Out Of Scope For This Step

- automatic PR creation
- GitHub metadata generation
- SQLite metadata storage
- browser automation for publication actions

## Recommended Implementation Order

Completed:

1. data model and synthesis helpers
2. publication API endpoints for preview, approval, and push
3. compare-page publication panel with preview/approval/push actions
4. operator summary panel
5. push success/failure persistence
6. tests

Next:

1. PR creation from the approved, pushed ref
2. PR result persistence and UI
3. publication status link-back from task cards and summaries
