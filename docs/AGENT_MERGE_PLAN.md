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

1. Publication flow from the shaped synthesis stack
   - publish preview
   - explicit human approval
   - branch or bookmark push
   - later PR creation
   - detailed method plan:
     - [PUBLICATION_FLOW_PLAN.md](/Users/codex/stack-judge/docs/PUBLICATION_FLOW_PLAN.md)

2. Blind judge/composer on top of deterministic gates
   - deterministic evaluation stays the gatekeeper
   - judge/composer improves close-call synthesis decisions

3. Local candidate and synthesis testing
   - one-click operator flow to open and test a candidate or synthesis workspace locally

4. Broader evaluation coverage
   - smoke tasks
   - compact algorithm tasks
   - realistic bugfix and security tasks

5. SQLite metadata layer later
   - useful once project count and run history outgrow raw artifact scanning

Focus now:
- publication readiness
- human-reviewable synthesis decisions
- reliable local validation

Do not focus first on:
- operation mining
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
- manual-override and contested-file cues
- review-oriented `jj` stack shaping metadata
- publication-readiness blockers for synthesized results

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

### Milestone 1: Publication Preview And Approval

Deliver:
- publication panel in `Compare Diffs`
- explicit publication blockers
- human approval capture
- local publish preview for the shaped synthesis stack

Acceptance:
- operator can tell whether a synthesis is only reviewable or truly publishable
- operator can see what exact stack/diff would be published next

### Milestone 2: Blind Judge And Composer

Deliver:
- anonymized candidate presentation for judging
- structured judge output layered on top of deterministic gates
- composer path for close-call synthesis decisions

Acceptance:
- deterministic checks still gate eligibility
- judge/composer improves close-call synthesis without replacing hard gates

### Milestone 3: Local Testing Workflow

Deliver:
- one-click path/open flow for candidate and synthesis workspaces
- documented local validation flow in the UI

Acceptance:
- operator can open a candidate or synthesis workspace locally and run checks without hunting for paths

### Milestone 4: Broader Eval Coverage

Deliver:
- smoke task(s)
- compact algorithm task(s)
- continued realistic bugfix/security tasks

Acceptance:
- Alloy can be demoed quickly on small tasks and credibly on richer synthesis tasks

### Milestone 5: SQLite Metadata Layer

Deliver:
- SQLite metadata store for projects, tasks, runs, candidates, and syntheses
- migration path from raw artifact scanning

Acceptance:
- board queries and session history no longer depend on directory scanning alone
- `jj` remains the source of truth for code provenance

## Implementation Guidance For Future Agents

Build the synthesis engine conservatively.

Preferred sequence from the current state:

1. publication preview and approval flow
2. blind judge/composer on top of deterministic gates
3. local testing workflow
4. broader eval coverage
5. SQLite control-plane metadata
6. symbol-level synthesis for selected languages

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

1. Publication flow
   - Highest leverage because Alloy can already produce reviewable syntheses but cannot yet turn them into an explicit publish decision.
   - Build:
     - publish preview
     - approval gate
     - blocker model
     - branch/bookmark target metadata
   - see:
     - [PUBLICATION_FLOW_PLAN.md](/Users/codex/stack-judge/docs/PUBLICATION_FLOW_PLAN.md)

2. Blind judge/composer
   - Highest product differentiation after publication readiness.
   - Keep deterministic evaluation as the gatekeeper; use judge/composer only for close-call synthesis decisions.

3. Local testing workflow
   - Make candidate and synthesis workspaces easy to open and validate locally.
   - This improves operator confidence and shortens debugging loops.

4. Broader eval coverage
   - Add smoke and compact algorithm tasks so Alloy can be demonstrated quickly and regression-tested cheaply.

5. SQLite later
   - Add only when run history and multi-project querying outgrow raw artifact scanning.
