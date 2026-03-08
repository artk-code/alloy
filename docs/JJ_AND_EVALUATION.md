# Alloy jj And Evaluation Architecture

Status: Implemented initial slice
Authoring date: March 8, 2026
Purpose: Describe how Alloy currently bootstraps candidate workspaces with `jj`, captures diff artifacts, and performs deterministic candidate evaluation.

## 1. Current Scope

This document describes the current working implementation of:
- `JjAdapter`
- candidate patch capture
- deterministic `EvaluationEngine`
- conservative synthesis workspaces

This is still not the final judge/composer system. It is now the artifact, scoring, and conservative merge layer that must exist before higher-order model-driven synthesis becomes trustworthy.

## 2. Current Working Model

Each candidate workspace is seeded from the same repo snapshot.

Immediately after seeding, Alloy:
1. initializes a colocated `jj` repo in that workspace
2. creates a base snapshot commit that captures the seeded repo state
3. leaves the working copy empty on top of that base snapshot

That means candidate code changes are later represented as the working-copy delta from `@-` to `@`.

This avoids a common failure mode where the initial workspace seed pollutes the candidate diff.

## 3. Why The Base Snapshot Matters

Without a base snapshot commit, `jj` would see all seeded files as additions from the empty root.

That would make every candidate diff look like:
- the entire repo was added
- plus the actual code change

The base snapshot isolates the candidate's real edit set.

## 4. Current Adapter Flow

Current module:
- `src/jj.mjs`

### 4.1 Workspace Bootstrap

`bootstrapWorkspace()` currently does this:

```text
jj git init .
jj commit -m "Alloy base snapshot ..."
```

Result:
- `@-` is the seeded base snapshot
- `@` is the working-copy change ready for candidate edits

### 4.2 Candidate Capture

After a candidate run finishes, Alloy calls `captureCandidateSnapshot()`.

It currently does this:

```text
jj describe -m "Alloy candidate ..."
jj status
jj diff --from @- --to @ --summary
jj diff --from @- --to @ --git
jj diff --from @- --to @ --name-only
jj log -r @ --no-graph ...
jj log -r @- --no-graph ...
```

Artifacts written per candidate:
- `candidate.patch`
- `diff-summary.txt`
- `jj-status.txt`
- manifest `jj` metadata
- manifest `changed_files`

## 5. Manifest Fields Added By jj Capture

Candidate manifests now carry:
- `changed_files`
- `jj.status`
- `jj.base_revision`
- `jj.candidate_revision`
- `jj.patch_stats`
- `jj.diff_summary`

This gives the evaluator concrete inputs instead of forcing it to infer from logs.

## 6. Deterministic Evaluation Engine

Current module:
- `src/evaluation.mjs`

Current output schema:
- `schemas/evaluation-result.schema.json`

### 6.1 Inputs

The evaluator currently uses:
- candidate status
- verification pass/fail
- changed file list
- patch statistics
- allowed path rules
- blocked path rules
- presence of a candidate summary

### 6.2 Current Scorecard

Current deterministic score components:
- `correctness`: 60
- `completion`: 10
- `path_discipline`: 15
- `minimality`: 10
- `summary_quality`: 5

Total possible score:
- 100

### 6.3 Eligibility Rules

A candidate is currently eligible if:
- verification passed
- no blocked paths were touched
- at least one file changed

### 6.4 Current Output

Run-level evaluation currently writes:
- `runs/<run>/evaluation.json`
- per-candidate `scorecard.json`
- `summary.evaluation` in `run-summary.json`

It also produces:
- ranked candidate list
- pairwise deterministic preferences
- contribution map
- decision object

### 6.5 Current Decision Modes

The deterministic evaluator currently returns one of:
- `winner`
- `synthesize`
- `no_winner`

Current meaning:
- `winner`: one candidate is clearly best by deterministic rules
- `synthesize`: top deterministic candidates are close enough that a synthesis pass should be considered
- `no_winner`: nothing passed deterministic gates

Important:
- `synthesize` is currently a recommendation only
- the actual multi-candidate composer is still upcoming

## 7. Current Runner Integration

Current runner integration lives in:
- `src/runner.mjs`

After a candidate process finishes, Alloy now does this:
1. run acceptance checks
2. capture `jj` artifacts
3. write updated manifest
4. evaluate the completed run across all candidate manifests
5. write run-level evaluation output

New run events now include:
- `jj.capture.started`
- `jj.capture.completed`
- `jj.capture.failed`
- `evaluation.completed`
- `synthesis.completed`
- `synthesis.failed`

If `run_config.merge_mode` is `auto` and deterministic evaluation returns a clear `winner`, Alloy now creates a winner-only synthesis workspace automatically.

## 8. Current Conservative Synthesis

Current module:
- `src/synthesis.mjs`

Supported synthesis strategies:
- `winner_only`
- `file_select`

Current flow:
1. seed a fresh synthesis workspace from the task repo baseline
2. bootstrap `jj` so the seeded baseline becomes `@-`
3. copy either:
   - all changed files from the winning candidate, or
   - only the file selections provided by the operator
4. rerun the real acceptance checks
5. capture the synthesized `jj` diff and manifest
6. store synthesis metadata back into `run-summary.json`

Current output:
- `runs/<run>/synthesis/<synthesis-id>/manifest.json`
- synthesis `candidate.patch`
- synthesis `diff-summary.txt`
- synthesis verification logs

This is intentionally conservative. It does not do hunk-level splicing or cross-candidate `jj` history surgery yet.

## 9. What This Enables Next

This slice is enough to support the next stages cleanly:
- real winner selection and file-select merge control in the GUI
- blind evaluator/judge overlays on top of deterministic ranking
- synthesis planning against real patches
- `jj`-backed final stack assembly

## 10. Current Limitations

Current limitations are intentional:
- no AST-aware merge planning yet
- no LLM judge yet
- no autonomous multi-candidate composer yet
- no `jj` cross-candidate import/rebase flow yet
- no PR shaping/publishing through `jj` yet

## 11. Recommended Next Implementation Order

1. expose synthesized diff artifacts beside candidate diffs in the GUI
2. add a structured judge output layer on top of deterministic gates
3. teach the composer to produce explicit merge plans before touching files
4. shape the final result into a clean `jj` stack
5. publish one PR from that stack
