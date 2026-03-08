# Eval Project Catalog

Status: Initial catalog
Purpose: Define the first compact set of demo projects Alloy should use to validate runner quality, coding correctness, and synthesis value.

## Current Demo Set

Implemented now:

1. Smoke Lab
- `FizzBuzz CLI`
- Goal: prove queue -> run -> verify -> diff capture quickly.

2. Algo Lab
- `Roman Numerals`
- Goal: prove compact pure-function correctness with fast review cycles.

3. Game Lab
- `Tic-Tac-Toe Perfect Play`
- Goal: deeper reasoning and a good first synthesis candidate.

4. Security Lab
- `SQL Injection Remediation`
- Goal: fix a common vulnerability and document the bug and remediation clearly.

5. Bugfix Lab
- `Cache Invalidation`
- Goal: prove realistic stale-data repair in a slightly richer repo.

## Recommended Follow-Ups

1. Algo Lab
- `LRU Cache`
- Goal: stateful behavior and deterministic sequence testing.

2. Porting Lab
- `Cross-language Porting`

3. CLI Lab
- `CSV Stats CLI`

4. Text Lab
- `Diff Summary Formatter`

## Why This Mix Works

- Smoke tasks prove the runner.
- Small algorithm tasks prove correctness cheaply.
- Strategy tasks prove reasoning.
- Security tasks prove Alloy can handle remediation plus documentation.
- Realistic bugfix tasks prove the product is not limited to toy prompts.
