# Writer Guardian Datasets

Active default dataset:

- `benchmark.jsonl`

Versioned datasets:

- `v1-research/`
- `v2/`

Examples:

```bash
node evals/run.mjs --suite writer-guardian
node evals/run.mjs --suite writer-guardian --dataset-root evals/datasets/writer-guardian/v1-research
node evals/run.mjs --suite writer-guardian --dataset-root evals/datasets/writer-guardian/v2
```
