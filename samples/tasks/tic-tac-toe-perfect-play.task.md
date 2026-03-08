---
task_id: task_20260308_tic_tac_toe_perfect_play
project_id: game-lab
project_label: Game Lab
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

## Context
The demo strategy currently picks the center square when available and otherwise falls back to the first open move. That makes the code easy to reason about, but it loses or misses wins in reachable positions.

## Requirements
- Make the engine choose an optimal move for every legal board state.
- Keep the public `chooseMove(board, player)` interface unchanged.
- Add or update tests if they improve confidence without bloating the patch.

## Constraints
- No external dependencies.
- Keep the implementation understandable enough for a code review demo.
- Do not move the evaluation logic out of the repo.

## Acceptance Checks
- npm test
- node scripts/eval-perfect-play.mjs

## Optional Guidance
- A deterministic minimax implementation is acceptable.
- Keep helper functions small and pure.

## Human Notes
- This is the preferred first demo card because humans can understand the win/draw/loss outcome immediately.
