# Memory Gate Judge Eval 2026-03-07

Command:

```bash
node evals/run.mjs --suite memory-gate
```

Mode:

- judge: enabled
- provider: `.env` configured eval model
- judge provider: updated judge model from `.env`

## Summary

- `memory-gate`: `11/16` passed

## Observations

- The new judge model removed the earlier long stalls.
- This run did not show the previous `~75s` single-case delay pattern.
- Candidate fact semantic matching now recovers many cases that looked bad under `--no-judge`.

## Remaining Failures

1. `mg_user_project_focus_reflection_plugin`
   - expected: `UPDATE_USER`
   - actual: `UPDATE_MEMORY`
   - issue: still routes current focus as project memory instead of user current focus

2. `mg_memory_next_step_build_eval_benchmark`
   - expected: `UPDATE_MEMORY`
   - actual: `UPDATE_MEMORY`
   - issue: candidate fact still framed as review ownership, not next-step memory

3. `mg_soul_guardian_should_refuse_when_unsure`
   - expected: `UPDATE_SOUL`
   - actual: `UPDATE_USER`
   - issue: enduring Lia principle still misread as user preference

4. `mg_soul_keep_direct_engineering_style`
   - expected: `UPDATE_SOUL`
   - actual: `UPDATE_USER`
   - issue: enduring Lia style still misread as user preference

5. `mg_no_write_single_turn_tactical_instruction`
   - expected: `NO_WRITE`
   - actual: `UPDATE_USER`
   - issue: one-off tactic still over-generalized into a stable preference

## Comparison

- baseline no-judge: `3/16`
- latest no-judge after prompt work: `2/16`
- latest judge run: `11/16`

Interpretation:

- route quality improved enough that semantic judge now validates most candidate facts
- remaining bottleneck is mostly bucket boundary logic:
  - `USER` vs `MEMORY`
  - `SOUL` vs `USER`
  - `NO_WRITE` vs stable preference
