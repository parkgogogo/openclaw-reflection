# Memory Gate Datasets

Active default dataset:

- `benchmark.jsonl`

The active default dataset now includes `TOOLS.md` routing coverage for local tool mappings and refusal cases for runtime capability claims.

Versioned datasets:

- `v1-research/`
- `v2/`

Examples:

```bash
node evals/run.mjs --suite memory-gate
node evals/run.mjs --suite memory-gate --dataset-root evals/datasets/memory-gate/v1-research
node evals/run.mjs --suite memory-gate --dataset-root evals/datasets/memory-gate/v2
```
