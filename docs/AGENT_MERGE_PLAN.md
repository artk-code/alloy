# Agent Merge Plan

Status date: March 8, 2026
Purpose: Give future agents and engineers a concrete implementation plan for Alloy's core value: combining the strongest code contributions in a readable, reviewable, and reliable way.

## Core Goal

Alloy should not merely pick a single winner. It should:

1. run multiple isolated candidate implementations
2. evaluate them deterministically
3. identify the strongest contributions by type
4. compose a final result in a fresh synthesis workspace
5. re-verify the result
6. present the final diff and provenance clearly enough for human review

## Execution Priorities

The current implementation priorities should be:

1. Consume blind-review recommendations on top of deterministic gates
   - deterministic evaluation stays the gatekeeper
   - blind review now gates publication when it disagrees with deterministic evaluation
   - next step:
     - use blind review earlier in merge guidance
     - keep publication gating intact
     - never let blind review rescue a failed deterministic run

2. Local candidate and synthesis testing
   - this is now implemented in `Review`
   - next step:
     - refine target ranking if needed
     - keep the commands and workspace path obvious

3. Structured Task Composer expansion
   - task creation/import now exists in `Tasks`
   - guided fields now exist and should remain the primary UX
   - next step:
     - improve saved-task editing
     - improve import warnings
     - keep raw markdown as an advanced path only

4. Broader evaluation coverage
   - add two fast tasks first:
     - `FizzBuzz CLI`
     - `Roman Numerals`
   - keep the current bugfix and security demos for heavier review and synthesis testing

5. PR creation from the pushed synthesis ref
   - publish preview, approval, and push are already implemented
   - PR automation should build on the pushed-ref state, not bypass it
   - detailed method plan:
     - [PUBLICATION_FLOW_PLAN.md](/Users/codex/stack-judge/docs/PUBLICATION_FLOW_PLAN.md)

6. Compare-surface refinement later
   - improve side-by-side candidate vs synthesis review ergonomics
   - add a clearer `jj` stack timeline/history surface for humans

7. SQLite metadata layer later
   - useful once project count and run history outgrow raw artifact scanning

8. Trace grading and `jj` operation-history mining later
   - add trace-oriented review once blind-review consumption is stable
   - mine conflicts and `jj` operations only after the core merge loop is mature

Focus now:
- make review decisions more trustworthy
- make local validation easier
- make task authoring easier without dropping to the filesystem

Do not focus first on:
- operation mining
- trace grading
- broad analytics
- additional orchestration layers

## Current State

Alloy already has the right V1 foundation:

- candidate `jj` capture: [jj.mjs](/Users/codex/stack-judge/src/jj.mjs)
- synthesis workspace creation: [synthesis.mjs](/Users/codex/stack-judge/src/synthesis.mjs)

Current synthesis modes:
- `winner_only`
- `file_select`

This is the correct V1 boundary.

Current landed review features:
- dedicated compare page for candidate and synthesis diffs
- merge-plan and judge-rationale rendering
- separate `Tasks` page for guided task setup, demo loading, task creation/import, and candidate detail
- manual-override and contested-file cues
- review-oriented `jj` stack shaping metadata
- publication-readiness blockers for synthesized results
- persisted blind-review artifacts and async blind-review CLI recommendations

These foundations are already in place, so the next work should build on them rather than recreate them.

## Merge Strategy

The readable and reliable synthesis strategy is:

1. Shared base snapshot
   - every candidate starts from the same repo state

2. Isolated candidate workspace per agent
   - no shared mutable workspace across candidates

3. Capture each candidate as artifacts
   - changed files
   - unified patch
   - patch stats
   - verification results
   - `jj` revision and change IDs

4. Partition the merge problem by unit size
   - uncontested file: only one candidate changed the file
   - contested file: multiple candidates changed the file
   - later: contested symbol
   - last: contested hunk

5. Synthesize in a fresh workspace from base
   - never merge directly inside a candidate workspace
   - materialize selected contributions into a fresh synthesis workspace
   - rerun full verification
   - record the result as a new `jj` change

6. Present three review views
   - candidate vs base
   - final synthesis vs base
   - per-file provenance showing who contributed what and why

This is the path that is both understandable and operationally safe.

## What Not To Do

Do not start with arbitrary hunk merging across agents.

That is high-risk, hard to review, and likely to produce subtle regressions.

The progression should be:

1. whole-candidate selection
2. file-level synthesis
3. symbol-level synthesis for supported languages
4. hunk-level synthesis only when absolutely necessary

## How To Define "Strongest Contribution"

The strongest contribution should be decided by contribution type, not only by total score.

Contribution types:
- best core implementation
- best tests
- best docs or bug explanation
- best error handling
- best minimal patch

That means the merge plan should be able to express results like:

- base candidate: `A`
- take tests from `C`
- take documentation from `B`
- keep `src/core.js` from `A`

Alloy needs a structured merge-plan schema to make that practical.

## Merge-Plan Schema

Alloy now uses a machine-readable merge-plan object as the contract between:
- evaluator
- UI
- synthesis engine

Top-level fields:
- `base_candidate_id`
- `mode`
- `confidence`
- `file_decisions[]`
- `unresolved_conflicts[]`
- `rationale`
- `verification_expectation`

Per-file decision fields:
- `path`
- `chosen_candidate_id`
- `contender_candidate_ids`
- `decision_reason`
- `risk_level`
- `confidence`

Suggested JSON shape:

```json
{
  "base_candidate_id": "cand_a",
  "mode": "file_select",
  "confidence": "medium",
  "rationale": "Candidate A has the strongest core implementation. Candidate C provides stronger regression tests.",
  "verification_expectation": "full_repo_checks_required",
  "file_decisions": [
    {
      "path": "src/strategy.js",
      "chosen_candidate_id": "cand_a",
      "contender_candidate_ids": ["cand_a", "cand_b"],
      "decision_reason": "best core implementation",
      "risk_level": "medium",
      "confidence": "high"
    },
    {
      "path": "test/strategy.test.js",
      "chosen_candidate_id": "cand_c",
      "contender_candidate_ids": ["cand_a", "cand_c"],
      "decision_reason": "best regression coverage",
      "risk_level": "low",
      "confidence": "medium"
    }
  ],
  "unresolved_conflicts": []
}
```

## Readable Diff Strategy

Readable means:
- the final PR is not a giant blob
- humans can see the selected source per file
- contested files are obvious
- the synthesized diff is smaller and cleaner than a naive union of all candidate changes

When possible, shape the final `jj` result as:

1. tests
2. implementation
3. cleanup or docs

This will not always be possible, but it should be the default target because it produces a reviewable stack.

## `jj` Responsibilities

`jj` should be:
- the source of truth for code provenance
- the source of truth for final synthesized history
- the mechanism for diff capture
- the mechanism for later split, squash, and rebase operations

`jj` should not be:
- the only metadata store for the product UI

## Metadata Strategy

Short answer:

- `jj` is enough for code provenance
- `jj` is not enough for the full control plane

For MVP:
- no full database is required
- `jj` + JSON manifests + session records is enough

For a serious multi-project control panel:
- add a lightweight database
- use SQLite next, not Postgres

## Why `jj` Alone Is Not Enough

`jj` tracks code history well.
It does not cleanly solve:

- board queries across many projects
- session history
- provider auth and readiness snapshots
- run filters, pagination, and sorting
- evaluator metrics over time
- stale artifact indexing and cleanup
- operator preferences

The right model is:

- `jj` = code and change provenance
- JSON artifacts = raw run records
- SQLite = indexed control-plane metadata

## Suggested SQLite Scope

Store metadata only, not code.

Tables:
- `projects`
- `tasks`
- `runs`
- `candidates`
- `sessions`
- `evaluations`
- `syntheses`

Important fields:
- status
- provenance type
- candidate scores
- winner or synthesis decision
- selected files
- `jj` change IDs
- timestamps
- paths to artifacts

Code remains on disk and in version control:
- workspaces
- `jj`
- artifact files

## Near-Term Milestones

### Milestone 1: Blind Review Recommendation Consumption

Deliver:
- deterministic vs blind-review comparison in the UI
- clear decision rules for when blind review changes merge guidance
- publication blockers when blind review raises high-risk objections

Acceptance:
- deterministic checks still gate eligibility
- blind review improves close-call synthesis guidance without replacing hard gates

### Milestone 2: Local Testing Workflow

Deliver:
- one-click path/open flow for candidate and synthesis workspaces
- documented local validation flow in the UI

Acceptance:
- operator can open a candidate or synthesis workspace locally and run checks without hunting for paths

### Milestone 3: Tasks Page Cleanup

Deliver:
- guided task setup stays primary
- saved-task editing is clearer
- source import warnings stay visible
- save flow generates markdown from fields first
- raw markdown remains available for advanced users

Acceptance:
- operator can create, edit, and queue a task without manually creating files on disk

### Milestone 4: Fast Regression Tasks

Deliver:
- `FizzBuzz CLI`
- `Roman Numerals`
- `.task.md` cards plus acceptance commands

Acceptance:
- Alloy can validate queue -> run -> verify -> diff capture quickly without always running the heavier repo demos

### Milestone 5: PR Creation From Pushed Synthesis Ref

Deliver:
- PR creation only from a successful pushed synthesis ref
- persisted PR URL and status
- visible PR state in Review and Queue

Acceptance:
- operator can publish a reviewed synthesis into one PR without bypassing the pushed-ref gate

### Milestone 6: Compare Surface Refinement

Deliver:
- stronger side-by-side candidate vs synthesis review
- clearer per-file provenance review cues
- `jj` stack timeline/history surface in `Review`

Acceptance:
- humans can inspect both file-level provenance and final stack history without reading raw JSON

### Milestone 7: SQLite Metadata Layer

Deliver:
- SQLite metadata store for projects, tasks, runs, candidates, and syntheses
- migration path from raw artifact scanning

Acceptance:
- board queries and session history no longer depend on directory scanning alone
- `jj` remains the source of truth for code provenance

### Milestone 8: Trace Grading And `jj` Operation Mining

Deliver:
- trace-aware review artifacts layered on top of existing evaluation
- later-stage mining of `jj` operation history and conflict patterns

Acceptance:
- Alloy can learn from review traces and VCS operations without those systems becoming dependencies for the core merge loop

## Implementation Guidance For Future Agents

Build the synthesis engine conservatively.

Preferred sequence from the current state:

1. consume blind-review recommendations earlier in merge guidance
2. tasks page cleanup
3. fast regression tasks
4. PR creation from the pushed synthesis ref
5. compare-surface refinement
6. SQLite control-plane metadata
7. trace grading and `jj` operation-history mining
8. symbol-level synthesis for selected languages

Do not jump directly to:
- free-form hunk splicing
- automatic conflict resolution across unrelated candidate edits
- advanced `jj` analytics before the merge loop is stable

## Summary

The direct path to Alloy's core value is:

1. make candidate and final diffs easy to compare
2. express merge intent as structured data
3. execute synthesis conservatively in a fresh workspace
4. re-verify everything
5. keep provenance obvious

That is how Alloy can combine the strongest code contributions in a readable, reviewable, and reliable way.

## Appended Priority Ladder

This is the practical build order from the current shipped state:

1. Blind-review recommendation consumption
   - Publication gating is already implemented.
   - The next step is to use blind review earlier to refine close-call merge guidance before synthesis.

2. Local testing workflow
   - Implemented in `Review`.
   - Preserve it while improving task authoring and faster eval coverage.

3. Structured Task Composer expansion
   - Basic task creation/import already exists in `Tasks`.
   - Keep markdown as the source of truth, but keep it behind the guided setup flow.

4. Broader eval coverage
   - Add `FizzBuzz CLI` and `Roman Numerals` so Alloy can be regression-tested quickly.

5. PR creation from the pushed synthesis ref
   - Build this only on top of the explicit push state and human approval flow.

6. Compare-surface refinement
   - Improve the side-by-side review ergonomics and show the final `jj` stack as history, not only files.

7. SQLite later
   - Add only when run history and multi-project querying outgrow raw artifact scanning.

8. Trace grading and `jj` operation mining later
   - Add once blind review and local testing are solid enough to produce useful learning signals.
