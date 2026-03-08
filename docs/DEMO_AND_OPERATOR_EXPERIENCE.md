# Alloy Demo And Operator Experience

Status: Active implementation reference
Authoring date: March 8, 2026
Purpose: Define Alloy's first demo task, the human-to-agent task input contract, the operator steering model, and the GUI/observability surface required for humans to understand what happened and why.

## 1. Why This Document Exists

The core system architecture is only half the product. Alloy also needs clear answers to these questions:
- What should the first demo actually do?
- How do humans give tasks to the system?
- How much can humans steer or constrain the agents?
- How do humans monitor runs in progress?
- How do humans understand why a winner or synthesis decision was made?

## 2. Demo Design Goals

The first demo should prove these things at once:
1. Alloy can run `codex`, `gemini`, and `claude-code` against the same task.
2. Each provider works from the same base revision in an isolated workspace.
3. Alloy can collect, verify, and score each candidate.
4. A human can configure provider participation before launch.
5. A human can monitor candidate progress, verification, and session state from a card-based Alloy Control Panel view.
6. The task is simple enough that correctness is obvious to a non-expert observer.

## 2.1 Demo Shell Requirement

The first demo should use a card-based Alloy Control Panel surface as the primary entry point.

That means:
- the task exists as a card
- the card detail exposes Alloy run controls
- provider readiness and login repair stay visible from the same surface
- candidate progress, verification, and session history are visible from the task context

## 3. Current Recommended Demo Scope

Use a controlled demo repository rather than an arbitrary production codebase.

Current primary demo repo characteristics:
- no external dependencies beyond Node itself
- one intentionally broken strategy module
- fast tests
- one exhaustive evaluator with objective pass/fail semantics
- small enough for humans to reason about in a live demo

## 4. Current First Demo Task

### 4.1 Task Theme

Use a broken tic-tac-toe strategy engine that should be upgraded to perfect play.

Current task:
- repo: `samples/repos/tic-tac-toe`
- card: `samples/tasks/tic-tac-toe-perfect-play.task.md`
- goal: fix `chooseMove(board, player)` so it chooses an optimal move for every legal board state

### 4.2 Why This Task Is Good

This is the right first demo because:
- correctness is objective
- the output is easy for humans to understand
- the acceptance checks are real and fast
- synthesis is still plausible: one model may produce the cleanest minimax, another may improve tests or helper structure
- the final patch stays reviewable

### 4.3 Current Acceptance Criteria

The task is only complete if all of the following are true:
- `chooseMove(board, player)` returns a legal move or `-1` when no moves remain
- unit tests pass
- the exhaustive evaluator passes on all reachable states
- no external dependencies are introduced
- the code remains understandable enough for a code review demo

### 4.4 Current Acceptance Commands

```bash
npm test
node scripts/eval-perfect-play.mjs
```

### 4.5 Known Broken Starting State

The seeded demo repo intentionally fails before any candidate fix:
- `npm test` fails because the strategy misses obvious wins and blocks
- `node scripts/eval-perfect-play.mjs` fails across many reachable states

That broken baseline is important because it proves the evaluator is real, not a canned success path.

Current proof boundary:
- the seeded repo is intentionally broken and fails real checks
- the automated integration path currently replays a stored working fix artifact into a real Alloy candidate workspace
- Alloy then runs the real verifier and captures the real `jj` diff from that workspace
- the Control Panel now flags replay-backed or legacy run artifacts explicitly so the board does not imply they came from live provider authoring
- live provider authoring is still a manual/operator path, not something the automated tests currently certify

## 5. Human Task Input Model

Humans should author tasks in Markdown, but Alloy should store a parsed structured representation internally.

Recommended model:
- human-facing authoring format: Markdown with YAML frontmatter
- canonical runtime format: JSON task object derived from that Markdown
- operator-facing run override: a separate `run_config` object controlled from the GUI or API

This keeps the task brief stable while still allowing the operator to change:
- which providers are enabled
- how many candidate agents to run per provider
- which profile ID to associate with each provider
- which transport to request for provider execution

## 6. Canonical Task Brief Format

Recommended structure:

```md
---
task_id: task_20260308_tic_tac_toe_perfect_play
source_system: symphony
source_task_id: demo_card_tic_tac_toe_perfect_play
repo: demo/tic-tac-toe
repo_path: ../repos/tic-tac-toe
base_ref: main
demo_priority: 100
mode: race
providers:
  - codex
  - gemini
  - claude-code
judge: claude-code
max_runtime_minutes: 15
risk_level: low
human_review_policy: standard
allowed_paths:
  - src
  - test
  - scripts
synthesis_policy: auto
publish_policy: manual
---

# Task
Upgrade the tic-tac-toe engine to perfect play.
```

## 7. How Agents Receive Input

Agents do not receive only raw human Markdown. They receive a normalized prompt packet assembled by Alloy.

Current packet sections:
- task ID and candidate slot
- provider instance metadata
- objective
- hard requirements
- constraints
- verification commands
- repo context
- optional guidance
- human notes
- working rules

## 8. Human Steering Model

The current operator model should support four levels of steering:
1. submit only
2. provider/run-config steering
3. checkpoint steering
4. synthesis guidance

Implemented now:
- provider enable/disable
- agent counts per provider
- profile IDs
- requested run transport

Planned next:
- checkpoint approve/retry
- judge tie-break policies
- directed synthesis hints

## 9. GUI Surface Requirements

The current web GUI should expose:
- Symphony-style task board
- card detail view
- provider readiness panel
- run-config panel
- latest run summary
- candidate card list
- session monitor
- markdown task editor and parsed task preview

The current UI should make these questions answerable without reading the filesystem:
- which providers are installed
- which providers have unclear login state
- which providers are enabled for this run
- how many agents will launch
- what each candidate did
- what verification ran
- which sessions were created

## 10. Monitoring And Auditability

Every run should leave behind:
- source task markdown
- canonical task JSON
- prompt packets
- candidate manifests
- run-level event stream
- session records
- stdout/stderr logs
- verification logs

The human should be able to inspect both:
- task-level decisions
- process/session-level behavior

## 11. Current Product Reality Check

The current codebase already supports:
- tic-tac-toe as the default demo card
- real verification against the broken demo repo
- run-config-driven candidate expansion
- session-backed candidate execution for tests and runner flows
- provider login launch tracking

The next product milestones after this document are:
- run real installed provider CLIs from the board
- add live event streaming to the GUI
- add judge/composer and `jj` synthesis phases
