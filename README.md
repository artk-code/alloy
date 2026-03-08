# Alloy

Alloy is a multi-agent orchestration system for running `codex`, `gemini`, and `claude-code` against the same coding task, evaluating the results, and synthesizing a stronger final pull request with `jj`.

This repository currently contains:
- the implementation plan
- demo and operator experience specs
- setup guides
- task brief and GUI specs
- a no-dependency Node scaffold for `task brief -> prompt packet -> candidate run artifacts`

## Quick Start

Requirements:
- Node.js 20+

Run the sample pipeline:

```bash
node src/cli.mjs samples/tasks/cache-invalidation.task.md
```

Or:

```bash
npm run task:sample
```

Artifacts are written under `runs/<task-id>*`.

## Current Scaffold Outputs

For a given task brief, the scaffold generates:
- `task/task.json`
- `task/source.task.md`
- `prompt-packets/*.json`
- `prompt-packets/*.md`
- `candidates/*/manifest.json`
- placeholder directories for candidate workspaces and logs

## Important Scope Note

The current scaffold does not run provider CLIs yet. It prepares the normalized task input and artifact layout that the future runner will use.
