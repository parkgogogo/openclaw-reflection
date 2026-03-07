# Memory Gate V1 Research

This dataset captures the first-round memory-gate review after re-aligning labels with the `research/` notes.

Files:

- `shared/scenarios.jsonl`
- `memory-gate/benchmark.jsonl`

Command:

```bash
node evals/run.mjs --suite memory-gate --dataset-root evals/datasets/memory-gate/v1-research
```

Notes:

- Focuses on the older first-round scenarios.
- Useful for checking boundary drift against the research-derived interpretation of `USER` / `MEMORY` / `SOUL` / `IDENTITY`.
