# Alloy Symphony Fork Vs Build Fresh

Status: Draft
Authoring date: March 8, 2026
Purpose: Decide which parts of Symphony should be forked or reused and which parts Alloy should build fresh for the first demo and near-term roadmap.

Current implementation stance:
- Alloy is not currently booting Symphony's Elixir services.
- The live prototype path is a build-fresh Alloy runtime with Symphony-compatible task-manager ideas and demo affordances.
- A hard fork remains an option later if direct reuse of Symphony internals becomes worth the operational cost.

## 1. Decision Summary

Recommendation:
- fork or closely mimic the Symphony manager shell first
- build Alloy adjudication and synthesis logic fresh
- treat `jj` integration as Alloy-native, not inherited from Symphony

In short:
- Symphony for task-manager UX and orchestration patterns
- Alloy for multi-candidate execution, judging, synthesis, and provenance

## 2. Why Not Fork Everything

A full fork creates avoidable drag because Alloy's core loop is materially different.

Symphony's original mental model:
- one task
- one agent run
- one result

Alloy's required mental model:
- one task
- three isolated candidate runs
- one judge decision
- optional synthesis
- one final PR

That means the manager metaphor transfers well, but the execution model does not transfer cleanly enough to justify a blind full fork.

## 3. What To Reuse From Symphony

Good reuse targets:
- task manager metaphor: board, cards, detail views
- high-level orchestration patterns
- workspace lifecycle inspiration
- GitHub integration patterns if they remain relevant
- process supervision ideas

These are valuable because they reduce time-to-demo and align with the user-facing experience you want.

## 4. What To Build Fresh In Alloy

Build fresh:
- candidate model
- provider adapter registry
- prompt packet generation
- live event model
- verification state model
- judge and compare model
- synthesis plan model
- provenance model
- `jj` integration
- ROI metrics model

These are the differentiated core of Alloy and should not be constrained by a single-agent legacy abstraction.

## 5. Demo-Phase Split

### Fork Or Mimic First
- board columns
- task cards
- card detail layout
- top-level task status model
- operator-friendly shell

### Build Fresh First
- provider readiness panel
- card-to-run launch path
- candidate cards within a task
- compare view
- synthesis plan view
- PR provenance view

## 6. Recommended Strategy

### Phase 1: UX Fork Or Mimic
Goal:
- make the first demo feel easy to use

Approach:
- either fork Symphony's manager UI if that is genuinely faster
- or recreate the board/detail pattern in Alloy with the same user mental model

Success condition:
- users see cards and task detail before they ever think about the runner internals

### Phase 2: Alloy Runtime
Goal:
- power the task shell with real multi-provider execution

Approach:
- keep all runtime code fresh and Alloy-native
- do not force multi-candidate logic through single-agent assumptions

Success condition:
- cards reflect real candidate state, judge output, and synthesis progress

### Phase 3: `jj` Integration
Goal:
- prove that Alloy can convert multi-candidate decisions into a reviewable final stack

Approach:
- implement `jj` as an Alloy subsystem after the card-based demo is already usable

Success condition:
- one card can produce one final clean stack and one PR-ready result

## 7. What To Avoid

Avoid:
- spending a week extracting Symphony internals before the board shell is visible
- rebuilding Symphony wholesale just to rename things
- forcing Alloy synthesis logic into a single-result data model
- delaying the task manager shell because `jj` is not ready yet

## 8. First-Demo Recommendation

For the first demo:
- task board and card detail should feel Symphony-like
- the runtime behind those surfaces should be Alloy-native
- the user should not need to care whether the card shell was literally forked or reimplemented

So the demo requirement is UX-level fidelity first, code-level purity second.

## 9. Engineering Heuristic

Choose the faster path to a credible demo:
- if Symphony's board/detail code is easy to adapt, fork it
- if adaptation is slower than recreating the same interaction pattern, rebuild the shell fresh

Do not let the fork decision block the runtime.

## 10. Definition Of Success

This split is correct if Alloy inherits the parts of Symphony that make the product easy to use while preserving the freedom to build a genuinely new multi-agent adjudication and synthesis engine behind that interface.
