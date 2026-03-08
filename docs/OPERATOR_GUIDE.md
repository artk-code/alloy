# Alloy Operator Guide

This guide is for humans running Alloy from the Queue, Tasks, and Review.

## What Alloy Does

Alloy runs multiple CLI coding agents against the same task, captures each candidate as a real workspace diff, evaluates them deterministically, and lets a human review or synthesize the strongest result.

Core surfaces:
- `Queue`: queued work only, provider readiness, run plan, and compact task summary
- `Tasks`: task catalog, structured task setup, source generation/import, parsed task review, and candidate/evaluation detail
- `Review`: candidate patch review, merge-plan inspection, synthesis controls, blind review, and publication

Current limitation:
- the current Task Composer is structured-first, but raw markdown still remains part of the save path
- importing markdown from arbitrary locations is an advanced-user testing path with limited security guardrails

## Workflow At A Glance

```text
Queue  ->  Tasks  ->  Review
monitor    author     inspect / synthesize / publish
run work   import     blind review / approve / push
```

Practical rule:
- if it is not queued, it should not appear on `Queue`
- if you want to create, import, or edit a task, use `Tasks`
- if you want to compare diffs or approve publication, use `Review`

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

## Create, Load, Or Import A Task

Use `Tasks` when you need to create, load, duplicate, or queue task briefs.

### Recommended path: use Guided Fields

1. Open `Tasks`.
2. In `Quick Start`, choose a template:
   - `New Project`
   - `Existing Repo Bugfix`
   - `Existing Repo Feature`
   - `Security Repair`
3. Set:
   - project label
   - repo or repo path
   - acceptance checks
   - provider set
   - blind review CLI if needed
4. Optional: choose a demo scenario and click `Load Demo Into Setup`.
5. Click `Generate Task Source`.
6. Review the parsed summary and validation output.
7. Click `Save Task File`.

What `Save Task File` does:
- generates markdown from the current guided fields
- validates it as an Alloy task
- writes a new `.task.md` file under `samples/tasks/`

### Demo scenarios

Demo tasks live in markdown under `samples/tasks/`, but you should not need to hunt for them in the filesystem.

Use either of these paths from `Tasks`:
- `Quick Start -> Demo Scenario -> Load Demo Into Setup`
- `Task Catalog -> Demo Scenarios`

Important:
- demos are seed examples
- they can be loaded, duplicated, queued, or deleted from the filesystem
- they are meant to teach the workflow, not stay immutable forever

### Raw markdown path

Use raw markdown only when you need fine-grained control.

1. Open `Tasks`.
2. Expand `Task Source`.
3. Paste or edit markdown directly.
4. Use `Save Current Source As File` if you want to preserve those manual edits exactly.

The markdown must still include real Alloy fields in frontmatter, including:
- `task_id`
- `project_id`
- `project_label`
- `repo`
- `base_ref`
- `mode`
- `providers`
- `judge`
- `max_runtime_minutes`
- `risk_level`
- `human_review_policy`

The parser also expects body sections like:
- `# Task`
- `## Context`
- `## Requirements`
- `## Constraints`
- `## Acceptance Checks`

### Import a task from the filesystem

1. Open `Tasks`.
2. Set `Source File Path` to an existing local markdown file.
3. Click `Import Source File`.
4. Review the parsed task and validation output.
5. Save it with `Save Task File` or `Save Current Source As File`.

Current import sanity checks:
- only `.md` and `.markdown` sources are accepted
- source must be a real file
- source must be smaller than the current import size limit
- binary-looking files are rejected
- imported markdown still goes through Alloy task parsing and validation before save

### Security warning

This import flow is for advanced users in a testing build.

Do not import unknown markdown files at this stage.

Reasons:
- imported markdown becomes task input for provider runs, evaluation, and synthesis planning
- this build does not yet implement a hardened task-ingestion security model
- Alloy currently assumes the operator is choosing trusted local content deliberately

Safe current practice:
- prefer Guided Fields first
- author task markdown yourself when possible
- import only trusted local files you understand
- review the parsed task and acceptance checks before running any provider

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

From the Queue:
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

## How To Use The Run Plan

The `Run Plan` column is ordered to match how Alloy actually executes work.

1. Choose candidate providers.
   - enable only the CLIs you want to launch
   - set the agent count per provider
   - set profile and transport if needed

2. Read the provider state honestly.
   - `live ready`: safe to launch live now
   - `manual check`: preview is fine, but verify login manually before live run
   - `live blocked`: preview can still generate commands, but live run will fail until install/login is repaired
   - `disabled`: this provider will not be included

3. Choose review controls.
   - `Blind Review CLI`: optional
     - `Deterministic only` means Alloy will stop at disk-based verification, scoring, merge plan, and judge rationale
     - choosing a CLI here means you can later run an async blind review from `Review`
   - `Merge Mode`:
     - `auto`: only auto-finalize a clear deterministic winner
     - `hybrid`: produce a merge recommendation but keep human approval at the merge boundary
     - `manual`: never finalize automatically

4. Run the task in order.
   - `Prepare Run`
   - `Preview Commands`
   - `Run Live`

Important:
- deterministic evaluation always runs from saved artifacts after live candidate sessions
- blind review is optional and runs later against artifacts on disk
- a blind review CLI is not required to run candidates or get a merge plan

## Queue A Task And Run It

`Queue` only shows entries from `runtime/task-queue.json`.

That means:
- a task file on disk is not automatically queued
- saving a task in `Tasks` does not automatically make it runnable
- add or remove queue entries from `Tasks`

Recommended sequence:

1. Create or load a task in `Tasks`.
2. Use `Add To Queue`.
3. Go back to `Queue`.
4. Select the queued task.
5. Run `Prepare Run`, `Preview Commands`, or `Run Live`.

## How To Generate Candidate Diffs

1. Select a task card in `Queue`.
   - selecting the card focuses that task and updates the URL for sharing
2. Open `Tasks` when you need task setup, source generation, parsed task detail, or candidate/evaluation detail.
3. Confirm which providers and agent counts are enabled in `Queue`.
4. Run `Preview Commands` if you want a zero-cost launch check.
5. Run `Run Live` to create real candidate workspaces and verifier output.
6. Open `Review` from the top nav or task header.

Alloy will then show:
- each candidate patch captured from `jj`
- deterministic scores and eligibility
- merge-plan guidance
- judge rationale
- any available synthesis diff
- publication preview and approval state
- `jj` stack-shape summaries for synthesized results

## How To Review And Build A Synthesis

Inside `Review`:

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
9. If you want a separate async blind review, use `Blind Review Controls`:
   - choose a blind review CLI or leave it disabled
   - run the blind review agent to write a recommendation from saved artifacts
   - Alloy compares that recommendation to the deterministic merge/publication plan
   - if the blind review disagrees, publication stops at `needs human review` until someone approves it explicitly
10. Use `Preview Publication` to refresh the publish target and blocker state.
11. Use `Approve Publication` once the synthesized result is acceptable.
12. Use `Push Approved Ref` to publish the approved bookmark/branch target.
13. Treat PR publication as a later step; push is the current remote publication boundary.

## How To Test A Candidate Or Synthesis Locally

Use `Review -> Local Testing`.

What Alloy now gives you there:
- one section per candidate or synthesis target
- `Open Workspace` for that target
- `Copy Commands` for its recorded validation commands
- the exact commands shown inline so you can run them manually

Recommended sequence:

1. Open `Review`.
2. Scroll to `Local Testing`.
3. Choose the target you actually want to validate:
   - a candidate workspace if you are comparing implementations
   - the synthesis workspace if you are validating the merged result
4. Click `Open Workspace`.
5. Run the visible validation commands in that terminal.

Important:
- Alloy opens the terminal in the correct workspace
- the commands come from recorded verification data when available
- if no commands are shown yet, rerun verification or synthesis first

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
8. Optionally run a blind review agent from `Review` if you want an additional provider recommendation.
9. Review the synthesized diff before any publication step.
10. Preview publication and record approval if the synthesis is ready.
11. Push the approved ref once the target and blockers look correct.
