# Alloy Adapter And Runner Slice

Status: Draft
Authoring date: March 8, 2026
Purpose: Document the first implementation slice for real provider adapters and live run capture so future agents can extend the runner without re-deriving the architecture.

## 1. What This Slice Adds

This slice introduces four concrete capabilities:
- provider adapter registry for `codex`, `gemini`, and `claude-code`
- `doctor` checks for installed provider CLIs
- `run` execution path with isolated candidate workspaces
- live event capture into JSONL for candidate and run-level monitoring

## 2. Current Command Surface

Alloy CLI now supports:
- `node src/cli.mjs doctor`
- `node src/cli.mjs prepare <task-brief.md>`
- `node src/cli.mjs run <task-brief.md>`
- `node src/cli.mjs run <task-brief.md> --dry-run`

## 3. Provider Defaults

These defaults are based on current official CLI automation surfaces and are intentionally conservative.

### Codex
Default binary:
- `codex`

Default shape:
- `codex exec --json --skip-git-repo-check --sandbox workspace-write --full-auto --max-turns <N> <prompt>`

Rationale:
- `exec` is the unattended path
- `--json` gives structured stdout
- `--full-auto` avoids approval loops in isolated workspaces

### Claude Code
Default binary:
- `claude`

Default shape:
- `claude -p <prompt> --output-format stream-json --verbose --max-turns <N> --dangerously-skip-permissions`

Rationale:
- `-p` is the headless path
- `stream-json` gives machine-readable events
- permission skipping is necessary for unattended orchestration in sandboxed workspaces

### Gemini CLI
Default binary:
- `gemini`

Default shape:
- `gemini -p <prompt> --output-format stream-json`

Rationale:
- `-p` is the headless path
- `stream-json` gives machine-readable events

## 4. Important Limitation

These adapters are real subprocess adapters, but they are still early.

What they do now:
- build documented command lines
- launch provider CLIs in candidate workspaces
- capture stdout and stderr to files
- normalize line events into JSONL
- update candidate manifests and final run summary

What they do not do yet:
- authenticate providers
- inspect provider-specific semantic event payloads deeply
- collect changed file diffs automatically
- run verification commands after coding completes
- manage `jj` workspaces yet

## 5. Event Model

Two JSONL streams are written:
- run-level: `runs/<task-id>/events/run-events.jsonl`
- candidate-level: `runs/<task-id>/candidates/<provider>/events.jsonl`

Event kinds currently include:
- `run.started`
- `candidate.started`
- `candidate.stream`
- `candidate.completed`
- `run.completed`

Each event includes:
- timestamp
- task ID
- provider
- candidate slot
- raw line
- parsed JSON if the line is valid JSON

## 6. Manifest Lifecycle

Candidate manifests now evolve through:
- `planned`
- `running`
- `completed`
- `failed`

Each manifest records:
- workspace path
- prompt packet paths
- command preview used for launch
- exit code
- error text if any
- summary line
- artifact log paths
- candidate event stream path

## 7. Workspace Seeding

The task brief format now supports optional `repo_path`.

If provided:
- Alloy seeds each candidate workspace by copying the source repo contents into that workspace before launch

If omitted:
- Alloy still creates workspaces, but they are empty placeholders suitable only for dry runs or mocked providers

## 8. Why This Matters For The GUI

The GUI specs now have a real backend event shape to consume.

Specifically:
- board/card states can derive from manifest status and run summary status
- live dashboard cards can stream from candidate event JSONL
- judge/synthesis views can later consume the same artifact tree structure

## 9. Recommended Next Step After This Slice

The next engineering step should be:
- add verification command execution after provider completion
- capture git or `jj` diffs from candidate workspaces
- promote the event stream into a UI-friendly API or file watcher service

## 10. Source Notes

These defaults were chosen using current official documentation for:
- Codex CLI unattended execution
- Claude Code headless JSON streaming
- Gemini CLI headless JSON streaming

Future agents should re-check official docs before changing automation flags because these interfaces can evolve.
