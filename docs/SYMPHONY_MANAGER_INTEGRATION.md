# Alloy Symphony Manager Integration

Status: Draft
Authoring date: March 8, 2026
Purpose: Define how Alloy should use a Symphony-style task manager and card-based UX in the first demo and early MVP so the product feels approachable while still exposing Alloy's judging and synthesis engine.

## 1. Decision

Yes, the first demo should use a Symphony-style manager surface.

That means:
- tasks should appear as cards on a board or queue
- humans should launch Alloy from a card, not from a hidden runner-only interface
- candidate progress, judging, synthesis, and PR readiness should be visible from the task detail surface

Alloy remains the adjudication and synthesis engine. Symphony provides the manager metaphor and, if practical, the UI shell.

## 2. Why This Matters

Without a task manager shell, Alloy risks feeling like an internal pipeline rather than a usable product.

A Symphony-style board gives the first demo:
- obvious task entry points
- visual progress tracking
- familiar card-based workflow
- a natural place for approvals and PR actions
- a clearer story for non-operators and stakeholders

## 3. Demo UX Goal

The first demo should look and feel like this:

1. a user opens a Symphony-style board
2. a task card exists for the cache invalidation bug
3. the user opens the card detail
4. the user starts an Alloy run from that card
5. the card updates to show provider progress
6. the card detail shows compare and synthesis decisions
7. the final PR action is taken from the same task context

## 4. Recommended Integration Shape

For the first demo, use this ownership model:

- Symphony manager surface owns:
  - task board
  - task cards
  - card detail shell
  - top-level task status

- Alloy owns:
  - prompt packet generation
  - candidate workspaces
  - provider CLI execution
  - verification
  - judging
  - synthesis planning
  - final PR publication state

## 5. Card States

Recommended top-level card states:
- Draft
- Ready
- Running
- Judging
- Awaiting Approval
- Synthesizing
- Synthesized
- Published
- Failed

These card states should map to internal Alloy run state but remain easy for humans to scan.

## 6. Card Metadata

Each card should display:
- task title
- repo
- owner/operator
- current Alloy state
- active providers
- judge confidence when available
- final outcome: winner or synthesized
- PR link when available

## 7. Card Detail Tabs

Recommended card detail tabs:

1. Overview
- task brief
- constraints
- acceptance checks
- current status

2. Candidates
- provider progress cards
- changed files counts
- verification summaries

3. Judge
- anonymized candidate comparison
- rubric scores
- pairwise results
- confidence

4. Synthesis
- merge plan
- selected contributions
- risk notes

5. PR
- final stack
- provenance
- publish state

6. Audit
- event stream
- operator interventions
- artifacts and logs

## 8. Task Creation Paths

Support these creation paths in the demo plan:

### Manual Task Card Creation
A human creates a card in the Symphony-style manager and fills out the Markdown task brief.

### Imported Task Card
A task is imported from an external issue and represented as a card with a generated Alloy task brief.

For the first demo, manual card creation is enough.

## 9. Data Contract Between Symphony Surface And Alloy

Minimum fields the card/detail view should send to Alloy:
- task_id
- source_system
- source_task_id
- source_url if available
- repo
- base_ref
- providers
- judge
- mode
- risk_level
- human_review_policy
- Markdown task brief

Minimum fields Alloy should return to the manager surface:
- run_id
- task_id
- overall state
- per-provider state
- latest candidate events
- judge state
- synthesis state
- confidence
- final PR URL when available

## 10. UI Strategy Options

### Option A: Fork Symphony Manager UI
Best when:
- the existing Symphony UI is easy to adapt
- you want the most continuity with the upstream manager metaphor

### Option B: Recreate The Manager Pattern In Alloy
Best when:
- extracting the exact Symphony UI is more work than re-implementing the board/detail pattern
- you want Alloy branding and data flow to stay cleaner

Recommendation:
- keep the first demo requirement at the UX level: Symphony-style board + card detail
- only commit to a literal UI fork if that proves faster after code inspection

## 11. First Demo Requirement

The first demo is not complete unless:
- the task exists as a card in the manager surface
- the run is started from that card
- the card/detail surface shows candidate progress
- the card/detail surface shows judge and synthesis outcomes
- the final PR action is visible from the card context

## 12. Relationship To Existing Alloy Docs

This document tightens three existing ideas:
- `docs/DEMO_AND_OPERATOR_EXPERIENCE.md` defines what the human sees during a run
- `docs/GUI_WIREFRAMES.md` defines the screens and interaction model
- `IMPLEMENTATION_PLAN.md` defines the system architecture and milestones

This document adds one explicit requirement:
- the first demo should feel like task cards in a Symphony-style manager, not a raw orchestration console

## 13. Recommended Next Implementation Step

When the UI build starts:
- add a board screen before the task composer
- represent the sample demo task as a card
- make the card open into a detail view with Alloy tabs for Candidates, Judge, Synthesis, and PR

## 14. Definition Of Success

This integration is successful when a first-time user can open the board, click a task card, launch Alloy, watch three agents progress, understand the judge and synthesis decision, and review the final PR without needing to think about the underlying runner architecture.
