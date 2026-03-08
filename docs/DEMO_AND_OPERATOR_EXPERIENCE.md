# Alloy Demo And Operator Experience

Status: Draft
Authoring date: March 8, 2026
Purpose: Define Alloy's first demo task, the human-to-agent task input contract, the operator steering model, and the GUI/observability surface required for humans to understand what happened and why.

## 1. Why This Document Exists

The core system architecture is only half the product. Alloy also needs a clear answer to these questions:

- What should the first demo actually do?
- How do humans give tasks to the system?
- How much can humans steer or constrain the agents?
- How do humans monitor runs in progress?
- How do humans understand why a winner or synthesis decision was made?

If these surfaces are weak, the system will feel opaque and unsafe even if the underlying orchestration is correct.

## 2. Demo Design Goals

The first demo should prove five things at once:

1. Alloy can run `codex`, `gemini`, and `claude-code` against the same task.
2. Each provider works from the same base revision in an isolated workspace.
3. Alloy can collect, verify, and score each candidate.
4. Alloy can synthesize a final result using `jj` when candidates have complementary strengths.
5. A human can monitor the process and understand the final decision.

The demo should not try to prove every future capability. It should prove the core loop end to end.

## 3. Recommendation For Demo Scope

Use a controlled demo repository rather than an arbitrary real-world production codebase.

Recommended demo repo characteristics:
- TypeScript or Python service with fast tests
- 10-40 source files
- 1 seeded bug or incomplete feature
- existing test suite plus room for regression tests
- simple CI-style verification: build, tests, lint, typecheck if applicable
- a few related files so synthesis is plausible

Why this is better than a live production repo:
- deterministic and repeatable demo
- easier comparison across runs
- clearer acceptance criteria
- lower risk while building trust

## 4. Recommended First Demo Task

### 4.1 Task Theme

Use a backend bugfix with missing regression coverage and a small quality gap in observability or edge-case handling.

Recommended task:
- fix a cache key collision or stale cache invalidation bug in a small TypeScript service
- add regression tests that prove the bug is fixed
- add one small observability improvement, such as structured logging or a metric on cache miss/invalidation path

### 4.2 Why This Task Is Good

It is a strong first demo because:
- it has a clear notion of correctness
- tests can deterministically prove success
- different agents are likely to contribute different strengths
- synthesis is believable: one candidate may have the best fix, another the best tests, another the best cleanup or logging
- the final PR is small enough for a human to review in one sitting

### 4.3 Example Acceptance Criteria

The task should only be considered complete if all of the following are true:
- the stale or incorrect cache behavior is fixed
- a regression test reproduces the old failure and now passes
- existing tests still pass
- lint and typecheck pass
- no unrelated files are modified
- one small observability improvement is included if it does not introduce unnecessary scope

### 4.4 Example Demo Prompt

```md
# Task: Fix cache invalidation regression

Users are receiving stale results after updating a project record. The bug appears to be in the cache invalidation flow for project detail requests.

## Requirements
- Fix the bug causing stale project detail responses after update.
- Add a regression test that would have failed before the fix.
- Keep the change minimal and localized.
- If appropriate, add a small observability improvement around invalidation or cache miss behavior.

## Constraints
- Do not change the public API.
- Do not add new dependencies.
- Do not modify unrelated modules.

## Acceptance Checks
- `npm test`
- `npm run lint`
- `npm run typecheck`
```

## 5. Why Not Start With A Bigger Demo

Avoid these as the first demo:
- full-stack feature work
- large migrations
- sweeping refactors
- multi-service tasks
- tasks that require hidden domain knowledge
- tasks where correctness is subjective

A demo should reduce ambiguity, not amplify it.

## 6. Human Task Input Model

Humans should author tasks in Markdown, but Alloy should store a parsed structured representation internally.

Recommended model:
- human-facing authoring format: Markdown with YAML frontmatter
- canonical runtime format: JSON task object derived from that Markdown

This gives humans readability and gives the system reliable machine structure.

## 7. Canonical Task Brief Format

Recommended file name:
- `task.md`

Recommended structure:

```md
---
task_id: task_20260308_001
repo: demo/cache-service
base_ref: main
mode: race
providers:
  - codex
  - gemini
  - claude-code
judge: claude-code
max_runtime_minutes: 20
risk_level: medium
human_review_policy: standard
---

# Task
Fix stale project detail responses after update.

## Context
Project detail reads are cached. After an update mutation, reads may continue returning stale values.

## Requirements
- Fix invalidation so reads reflect the updated project.
- Add a regression test.
- Keep the fix small and reviewable.

## Constraints
- No new dependencies.
- Do not change public API shapes.
- Prefer changes in existing cache modules and tests only.

## Acceptance Checks
- npm test
- npm run lint
- npm run typecheck

## Optional Guidance
- Small observability improvements are acceptable if directly related.

## Human Notes
- Prior attempts tended to over-edit the cache layer. Keep this targeted.
```

## 8. Why Markdown Plus Structure Is The Right Choice

Markdown is the correct primary interface because:
- humans already think in task briefs, not raw JSON
- tasks often need nuance, caveats, and repo-specific notes
- markdown can live in version control and PR discussion easily
- future agents can ingest it directly

Structured fields are still required because the conductor needs reliable values for:
- provider selection
- mode selection
- base ref
- timeout
- risk level
- review policy
- acceptance commands

## 9. How Agents Should Receive Input

Agents should not receive only the raw human Markdown. They should receive a normalized prompt packet assembled by Alloy.

Recommended packet sections:
- task brief summary
- hard requirements
- constraints
- acceptance commands
- relevant repository context
- allowed file scope if applicable
- output expectations
- reminder that version control is managed externally

## 10. Prompt Packet Shape

Suggested normalized prompt packet:

```md
# Alloy Candidate Task Packet

Task ID: task_20260308_001
Candidate Slot: A
Base Ref: main
Mode: race

## Objective
Fix stale project detail responses after update.

## Hard Requirements
- Fix the invalidation bug.
- Add a regression test.
- Keep changes minimal.

## Constraints
- No new dependencies.
- Do not change public API.
- Prefer existing cache and test modules.

## Verification Commands
- npm test
- npm run lint
- npm run typecheck

## Repo Context
- Main cache logic is in `src/cache/projectCache.ts`
- Mutation handler is in `src/api/updateProject.ts`
- Existing cache tests are in `test/projectCache.test.ts`

## Working Rules
- You are working in an isolated workspace.
- Do not manage git or jj history.
- Focus on code changes only.
- Summarize your changes clearly when done.
```

## 11. Human Steering Model

Humans should be able to steer Alloy, but the steering surface must stay disciplined.

Recommended steering levels:

### Level 0: Submit Only
The human provides the task and waits for results.

### Level 1: Constraint Steering
The human can set:
- which providers to run
- mode: fast, race, relay, committee
- file scope constraints
- time budget
- strictness of synthesis
- review policy

### Level 2: Checkpoint Steering
The human can intervene at key checkpoints:
- after candidate generation
- after judge scoring
- before synthesis
- before PR publication

### Level 3: Directed Merge Guidance
The human can add guidance like:
- prefer Candidate B's tests
- do not touch migration files
- if confidence is low, ship winner only
- prefer minimal patch over elegant refactor

### Rule
Humans should steer through task metadata and explicit notes, not ad hoc side-channel prompts to individual providers.

That keeps the run auditable.

## 12. Recommended Steering UX

The GUI should make steering explicit before execution and constrained during execution.

Before run:
- choose repo
- choose base ref
- select providers
- choose mode
- choose judge
- set max runtime
- define acceptance commands
- define constraints and notes

During run:
- pause new synthesis work
- approve or reject merge plan
- request rerun with tighter constraints
- stop publication

After run:
- approve final PR publication
- convert run into reusable benchmark task
- save routing preference for similar tasks

## 13. GUI Information Architecture

The GUI should not be a generic chat window. It should be a run control and observability surface.

Recommended primary screens:

1. Task Composer
2. Live Run Dashboard
3. Candidate Compare View
4. Synthesis Plan View
5. Final PR Review View
6. Metrics / ROI View

## 14. Task Composer Screen

Purpose:
- where humans create or edit the task brief

Must show:
- repo selector
- base ref
- provider selection checkboxes
- mode selector
- judge selector
- markdown task editor
- constraints fields
- acceptance command fields
- estimated runtime/cost profile as seat consumption, not token billing

Key design rule:
- render both the human-authored Markdown and the parsed structured fields so the user can verify what the system will actually run

## 15. Live Run Dashboard

Purpose:
- show what is happening right now

Must show:
- current task status
- per-provider status: queued, running, completed, failed
- workspace path or identifier
- elapsed time per candidate
- latest transcript events
- verification progress
- judge status
- synthesis status
- publication status

Recommended layout:
- top summary timeline
- three candidate cards side by side
- shared event stream below
- right-side decision panel

## 16. Candidate Cards

Each candidate card should show:
- provider label
- current state
- changed files count
- transcript tail
- verification result summary
- diff size summary
- candidate summary text

Once the judge stage begins, the compare view should switch to anonymized labels for evaluation fairness.

Operator rule:
- provider identity can remain visible to humans in operations view
- provider identity must be hidden from the judge subsystem

## 17. Candidate Compare View

Purpose:
- explain how the candidates differ

Must show:
- Candidate A/B/C anonymized comparison
- changed files overlap matrix
- verification results side by side
- rubric scores
- pairwise comparison outcomes
- highlighted unique contributions

Helpful visualizations:
- file overlap heatmap
- score breakdown bars
- pass/fail check matrix
- confidence badge

## 18. Synthesis Plan View

Purpose:
- explain what Alloy intends to merge

Must show:
- winner or finalists
- merge rationale
- contribution map
- proposed file-level selections
- conflict/risk warnings
- expected final stack shape

Example:
- core fix from Candidate A
- regression tests from Candidate B
- logging cleanup from Candidate C

This is the most important trust surface in the entire product.

## 19. Final PR Review View

Purpose:
- let humans inspect the final result before publication

Must show:
- final diff summary
- `jj` stack view
- commit or change breakdown
- final verification status
- judge rationale summary
- provenance summary: what came from which candidate
- PR title/body preview

## 20. Monitoring And Observability

Humans need both live monitoring and post-run auditability.

### 20.1 Live Monitoring

Capture and expose:
- provider process state
- transcript stream
- command execution steps
- verification progress
- judge completion state
- synthesis progress
- publication progress

### 20.2 Audit Trail

Persist and expose:
- original task brief
- parsed task object
- prompt packets sent to each provider
- candidate artifacts
- verification reports
- judge output JSON
- synthesis plan
- final `jj` stack summary
- PR payload
- operator interventions

### 20.3 Decision Log

Every important decision should be logged in structured form:
- why each provider was selected
- why a candidate was disqualified
- why a winner was chosen
- why synthesis happened or did not happen
- why publication was allowed or blocked

## 21. Human Notifications

Recommended notifications:
- run started
- candidate failed verification
- judge requests human attention due to low confidence
- synthesis plan ready for review
- final PR ready for approval
- provider login expired

For MVP, in-app notifications are sufficient. Slack or email can come later.

## 22. Human Control Points

These are the minimum explicit approval points worth supporting:

1. Start run
2. Approve merge plan when confidence is low or risk is high
3. Approve PR publication for production repositories

Optional later:
- require approval before any synthesis at all
- require approval if protected files are touched

## 23. Demo Success Criteria

The first demo is successful if a human can watch Alloy:
- ingest a Markdown task brief
- launch `codex`, `gemini`, and `claude-code`
- show separate candidate workspaces and progress
- verify each candidate
- explain the judge decision
- synthesize a final result if appropriate
- display the final `jj` stack and PR summary

## 24. Demo Failure Modes To Avoid

Avoid demos where:
- tasks are too vague to judge fairly
- the UI hides why decisions were made
- synthesis introduces new uncontrolled scope
- humans cannot tell which step is currently running
- provider login failures appear as mysterious system errors
- the final output is technically correct but unreviewable

## 25. Recommended Build Order For The Demo UX

1. task composer with markdown + parsed preview
2. live run dashboard with per-provider cards
3. candidate compare view with anonymized scoring
4. synthesis plan view
5. final PR review view
6. metrics view

## 26. Open Questions

1. Should humans be allowed to edit the parsed structured task object directly, or only through form controls plus markdown?
2. Should the judge output always be shown raw, or always translated into a human-readable summary first?
3. Should synthesis require explicit human approval in the first demo, or only when confidence is below threshold?
4. Should the first demo be local-only, or should it actually publish a PR to a demo GitHub repository?
5. How much transcript detail is useful before the GUI becomes noisy?

## 27. Recommended Initial Decisions

- Use Markdown with YAML frontmatter as the human task input format.
- Parse task briefs into a canonical JSON task object before execution.
- Make the first demo task a deterministic backend bugfix with regression tests.
- Use `codex`, `gemini`, and `claude-code` on the same task.
- Require the GUI to show both live execution state and post-run decision reasoning.
- Require the GUI to show a synthesis plan before publication.
- Treat observability and explanation as product requirements, not optional polish.

## 28. Definition Of Success

This operator experience succeeds when a human can submit one Markdown task brief, watch three major-lab coding agents work in isolation, understand Alloy's evaluation and synthesis decisions in real time, and trust the final PR because the system made its reasoning and provenance visible.
