# Eval Baseline 2026-03-07

Command:

```bash
node evals/run.mjs --suite all --no-judge
```

Mode:

- judge: disabled
- provider: `.env` configured eval model

## Summary

- `memory-gate`: `3/16` passed
- `write-guardian`: `11/12` passed

## Memory Gate Failures

Primary pattern:

- `UPDATE_USER` often drifts into `UPDATE_MEMORY`
- some `UPDATE_MEMORY` cases collapse to `NO_WRITE`
- `UPDATE_SOUL` is not stable and drifts into `UPDATE_USER` or `UPDATE_MEMORY`
- several failures are route failures, not just candidate fact wording issues

Per-case failures:

1. `mg_user_preference_direct_feedback`
   - expected: `UPDATE_USER`
   - actual: `UPDATE_USER`
   - note: candidate fact mismatch only
2. `mg_user_prefers_chinese`
   - expected: `UPDATE_USER`
   - actual: `UPDATE_MEMORY`
3. `mg_user_dislikes_fluff`
   - expected: `UPDATE_USER`
   - actual: `UPDATE_MEMORY`
4. `mg_user_project_focus_reflection_plugin`
   - expected: `UPDATE_USER`
   - actual: `UPDATE_MEMORY`
5. `mg_memory_decision_use_two_loops`
   - expected: `UPDATE_MEMORY`
   - actual: `UPDATE_MEMORY`
   - note: candidate fact mismatch only
6. `mg_memory_decision_remove_daily_memory`
   - expected: `UPDATE_MEMORY`
   - actual: `NO_WRITE`
7. `mg_memory_next_step_build_eval_benchmark`
   - expected: `UPDATE_MEMORY`
   - actual: `NO_WRITE`
8. `mg_memory_active_thread_llm_service_refactor`
   - expected: `UPDATE_MEMORY`
   - actual: `UPDATE_MEMORY`
   - note: candidate fact mismatch only
9. `mg_soul_guardian_should_refuse_when_unsure`
   - expected: `UPDATE_SOUL`
   - actual: `UPDATE_USER`
10. `mg_soul_keep_direct_engineering_style`
   - expected: `UPDATE_SOUL`
   - actual: `UPDATE_MEMORY`
11. `mg_identity_name_changed`
   - expected: `UPDATE_IDENTITY`
   - actual: `UPDATE_IDENTITY`
   - note: candidate fact mismatch only
12. `mg_identity_avatar_changed`
   - expected: `UPDATE_IDENTITY`
   - actual: `NO_WRITE`
13. `mg_boundary_user_vs_memory_project_fact`
   - expected: `UPDATE_MEMORY`
   - actual: `NO_WRITE`

## Writer Guardian Failures

Primary pattern:

- guardian is largely stable
- current major miss is a false refusal on a straightforward `USER.md` stable preference write

Per-case failures:

1. `wg_user_add_stable_preference`
   - expected: write to `USER.md`
   - actual: refusal
   - tool trace: `[]`

## Interpretation

- current bottleneck is `memory-gate`, not `write-guardian`
- next optimization should focus on bucket semantics:
  - `USER` vs `MEMORY`
  - `SOUL` vs `MEMORY`
  - when project next steps should still count as `UPDATE_MEMORY`
