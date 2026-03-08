---
task_id: task_20260308_cache_invalidation
project_id: bugfix-lab
project_label: Bugfix Lab
source_system: imported
source_task_id: demo_card_cache_invalidation
repo: demo/cache-service
repo_path: ../repos/cache-service
base_ref: main
demo_priority: 20
mode: race
providers:
  - codex
  - gemini
  - claude-code
judge: claude-code
max_runtime_minutes: 20
risk_level: medium
human_review_policy: standard
allowed_paths:
  - src/cache
  - src/api
  - test
synthesis_policy: auto
publish_policy: manual
---

# Task
Fix stale project detail responses after update.

## Context
Project detail reads are cached. After an update mutation, reads may continue returning stale values because the invalidation path does not consistently evict the correct key.

## Requirements
- Fix the invalidation bug so reads reflect the updated project.
- Add a regression test that would have failed before the fix.
- Keep the change minimal and reviewable.

## Constraints
- No new dependencies.
- Do not change public API shapes.
- Prefer changes in existing cache modules and tests only.

## Acceptance Checks
- npm test
- npm run lint
- npm run typecheck
- node scripts/check-demo-state.mjs

## Optional Guidance
- Small observability improvements are acceptable if directly related.

## Human Notes
- Prior attempts tended to over-edit the cache layer. Keep this targeted.
