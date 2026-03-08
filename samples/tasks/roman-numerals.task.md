---
task_id: task_20260308_roman_numerals
project_id: algo-lab
project_label: Algo Lab
source_system: imported
source_task_id: demo_card_roman_numerals
repo: demo/roman-numerals
repo_path: ../repos/roman-numerals
base_ref: main
demo_priority: 40
mode: race
providers:
  - codex
  - gemini
  - claude-code
judge: claude-code
max_runtime_minutes: 12
risk_level: low
human_review_policy: standard
allowed_paths:
  - src
  - test
  - scripts
synthesis_policy: manual
publish_policy: manual
---

# Task
Repair the Roman numeral converter so it uses canonical subtractive forms and round-trips correctly.

## Context
This is a compact algorithm demo for fast evaluation and review. The current implementation only handles additive symbols, so values like 4, 9, and 944 are encoded and decoded incorrectly.

## Requirements
- Keep the public `toRoman(value)` and `fromRoman(input)` interfaces unchanged.
- Use canonical Roman numerals for values from 1 to 3999.
- Make round-trip conversion pass for the provided fixtures.

## Constraints
- No external dependencies.
- Keep the implementation compact and readable.
- Do not expand the task into a larger parsing framework.

## Acceptance Checks
- npm test
- node scripts/eval-roundtrip.mjs

## Optional Guidance
- Canonical subtractive pairs like `IV`, `IX`, `XL`, `XC`, `CD`, and `CM` are required.

## Human Notes
- Use this after FizzBuzz when you want a fast pure-function task with slightly richer logic.
