---
task_id: task_20260308_fizzbuzz_cli
project_id: smoke-lab
project_label: Smoke Lab
source_system: imported
source_task_id: demo_card_fizzbuzz_cli
repo: demo/fizzbuzz-cli
repo_path: ../repos/fizzbuzz-cli
base_ref: main
demo_priority: 45
mode: race
providers:
  - codex
  - gemini
  - claude-code
judge: claude-code
max_runtime_minutes: 10
risk_level: low
human_review_policy: standard
allowed_paths:
  - src
  - test
  - scripts
  - cli.js
synthesis_policy: manual
publish_policy: manual
---

# Task
Fix the FizzBuzz CLI so it prints the canonical 1..100 sequence.

## Context
This is a deliberately tiny regression task for validating Alloy's queue, runner, verifier, and diff capture flow. The current implementation mishandles combined multiples like 15 and 30.

## Requirements
- Keep the CLI entrypoint shape unchanged.
- Print the exact canonical FizzBuzz sequence from 1 through 100.
- Keep the patch small and easy to review.

## Constraints
- No external dependencies.
- Do not move the program into a different file layout.
- Prefer a minimal fix over a clever refactor.

## Acceptance Checks
- npm test
- node scripts/eval-fizzbuzz-output.mjs

## Optional Guidance
- This task should be fast enough to use as a regression check for preview, live run, and diff capture.

## Human Notes
- Use this before the heavier demos when you want to validate the basic pipeline quickly.
