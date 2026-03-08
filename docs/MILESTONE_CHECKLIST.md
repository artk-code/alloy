# Alloy Milestone Checklist

Status: Living checklist
Authoring date: March 8, 2026
Purpose: Provide an execution checklist for the first demo and near-term Alloy milestones so future agents can work from a concrete done/not-done list instead of reinterpreting planning prose.

## Milestone A: Queue + Tasks Shell

Checklist:
- [x] board view exists with task cards
- [x] demo task appears as a card
- [x] tasks page exists as a separate surface
- [x] tasks page has sections for overview, compare, candidates, and debug
- [x] card state maps to run state
- [x] task can be launched from the selected-task context

Done when:
- a human can enter Alloy from a task board instead of a raw CLI-only flow

## Milestone B: Task Input And Validation

Checklist:
- [x] new custom task can be created from the UI without touching the filesystem manually
- [x] Guided task setup exists
- [x] Markdown task source editor exists
- [x] YAML frontmatter is parsed
- [x] parsed JSON preview is visible
- [x] validation errors and warnings are shown
- [x] task can be saved back to a `.task.md` file from the UI
- [x] `source_system` and `source_task_id` are stored for imported tasks
- [x] launch/save is blocked on hard validation errors

Done when:
- task input is human-friendly, system-trustworthy, and no longer filesystem-only for custom task creation

## Milestone C: Provider Readiness And Login

Checklist:
- [x] `doctor` output is exposed to the UI or backend endpoint
- [x] each provider row shows install state
- [x] each provider row shows auth state
- [x] each provider row exposes a login repair action
- [x] login actions are PTY-backed for interactive CLI flows where supported
- [x] recheck action exists after login attempt through refresh

Done when:
- a human can tell whether Codex, Claude Code, and Gemini are actually ready before launching a run

## Milestone D: Candidate Execution

Checklist:
- [x] card launch creates a run directory
- [x] prompt packets are generated per provider
- [x] one workspace exists per candidate
- [x] subprocess commands are recorded in manifests
- [x] stdout/stderr are captured
- [x] live JSONL event streams are written

Done when:
- Alloy can launch and observe all three candidates from one task

## Milestone E: Verification

Checklist:
- [x] acceptance checks run per candidate
- [x] verification results persist to disk
- [x] candidate cards show verification status
- [x] failed candidates are blocked from direct win path
- [x] final synthesized result can also be verified

Done when:
- deterministic checks visibly constrain the judge path

## Milestone F: Judge And Compare

Checklist:
- [x] structured judge output schema is implemented
- [x] compare view can be anonymized for A/B/C candidates
- [x] rubric scores display in the UI
- [ ] pairwise results display in the UI
- [x] contribution map is stored and shown
- [x] confidence is visible

Done when:
- a human can understand why Alloy chose winner-only or synthesis

## Milestone G: Synthesis Plan

Checklist:
- [x] synthesis plan view exists
- [x] contribution map feeds the plan
- [x] approval gate exists for publication
- [x] operator intervention is audited through provenance and manual-override state
- [x] final stack preview is shown before publication

Done when:
- synthesis is visible, reviewable, and not a black box

## Milestone H: `jj` Spike

Checklist:
- [x] `jj` is installed on the demo environment
- [x] one candidate maps to one `jj` change in the spike flow
- [x] synthesized final result maps to a final `jj` stack
- [x] split/squash/rebase are demonstrated
- [x] commands and limitations are documented

Done when:
- the team has proof that `jj` is the right next integration layer

## Milestone I: PR Publication

Checklist:
- [ ] final PR summary view exists
- [x] provenance is visible in the UI
- [x] final verification status is shown
- [ ] publication action is available from the card context
- [ ] PR URL is written back to the task card

Done when:
- one task card can lead all the way to one published PR

## Milestone K: Fast Regression Tasks

Checklist:
- [x] `FizzBuzz CLI` task exists
- [x] `Roman Numerals` task exists
- [x] both tasks have acceptance commands
- [x] both tasks appear clearly as fast regression/demo tasks in `Tasks`

Done when:
- Alloy can validate queue -> run -> verify -> diff capture quickly without requiring a heavy demo repo every time

## Milestone J: Handoff Quality

Checklist:
- [x] README points to all current planning docs
- [x] new code slices have companion docs
- [x] known gaps are called out explicitly
- [x] sample task and demo path stay current
- [x] future-agent entry points are obvious

Done when:
- another agent can continue without reverse-engineering prior decisions
