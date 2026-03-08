# Alloy Operator Guide

This guide is for humans running Alloy from the Control Panel and the compare workspace.

## What Alloy Does

Alloy runs multiple CLI coding agents against the same task, captures each candidate as a real workspace diff, evaluates them deterministically, and lets a human review or synthesize the strongest result.

Core surfaces:
- `Control Panel`: task board, provider readiness, run config, task editing
- `Compare Diffs`: candidate patch review, merge-plan inspection, synthesis controls

Current limitation:
- custom tasks still come from `.task.md` files on disk
- an in-app Task Composer is planned and should become the normal way to create/edit user tasks

## Before You Run Anything

1. Start the web UI.

```bash
npm run web
```

2. Check the provider panel.

What to look for:
- `installed`: the CLI binary is present
- `valid`: Alloy can observe a working auth state
- `manual check`: the provider does not expose a safe auth status probe here

3. Repair auth if needed.

```bash
npm run login:codex
npm run login:gemini
npm run login:claude
```

If Gemini shows `manual check`, use `Test Auth` from the provider panel and confirm the CLI session manually.

## Baseline Demo Evals

These prove the sample repos are genuinely broken before any agent fix.

### Tic-Tac-Toe Perfect Play

```bash
cd samples/repos/tic-tac-toe
npm test
node scripts/eval-perfect-play.mjs
```

Expected baseline:
- unit tests fail
- exhaustive perfect-play evaluator fails

### SQL Injection Security Demo

```bash
cd samples/repos/security-sqli
npm test
node scripts/eval-security-fix.mjs
```

Expected baseline:
- tests or security evaluator fail until the bug is fixed

## Preview vs Live Runs

From the Control Panel:
- `Prepare Run`: seed workspaces and prompt packets only
- `Preview Commands`: show the CLI launch plan without provider execution
- `Run Live`: execute the enabled provider CLIs, then verify and evaluate the results

Use preview first when:
- provider login is uncertain
- you changed the task markdown
- you want to inspect the generated run shape before spending time in live sessions

Use live run when:
- the provider panel looks healthy
- the task brief is ready
- the acceptance checks are defined and runnable

## How To Generate Candidate Diffs

1. Select a task card.
   - selecting the card focuses that task in the Operator View and updates the URL for sharing
2. Confirm which providers and agent counts are enabled.
3. Run `Preview Commands` if you want a zero-cost launch check.
4. Run `Run Live` to create real candidate workspaces and verifier output.
5. Open `Compare Diffs` from the top nav or task header.

Alloy will then show:
- each candidate patch captured from `jj`
- deterministic scores and eligibility
- merge-plan guidance
- judge rationale
- any available synthesis diff
- publication preview and approval state
- `jj` stack-shape summaries for synthesized results

## How To Review And Build A Synthesis

Inside `Compare Diffs`:

1. Review the task summary and deterministic decision.
2. Inspect candidate diffs one by one.
3. Check the merge-plan section:
   - base candidate
   - per-file recommendations
   - unresolved contested files
4. Check the judge rationale section:
   - overview
   - next action
   - risk flags
   - operator guidance
5. If the recommended winner is strong enough, finalize the whole candidate.
6. If file-level review is needed, adjust the selected source per file.
7. Build the synthesis workspace.
8. Review the synthesized diff and per-file provenance.
9. Use `Preview Publication` to refresh the publish target and blocker state.
10. Use `Approve Publication` once the synthesized result is acceptable.
11. Use `Push Approved Ref` to publish the approved bookmark/branch target.
12. Treat PR publication as a later step; push is the current remote publication boundary.

Important rule:
- Alloy is conservative by design
- file-level synthesis is the current target
- arbitrary hunk merging is intentionally out of scope for now

## Where The Artifacts Live

Run artifacts are stored under `runs/`.

Typical contents:
- `run-summary.json`
- `evaluation.json`
- `events/run-events.jsonl`
- `candidates/*/manifest.json`
- `candidates/*/workspace`
- `synthesis/*/manifest.json`
- `synthesis/*/workspace`

What matters most during debugging:
- candidate manifest
- verifier stdout/stderr
- captured patch
- synthesis manifest
- run summary

## Useful Commands

Repo root checks:

```bash
npm test
npm run doctor
npm run task:run:dry
```

Tic-tac-toe demo baseline:

```bash
cd samples/repos/tic-tac-toe
npm test
node scripts/eval-perfect-play.mjs
```

Security demo baseline:

```bash
cd samples/repos/security-sqli
npm test
node scripts/eval-security-fix.mjs
```

## How To Read Status Honestly

Alloy distinguishes run provenance.

Common states:
- `Prepared`: workspace exists, no provider execution yet
- `Previewed`: launch plan only
- `Live CLI Run`: current pipeline captured a provider CLI run
- `Fixture Replay`: useful plumbing proof, not live provider proof
- `Legacy Artifact`: older historical run data
- `Passing Candidates`: at least one candidate passed deterministic gates
- `Winner Ready`: a deterministic winner exists
- `Needs Merge`: file-level synthesis or review is still needed
- `Synthesized`: a synthesis workspace was built and reverified

## Recommended Human Workflow

1. Verify provider readiness.
2. Confirm the task markdown.
3. Preview commands.
4. Run live candidates.
5. Open compare diffs.
6. Inspect the merge plan.
7. Approve winner-only or perform file-level synthesis.
8. Review the synthesized diff before any publication step.
9. Preview publication and record approval if the synthesis is ready.
10. Push the approved ref once the target and blockers look correct.
