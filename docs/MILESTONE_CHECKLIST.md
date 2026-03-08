# Alloy Milestone Checklist

Status: Draft
Authoring date: March 8, 2026
Purpose: Provide an execution checklist for the first demo and near-term Alloy milestones so future agents can work from a concrete done/not-done list instead of reinterpreting planning prose.

## Milestone A: Symphony Demo Shell

Checklist:
- [ ] board view exists with task cards
- [ ] demo task appears as a card
- [ ] card detail view exists
- [ ] card detail has tabs or sections for Overview, Candidates, Judge, Synthesis, and PR
- [ ] card state maps to run state
- [ ] task can be launched from the card detail

Done when:
- a human can enter Alloy from a task board instead of a raw CLI-only flow

## Milestone B: Task Input And Validation

Checklist:
- [ ] Markdown task brief editor exists
- [ ] YAML frontmatter is parsed
- [ ] parsed JSON preview is visible
- [ ] validation errors and warnings are shown
- [ ] `source_system` and `source_task_id` are stored for Symphony-origin tasks
- [ ] launch is blocked on hard validation errors

Done when:
- task input is human-friendly and system-trustworthy

## Milestone C: Provider Readiness And Login

Checklist:
- [ ] `doctor` output is exposed to the UI or backend endpoint
- [ ] each provider row shows install state
- [ ] each provider row shows auth state
- [ ] each provider row exposes a login repair action
- [ ] login actions are PTY-backed for interactive CLI flows
- [ ] recheck action exists after login attempt

Done when:
- a human can tell whether Codex, Claude Code, and Gemini are actually ready before launching a run

## Milestone D: Candidate Execution

Checklist:
- [ ] card launch creates a run directory
- [ ] prompt packets are generated per provider
- [ ] one workspace exists per candidate
- [ ] subprocess commands are recorded in manifests
- [ ] stdout/stderr are captured
- [ ] live JSONL event streams are written

Done when:
- Alloy can launch and observe all three candidates from one task

## Milestone E: Verification

Checklist:
- [ ] acceptance checks run per candidate
- [ ] verification results persist to disk
- [ ] candidate cards show verification status
- [ ] failed candidates are blocked from direct win path
- [ ] final synthesized result can also be verified

Done when:
- deterministic checks visibly constrain the judge path

## Milestone F: Judge And Compare

Checklist:
- [ ] structured judge output schema is implemented
- [ ] compare view is anonymized for A/B/C candidates
- [ ] rubric scores display in the UI
- [ ] pairwise results display in the UI
- [ ] contribution map is stored and shown
- [ ] confidence is visible

Done when:
- a human can understand why Alloy chose winner-only or synthesis

## Milestone G: Synthesis Plan

Checklist:
- [ ] synthesis plan view exists
- [ ] contribution map feeds the plan
- [ ] approval gate exists for low/medium-confidence cases
- [ ] operator intervention is audited
- [ ] final stack preview is shown before publication

Done when:
- synthesis is visible, reviewable, and not a black box

## Milestone H: `jj` Spike

Checklist:
- [ ] `jj` is installed on the demo environment
- [ ] one candidate maps to one `jj` change in the spike flow
- [ ] synthesized final result maps to a final `jj` stack
- [ ] split/squash/rebase are demonstrated
- [ ] commands and limitations are documented

Done when:
- the team has proof that `jj` is the right next integration layer

## Milestone I: PR Publication

Checklist:
- [ ] final PR summary view exists
- [ ] provenance is visible in the UI
- [ ] final verification status is shown
- [ ] publication action is available from the card context
- [ ] PR URL is written back to the task card

Done when:
- one task card can lead all the way to one published PR

## Milestone J: Handoff Quality

Checklist:
- [ ] README points to all current planning docs
- [ ] new code slices have companion docs
- [ ] known gaps are called out explicitly
- [ ] sample task and demo path stay current
- [ ] future-agent entry points are obvious

Done when:
- another agent can continue without reverse-engineering prior decisions
