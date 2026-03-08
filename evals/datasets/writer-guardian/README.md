# Writer Guardian Datasets

Active default dataset:

- `benchmark.jsonl`

The active default dataset now includes `TOOLS.md` write and refusal coverage for local mappings versus reusable procedures.

Versioned datasets:

- `v1-research/`
- `v2/`

Examples:

```bash
node evals/run.mjs --suite writer-guardian
node evals/run.mjs --suite writer-guardian --dataset-root evals/datasets/writer-guardian/v1-research
node evals/run.mjs --suite writer-guardian --dataset-root evals/datasets/writer-guardian/v2
```
