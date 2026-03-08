# Alloy Task Brief Schema And Parser Specification

Status: Draft
Authoring date: March 8, 2026
Purpose: Define the canonical Markdown task brief format, its normalized JSON representation, parser behavior, validation rules, and failure handling for Alloy.

## 1. Design Goals

The task brief system must satisfy both humans and machines.

Human goals:
- easy to author in Markdown
- easy to store in git
- readable in PRs and issue comments
- supports nuance and constraints

System goals:
- reliable structured fields for orchestration
- deterministic parsing
- clear validation failures
- normalized inputs for provider prompt packets and GUI rendering

## 2. Source Format

Alloy uses Markdown with YAML frontmatter.

File naming recommendation:
- `*.task.md`

Shape:

```md
---
task_id: task_20260308_001
project_id: bugfix-lab
project_label: Bugfix Lab
source_system: symphony
source_task_id: card_cache_001
source_url: https://example.local/tasks/card_cache_001
repo: demo/cache-service
repo_path: ../../samples/repos/cache-service
base_ref: main
mode: race
providers:
  - codex
  - gemini
  - claude-code
judge: claude-code
max_runtime_minutes: 20
risk_level: medium
human_review_policy: standard
---

# Task
Fix stale project detail responses after update.

## Context
Project detail reads are cached. After an update mutation, reads may continue returning stale values.

## Requirements
- Fix invalidation so reads reflect the updated project.
- Add a regression test.
- Keep the fix small and reviewable.

## Constraints
- No new dependencies.
- Do not change public API shapes.
- Prefer changes in existing cache modules and tests only.

## Acceptance Checks
- npm test
- npm run lint
- npm run typecheck

## Optional Guidance
- Small observability improvements are acceptable if directly related.

## Human Notes
- Prior attempts tended to over-edit the cache layer. Keep this targeted.
```

## 3. Supported Frontmatter Fields

Required:
- `task_id`: stable task identifier
- `project_id`: stable project identifier used for board grouping and run organization
- `project_label`: human-readable project label shown in the control panel
- `source_system`: `manual` or `symphony`
- `repo`: target repository slug or path alias
- `base_ref`: target branch/ref/commit-ish
- `mode`: `fast`, `race`, `relay`, or `committee`
- `providers`: ordered list of provider IDs
- `judge`: provider ID or special judge ID
- `max_runtime_minutes`: positive integer
- `risk_level`: `low`, `medium`, `high`
- `human_review_policy`: `minimal`, `standard`, `strict`

Optional:
- `source_task_id`: external card/task identifier
- `source_url`: external card/task URL
- `title`: override for the visible task title
- `repo_path`: local filesystem path used to seed candidate workspaces for CLI execution
- `allowed_paths`: ordered list of path prefixes
- `blocked_paths`: ordered list of path prefixes
- `tags`: ordered list of task tags
- `synthesis_policy`: `auto`, `manual`, or `winner_only`
- `publish_policy`: `manual`, `auto_if_high_confidence`

## 4. Supported Body Sections

Recognized top-level headings:
- `# Task`
- `## Context`
- `## Requirements`
- `## Constraints`
- `## Acceptance Checks`
- `## Optional Guidance`
- `## Human Notes`

Parser behavior:
- `# Task` is required unless `title` is provided in frontmatter
- list sections are normalized to arrays of strings
- prose sections are normalized to trimmed paragraphs
- unknown `##` headings are preserved in `additional_sections`

## 5. Canonical JSON Shape

Alloy normalizes every task brief to this object shape:

```json
{
  "task_id": "task_20260308_001",
  "project_id": "bugfix-lab",
  "project_label": "Bugfix Lab",
  "source_system": "symphony",
  "source_task_id": "card_cache_001",
  "source_url": "https://example.local/tasks/card_cache_001",
  "repo": "demo/cache-service",
  "repo_path": "/abs/path/to/demo/cache-service",
  "base_ref": "main",
  "mode": "race",
  "providers": ["codex", "gemini", "claude-code"],
  "judge": "claude-code",
  "max_runtime_minutes": 20,
  "risk_level": "medium",
  "human_review_policy": "standard",
  "title": "Fix stale project detail responses after update.",
  "context": "Project detail reads are cached. After an update mutation, reads may continue returning stale values.",
  "requirements": [
    "Fix invalidation so reads reflect the updated project.",
    "Add a regression test.",
    "Keep the fix small and reviewable."
  ],
  "constraints": [
    "No new dependencies.",
    "Do not change public API shapes.",
    "Prefer changes in existing cache modules and tests only."
  ],
  "acceptance_checks": [
    "npm test",
    "npm run lint",
    "npm run typecheck"
  ],
  "optional_guidance": [
    "Small observability improvements are acceptable if directly related."
  ],
  "human_notes": [
    "Prior attempts tended to over-edit the cache layer. Keep this targeted."
  ],
  "allowed_paths": [],
  "blocked_paths": [],
  "tags": [],
  "synthesis_policy": "auto",
  "publish_policy": "manual",
  "additional_sections": []
}
```

## 6. Provider ID Rules

Supported demo values:
- `codex`
- `gemini`
- `claude-code`

Rules:
- provider IDs must be unique within one task
- `judge` should either be one of the provider IDs or a future synthetic judge ID
- provider order determines default candidate slot assignment: `A`, `B`, `C`, ...

## 7. Validation Rules

Hard validation failures:
- frontmatter missing
- malformed frontmatter
- missing required frontmatter fields
- missing task title and missing `# Task` heading
- empty providers list
- unsupported mode
- unsupported source system
- unsupported risk level
- unsupported human review policy
- `max_runtime_minutes` not a positive integer
- judge not present in providers for MVP
- duplicate providers

Soft warnings:
- missing `## Context`
- missing `## Optional Guidance`
- more than 10 acceptance checks
- no explicit constraints
- no path scoping for high-risk tasks

## 8. Parsing Rules

Frontmatter parsing rules for MVP:
- support `key: value`
- support array fields using `- item`
- support integer parsing for `max_runtime_minutes`
- trim surrounding quotes if present
- preserve ordering of arrays

Body parsing rules:
- identify headings by Markdown markers
- `# Task` stores the title text under that heading
- list items beginning with `- ` are collected as arrays for list sections
- non-list paragraphs are concatenated with one blank-line separator in text sections
- unknown sections are preserved in `additional_sections`

## 9. Error Reporting

The parser must return structured errors.

Example:

```json
{
  "ok": false,
  "errors": [
    {
      "code": "missing_required_field",
      "field": "providers",
      "message": "Frontmatter field 'providers' is required."
    }
  ],
  "warnings": []
}
```

## 10. Normalization Rules

Defaults:
- `source_system`: `manual`
- `source_task_id`: `\"\"`
- `source_url`: `\"\"`
- `repo_path`: `\"\"`
- `allowed_paths`: `[]`
- `blocked_paths`: `[]`
- `tags`: `[]`
- `synthesis_policy`: `auto`
- `publish_policy`: `manual`
- `optional_guidance`: `[]`
- `human_notes`: `[]`
- `additional_sections`: `[]`

Normalization rules:
- trim all string values
- drop empty list items
- collapse repeated whitespace inside scalar frontmatter values
- preserve command strings exactly in `acceptance_checks`

## 11. Prompt Packet Derivation

The normalized task object is the only source of truth for prompt packet generation.

Per provider, Alloy derives:
- candidate slot
- provider label
- task summary
- hard requirements
- constraints
- acceptance commands
- repo context hints
- working rules

This avoids provider-specific prompt drift caused by raw Markdown interpretation.

## 12. GUI Usage

The GUI Task Composer should render:
- raw Markdown editor
- parsed frontmatter summary
- parsed section preview
- validation errors/warnings
- final normalized JSON preview for debugging

## 13. Versioning

The normalized task object should include an internal schema version once the format stabilizes.

Recommendation:
- add `schema_version: 1` when the first implementation is live

## 14. Recommended MVP Implementation

Implement in three layers:

1. `parseTaskBrief(markdown)`
- produce raw parsed sections

2. `normalizeTaskBrief(parsed)`
- apply defaults and canonical field names

3. `validateTaskBrief(normalized)`
- return errors and warnings

This keeps parser behavior testable and easier to evolve.

## 15. Out Of Scope For MVP

- nested YAML objects beyond simple arrays
- Markdown tables
- embedded attachments
- provider-specific prompt directives in the task file
- multiple tasks in one file

## 16. Definition Of Done

The task brief system is ready when:
- a human can author one task file in Markdown
- Alloy can parse it deterministically
- Alloy can show useful validation errors
- Alloy can generate normalized JSON and provider prompt packets
- future agents can extend the schema without breaking old task files
