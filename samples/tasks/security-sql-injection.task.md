---
task_id: task_20260308_security_sql_injection
project_id: security-lab
project_label: Security Lab
source_system: imported
source_task_id: demo_card_security_sql_injection
repo: demo/security-sqli
repo_path: ../repos/security-sqli
base_ref: main
demo_priority: 55
mode: race
providers:
  - codex
  - gemini
  - claude-code
judge: claude-code
max_runtime_minutes: 20
risk_level: medium
human_review_policy: strict
allowed_paths:
  - src
  - test
  - scripts
  - docs
synthesis_policy: manual
publish_policy: manual
---

# Task
Fix the SQL injection vulnerability in the user lookup flow and document the remediation.

## Context
The demo service builds a lookup statement from untrusted email input. An attacker can inject an `OR role = 'admin'` predicate and retrieve the wrong user. The demo also requires a short human-readable writeup of the root cause and fix.

## Requirements
- Prevent injected email input from changing the lookup behavior.
- Keep the public `findUserByEmail(email)` interface unchanged.
- Document the bug, fix, and verification steps in `docs/security-fix.md`.

## Constraints
- No new dependencies.
- Keep the fix understandable to a reviewer who is learning secure coding basics.
- Stay within the existing demo repo structure.

## Acceptance Checks
- npm test
- node scripts/eval-security-fix.mjs

## Optional Guidance
- Parameterized queries are the intended fix shape for this demo.
- The documentation should explain both the exploit path and why the fix closes it.

## Human Notes
- This card is meant to prove Alloy can handle simple security remediation tasks, not just happy-path algorithm work.
