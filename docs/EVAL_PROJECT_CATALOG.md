# Eval Project Catalog

Status: Initial catalog
Purpose: Define the first compact set of demo projects Alloy should use to validate runner quality, coding correctness, and synthesis value.

## Recommended Core Set

1. Smoke Lab
- `FizzBuzz CLI`
- Goal: prove CLI auth, task execution, stdout capture, and exact-output checking.

2. Algo Lab
- `Roman Numerals`
- Goal: pure-function correctness with compact, reviewable diffs.

3. Algo Lab
- `LRU Cache`
- Goal: stateful behavior and deterministic sequence testing.

4. Game Lab
- `Tic-Tac-Toe Perfect Play`
- Goal: deeper reasoning and a good first synthesis candidate.

5. Security Lab
- `SQL Injection Remediation`
- Goal: fix a common vulnerability and document the bug and remediation clearly.

## Additional Good Follow-Ups

- `Cache Invalidation`
- `Cross-language Porting`
- `CSV Stats CLI`
- `Diff Summary Formatter`

## Why This Mix Works

- Smoke tasks prove the runner.
- Small algorithm tasks prove correctness cheaply.
- Strategy tasks prove reasoning.
- Security tasks prove Alloy can handle remediation plus documentation.
- Realistic bugfix tasks prove the product is not limited to toy prompts.
