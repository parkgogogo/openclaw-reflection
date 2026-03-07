# Memory Gate Datasets

Active default dataset:

- `benchmark.jsonl`

Versioned datasets:

- `v1-research/`
- `v2/`

Examples:

```bash
node evals/run.mjs --suite memory-gate
node evals/run.mjs --suite memory-gate --dataset-root evals/datasets/memory-gate/v1-research
node evals/run.mjs --suite memory-gate --dataset-root evals/datasets/memory-gate/v2
```
