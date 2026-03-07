# Evals

This directory contains benchmark datasets for offline evaluation of:

- `memoryGate`
- `writer guardian`

These evals are intentionally independent from plugin runtime config.

## Provider Config

Eval scripts should read provider settings from `.env` or process environment:

- `EVAL_BASE_URL`
- `EVAL_API_KEY`
- `EVAL_MODEL`

Optional judge model settings:

- `JUDGE_BASE_URL`
- `JUDGE_API_KEY`
- `JUDGE_MODEL`

If `JUDGE_*` is omitted, the eval runner may default to the same provider as `EVAL_*`.

Production plugin config is separate and must continue to use plugin `config.llm.*`.

## Dataset Layout

```text
evals/
  README.md
  schemas/
    shared-scenario.schema.json
    memory-gate-case.schema.json
    writer-guardian-case.schema.json
  datasets/
    shared/
      scenarios.jsonl
    memory-gate/
      benchmark.jsonl
      v1-research/
        README.md
        shared/
          scenarios.jsonl
        memory-gate/
          benchmark.jsonl
      v2/
        README.md
        shared/
          scenarios.jsonl
        memory-gate/
          benchmark.jsonl
    writer-guardian/
      benchmark.jsonl
```

Default mode still reads:

- `evals/datasets/shared/scenarios.jsonl`
- `evals/datasets/memory-gate/benchmark.jsonl`
- `evals/datasets/writer-guardian/benchmark.jsonl`

You can also point the runner at a versioned dataset root:

```bash
node evals/run.mjs --suite memory-gate --dataset-root evals/datasets/memory-gate/v2
```

Or override individual files:

```bash
node evals/run.mjs \
  --suite memory-gate \
  --shared-dataset evals/datasets/memory-gate/v2/shared/scenarios.jsonl \
  --memory-gate-dataset evals/datasets/memory-gate/v2/memory-gate/benchmark.jsonl
```

For suite-specific runs, only the relevant dataset files are loaded. For example, `--suite memory-gate` does not require a writer-guardian benchmark file.

## Design Principles

- Small and hard: first version targets stable regression coverage, not breadth.
- Golden labels are human-authored.
- `memoryGate` and `writer guardian` are evaluated separately.
- Shared scenario IDs keep both datasets aligned without forcing end-to-end evaluation.

## Memory Gate Metrics

- decision accuracy
- candidate fact exact match
- candidate fact semantic match

## Writer Guardian Metrics

- should-write accuracy
- target-file consistency
- allowed tool-trace match
- key content assertions:
  - required snippets present
  - forbidden snippets absent

## Notes

- Shared scenarios omit timestamps; eval runners can synthesize ordered timestamps.
- `writer guardian` benchmark entries include current file content and golden write/refuse expectations.
