# Alloy GUI Wireframes

Status: Draft
Authoring date: March 8, 2026
Purpose: Define the first wireframe-level GUI for Alloy, focused on task composition, live monitoring, candidate comparison, synthesis review, and final PR transparency.

## 1. Design Principles

- show process state, not chat noise
- make decision points obvious
- show provenance and rationale everywhere it matters
- prioritize trust and reviewability over flashy visuals
- keep provider operations visible to humans and provider identity hidden from the judge

## 2. Primary Screens

1. Alloy Control Panel
2. Task Composer / Card Detail
3. Live Run Dashboard
4. Candidate Compare View
5. Synthesis Plan View
6. Final PR Review View
7. Metrics View

## 3. Alloy Control Panel

Purpose:
- make task cards the main entry point for the demo
- show which tasks are ready, running, blocked, or PR-ready

Wireframe:

```text
+--------------------------------------------------------------------------------+
| Alloy | Control Panel                                       [New Task] [Filter] |
+--------------------------------------------------------------------------------+
| Columns: Draft | Prepared | Running | Needs Merge | Synthesized | Published    |
+--------------------------------------------------------------------------------+
| [Card] Fix stale project detail cache invalidation                               |
| Repo: demo/cache-service                                                        |
| Providers: Codex, Gemini, Claude Code                                           |
| State: Running                                                                   |
| Judge: pending                                                                   |
| PR: not ready                                                                    |
| [Open Card]                                                                      |
+--------------------------------------------------------------------------------+
| [Card] Tighten retry test coverage                                               |
| Repo: demo/cache-service                                                        |
| Providers: Codex, Claude Code                                                   |
| State: Winner Ready                                                              |
| Judge: high confidence                                                           |
| PR: #12                                                                          |
| [Open Card]                                                                      |
+--------------------------------------------------------------------------------+
```

Required behaviors:
- card states map cleanly to Alloy run states
- cards expose enough status to scan the board without opening each run
- opening a card should land in the task detail/composer view

## 3.1 Provider Auth Panel

Purpose:
- make non-API provider login readiness visible before runs start
- let humans repair login state without leaving the product context

Wireframe:

```text
+--------------------------------------------------------------------------------+
| Provider Readiness                                                             |
+--------------------------------------------------------------------------------+
| Codex        Installed: yes   Auth: unknown   Version: 0.x   [Open Login]     |
| Claude Code  Installed: yes   Auth: valid     Version: 1.x   [Recheck]        |
| Gemini CLI   Installed: yes   Auth: invalid   Version: 0.x   [Open Login]     |
+--------------------------------------------------------------------------------+
| Notes                                                                          |
| - Unknown means Alloy cannot confidently verify the current session yet.       |
| - Login opens the provider's interactive CLI in a PTY-backed session.         |
+--------------------------------------------------------------------------------+
```

Required behaviors:
- show `valid`, `invalid`, `unknown`, or `not_installed`
- show provider-specific login help text near the action button
- block run launch when required providers are missing or clearly invalid
- allow a human to re-check provider state after completing login

## 4. Task Composer / Card Detail

Purpose:
- create or edit a task brief
- validate it before launch
- preview how Alloy will interpret it

Wireframe:

```text
+--------------------------------------------------------------------------------+
| Alloy | Task Composer                                            [Run Preview] |
+--------------------------------------------------------------------------------+
| Repo: [demo/cache-service v]   Base Ref: [main          ]  Mode: [race v]     |
| Providers: [x] Codex [x] Gemini [x] Claude Code  Judge: [Claude Code     v]   |
| Runtime Budget: [20] min       Risk: [medium v]         Review: [standard v]  |
+--------------------------------------+-----------------------------------------+
| Markdown Task Brief                  | Parsed Task Preview                     |
|--------------------------------------|-----------------------------------------|
| ---                                  | task_id: task_20260308_001              |
| task_id: ...                         | providers: codex, gemini, claude-code  |
| repo: demo/cache-service             | acceptance_checks: 3                    |
| ...                                  | allowed_paths: none                      |
|                                      | warnings: 1                              |
| # Task                               |                                         |
| Fix stale project detail...          | Requirements                             |
| ...                                  | - Fix invalidation bug                  |
|                                      | - Add regression test                   |
|                                      | - Keep changes minimal                  |
+--------------------------------------+-----------------------------------------+
| Validation: [No errors] [1 warning: no path scoping for medium-risk task]      |
+--------------------------------------------------------------------------------+
| [Save Draft] [Generate Preview] [Launch Run]                                    |
+--------------------------------------------------------------------------------+
```

Required behaviors:
- live validation as the user edits
- frontmatter form controls stay in sync with Markdown frontmatter
- parsed preview shows exactly what will reach the conductor
- launch button disabled on hard validation errors

## 5. Live Run Dashboard

Purpose:
- let humans monitor the run in progress
- surface candidate state, verification, and pending decisions

Wireframe:

```text
+--------------------------------------------------------------------------------+
| Alloy | Run task_20260308_001                    Status: Running   08:14 elapsed |
+--------------------------------------------------------------------------------+
| Timeline: [Task Parsed]--[Workspaces Ready]--[Candidates Running]--[Judge]--[...]|
+--------------------------------------------------------------------------------+
| Candidate A          | Candidate B          | Candidate C                       |
| Codex                | Gemini               | Claude Code                       |
| State: running       | State: verifying     | State: running                    |
| Files: 4 changed     | Files: 6 changed     | Files: 3 changed                  |
| Build: pending       | Build: pass          | Build: pending                    |
| Tests: pending       | Tests: pass          | Tests: pending                    |
| Last event:          | Last event:          | Last event:                       |
| editing cache.ts     | running lint         | writing regression test           |
| [Open logs]          | [Open logs]          | [Open logs]                       |
+--------------------------------------------------------------------------------+
| Shared Event Stream                                                          ^ |
| 12:31:04 codex started run in workspace cand_a                                | |
| 12:31:30 gemini updated src/cache/projectCache.ts                             | |
| 12:31:52 claude-code created test/projectCache.test.ts                        | |
| 12:32:10 gemini verification: build pass                                      | |
+------------------------------------------------------------------------------|-+
| Decision Panel                                                                  |
| Judge: queued                                                                    |
| Synthesis: not started                                                           |
| Human action required: none                                                      |
| [Pause] [Stop Run] [Open Compare View]                                          |
+--------------------------------------------------------------------------------+
```

Required behaviors:
- update status without full page reload
- preserve a durable event log
- allow drill-down into per-candidate transcripts and verification output
- show when the system is waiting on human approval

## 6. Candidate Compare View

Purpose:
- make the judge outcome legible

Wireframe:

```text
+--------------------------------------------------------------------------------+
| Candidate Compare                                        Judge Confidence: Med |
+--------------------------------------------------------------------------------+
|            | Candidate A | Candidate B | Candidate C                            |
|------------|-------------|-------------|-------------                           |
| Correctness| 36          | 34          | 32                                    |
| Tests      |  8          | 10          |  7                                    |
| Safety     |  9          |  8          |  8                                    |
| Total      | 87          | 88          | 79                                    |
+--------------------------------------------------------------------------------+
| File Overlap                                                                    |
| src/cache/projectCache.ts    A,B,C                                              |
| test/projectCache.test.ts    B,C                                                |
| src/metrics/cache.ts         C                                                  |
+--------------------------------------------------------------------------------+
| Contribution Map                                                                |
| Best core fix: A                                                                |
| Best tests: B                                                                   |
| Best observability cleanup: C                                                   |
+--------------------------------------------------------------------------------+
| Pairwise Results                                                                |
| A beats C on correctness                                                        |
| B beats A on tests                                                              |
| A narrowly beats B overall                                                      |
+--------------------------------------------------------------------------------+
```

Rule:
- show anonymized labels in judge-oriented compare panels
- humans can still open provider-specific operational details outside the blind review panel

## 7. Synthesis Plan View

Purpose:
- explain exactly what Alloy plans to merge

Wireframe:

```text
+--------------------------------------------------------------------------------+
| Synthesis Plan                                                  Approval Needed |
+--------------------------------------------------------------------------------+
| Recommendation: synthesize finalists A and B; include observability note from C |
+--------------------------------------------------------------------------------+
| Planned Merge                                                                   |
| 1. Take cache invalidation logic from Candidate A                               |
| 2. Take regression tests from Candidate B                                       |
| 3. Keep logging change from Candidate C only if verification stays green        |
+--------------------------------------------------------------------------------+
| Risks                                                                           |
| - A and B both modify src/cache/projectCache.ts                                 |
| - C touches src/metrics/cache.ts, low risk                                      |
| - Confidence medium; human approval recommended                                 |
+--------------------------------------------------------------------------------+
| Final Stack Preview                                                              |
| commit 1: fix cache invalidation                                                |
| commit 2: add regression tests                                                  |
| commit 3: add cache invalidation metric                                         |
+--------------------------------------------------------------------------------+
| [Approve Plan] [Reject Plan] [Prefer Winner Only] [Request Recompose]           |
+--------------------------------------------------------------------------------+
```

## 8. Final PR Review View

Purpose:
- let humans inspect the final result before publication

Wireframe:

```text
+--------------------------------------------------------------------------------+
| Final PR Review                                           Verification: All Pass |
+--------------------------------------------------------------------------------+
| PR Title: Fix stale project detail cache invalidation                           |
| Branch/Bookmark: alloy/task_20260308_001                                        |
+--------------------------------------------------------------------------------+
| Final Stack                                                                     |
| 1. fix cache invalidation                                                        |
| 2. add regression coverage                                                       |
| 3. add cache miss metric                                                         |
+--------------------------------------------------------------------------------+
| Provenance                                                                       |
| commit 1 <- Candidate A                                                          |
| commit 2 <- Candidate B                                                          |
| commit 3 <- Candidate C                                                          |
+--------------------------------------------------------------------------------+
| Judge Summary                                                                    |
| Candidate A had best core fix. Candidate B had strongest regression coverage.    |
| Candidate C contributed a small safe observability improvement.                  |
+--------------------------------------------------------------------------------+
| [Open Diff] [Open Verification Logs] [Publish PR] [Export Run Report]            |
+--------------------------------------------------------------------------------+
```

## 9. Metrics View

Purpose:
- show provider ROI and route-learning signals

Must show:
- participation rate
- win rate
- contribution rate
- average time to green
- average human cleanup time
- task-class breakdown

## 10. Event And Decision Visibility

The GUI must expose:
- raw events for operator debugging
- structured summaries for human comprehension
- explicit decision records for routing, judging, synthesis, and publication

## 11. Approval Rules

Recommended default rules for MVP:
- low-risk demo repo: human approval required only before PR publication
- medium/high-risk repo: approval required before synthesis and publication
- any low-confidence judge outcome: approval required before synthesis

## 12. MVP Build Order

1. Alloy Control Panel
2. Task Composer / Card Detail
3. Live Run Dashboard
4. Candidate Compare View
5. Synthesis Plan View
6. Final PR Review View
7. Metrics View

## 13. Definition Of Done

The GUI is ready for the first demo when:
- a human can open a task card from the board
- a human can submit a Markdown task
- a human can watch all three candidates progress
- a human can see the judge decision and synthesis plan
- a human can inspect the final provenance and publish one PR
