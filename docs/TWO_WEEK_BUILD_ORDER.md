# Alloy Two-Week Build Order

Status: Draft
Authoring date: March 8, 2026
Purpose: Provide a concrete 10-working-day build sequence for the first meaningful Alloy demo: Symphony-style task cards, three-provider CLI orchestration, adjudication, and a `jj` proof-of-concept.

## 1. Goal

At the end of two weeks, Alloy should be able to:
- present a Symphony-style board and task card detail
- show provider readiness and login state for `codex`, `gemini`, and `claude-code`
- launch a task from a card into the Alloy runner
- capture live candidate progress and artifacts
- run deterministic verification
- show judge output and a merge plan
- demonstrate a small `jj` spike proving candidate changes can be represented and shaped into a final stack

## 2. Scope Rule

This is not a full production build plan. It is a demo-first build plan.

Priority order:
1. visible task/card UX
2. runnable orchestration loop
3. judge and synthesis visibility
4. `jj` proof-of-concept
5. polish and cleanup

## 3. Week 1

## Day 1: Board And Task Shell

Deliverables:
- choose Symphony integration path for demo shell: fork UI surface or recreate board/detail pattern
- create board screen wireframe implementation stub
- create card detail shell
- represent the demo cache task as a card

Acceptance:
- a user can open a board and click into the demo task card
- the card detail has placeholders for Overview, Candidates, Judge, Synthesis, and PR

## Day 2: Task Brief Editor And Parsed Preview

Deliverables:
- wire the Markdown task brief into the card detail view
- show parsed JSON preview
- show validation errors and warnings
- persist task metadata including `source_system: symphony`

Acceptance:
- editing the task brief updates the parsed preview
- launch is blocked on hard validation failures

## Day 3: Provider Readiness And Login UX

Deliverables:
- backend endpoint or file-backed service for `doctor`
- provider auth panel in the GUI
- login buttons for `codex`, `gemini`, and `claude-code`
- PTY-backed login launch path for interactive CLI login repair

Acceptance:
- the UI shows installed/not-installed and auth `valid/invalid/unknown`
- the user can launch provider login flows from the UI or equivalent backend action

## Day 4: Candidate Launch From Card

Deliverables:
- connect card launch action to `prepare` and `run`
- create run records from a Symphony-style task card
- map card state to real Alloy outcomes: Draft, Prepared, Previewed, Winner Ready, Needs Merge, Synthesized, Failed, No Winner

Acceptance:
- clicking Run from the card creates a run directory and candidate manifests
- the card transitions from Ready to Running

## Day 5: Live Candidate Dashboard

Deliverables:
- surface candidate events in the card detail
- show provider cards with status, log tail, and command summary
- show candidate event streams from JSONL or equivalent live feed

Acceptance:
- a human can watch candidate progress from the card detail without leaving the task context

## 4. Week 2

## Day 6: Deterministic Verification Layer

Deliverables:
- run acceptance checks after candidate execution
- store verification results per candidate
- expose pass/fail state in candidate cards and compare view

Acceptance:
- the system records build/test/lint/typecheck outcomes for each candidate
- failed candidates are visible before judge stage

## Day 7: Judge And Compare View

Deliverables:
- structured judge output schema in runtime path
- anonymized candidate compare view
- rubric score display
- pairwise result display

Acceptance:
- a human can see why a winner or synthesis recommendation was produced

## Day 8: Synthesis Plan View And Approval Gate

Deliverables:
- show contribution map and merge plan
- add approval gate for medium/low-confidence synthesis
- record operator intervention in audit trail

Acceptance:
- the card detail can present a synthesis plan and a human can approve or reject it

## Day 9: `jj` Spike

Deliverables:
- create one candidate change per candidate in a demo repo or synthetic fixture
- create one synthesized final change from selected contributions
- prove split/squash/rebase flow on the final stack
- document exact commands and limitations

Acceptance:
- there is a working script or documented run proving Alloy can represent candidate and final changes in `jj`
- the final stack is reviewable as 1-3 clean changes

## Day 10: Demo Polish And Scripted Walkthrough

Deliverables:
- final walkthrough script for the cache invalidation demo
- docs cleanup and entrypoint links
- repo metadata update if needed
- known-gaps section for the next agent

Acceptance:
- a new operator can run the demo flow end to end using project docs
- future agents have an explicit handoff note for what remains after the demo

## 5. Dependencies

Critical dependencies for the two-week plan:
- Symphony-style board/detail shell exists by end of Day 1
- provider CLI installs and login flows are available on the demo machine
- one deterministic demo repo exists and stays stable
- `jj` is installed by Day 9 for the spike

## 6. Risk Management

Main risks:
- UI time sink from over-forking Symphony
- provider auth instability
- verification costs or runtime blowup
- trying to do full `jj` synthesis too early

Mitigation:
- keep the board/detail UX narrow
- use `unknown` auth state honestly when machine validation is weak
- verify only the demo task’s acceptance checks first
- treat Day 9 as a spike, not a full `jj` productization step

## 7. Definition Of Success

This two-week plan succeeds if Alloy has a card-based demo that feels usable, runs all three providers through CLI login-based auth, exposes judge and synthesis decisions clearly, and proves that `jj` can be added as the synthesis/provenance engine next.
