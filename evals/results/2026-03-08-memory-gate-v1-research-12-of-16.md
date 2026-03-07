# Memory Gate V1 Research Result

- Date: `2026-03-08`
- Suite: `memory-gate`
- Dataset bundle: `evals/datasets/memory-gate/v1-research`
- Result: `12/16 passed`

## Command

```bash
node evals/run.mjs --suite memory-gate --dataset-root evals/datasets/memory-gate/v1-research
```

## Failing cases

1. `mg_memory_decision_use_two_loops`
   - expected: `UPDATE_MEMORY`
   - actual: `NO_WRITE`

2. `mg_memory_decision_remove_daily_memory`
   - expected: `UPDATE_MEMORY`
   - actual: `NO_WRITE`

3. `mg_identity_avatar_changed`
   - expected decision: `UPDATE_IDENTITY`
   - actual decision: `UPDATE_IDENTITY`
   - candidate fact drifted to `Vibe is calmer minimalist.`

4. `mg_boundary_user_vs_memory_project_fact`
   - expected: `UPDATE_MEMORY`
   - actual: `NO_WRITE`

## Interpretation

- The current prompt still encodes `project architecture decisions -> NO_WRITE`.
- That conflicts with `research/memory.md`, which treats durable decisions as valid `MEMORY.md` material.
- `IDENTITY` routing is correct, but avatar/vibe phrasing is not yet stable for the older first-round dataset wording.
