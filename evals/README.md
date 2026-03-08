# Evals

This directory contains benchmark datasets for offline evaluation of:

- `memory_gate`
- `write_guardian`

These evals are intentionally independent from plugin runtime config.

## Provider Config

The eval runner now supports two execution modes.

### Single-model mode

Use `.env` or process environment:

- `EVAL_BASE_URL`
- `EVAL_API_KEY`
- `EVAL_MODEL`

Optional judge model settings:

- `JUDGE_BASE_URL`
- `JUDGE_API_KEY`
- `JUDGE_MODEL`

If `JUDGE_*` is omitted, the eval runner may default to the same provider as `EVAL_*`.

### Multi-model comparison mode

Use `evals/models.json` to define the model matrix. Each profile stores:

- `id`
- `label`
- `model`
- `enabled`
- optional `tags`

Comparison mode still reads provider settings from `.env` or process environment:

- `EVAL_BASE_URL`
- `EVAL_API_KEY`

The profile file only defines which models to compare. This mode currently assumes all compared models are reached through the same OpenAI-compatible provider endpoint, such as OpenRouter.

Production plugin config is separate and must continue to use plugin `config.llm.*`.

## Dataset Layout

```text
evals/
  README.md
  schemas/
    shared-scenario.schema.json
    memory-gate-case.schema.json
    write-guardian-case.schema.json
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
    write-guardian/
      benchmark.jsonl
  models.json
```

Default mode still reads:

- `evals/datasets/shared/scenarios.jsonl`
- `evals/datasets/memory-gate/benchmark.jsonl`
- `evals/datasets/write-guardian/benchmark.jsonl`

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

For suite-specific runs, only the relevant dataset files are loaded. For example, `--suite memory-gate` does not require a write-guardian benchmark file.

## Comparison Mode

Run the same suite across multiple model profiles:

```bash
node evals/run.mjs \
  --suite memory-gate \
  --models-config evals/models.json \
  --models grok-fast,gpt-5 \
  --baseline grok-fast \
  --output evals/results/2026-03-09-memory-gate-matrix.json \
  --markdown-output evals/results/2026-03-09-memory-gate-matrix.md
```

Flags:

- `--models-config <path>`: load model profiles from JSON
- `--models <id1,id2,...>`: run only the selected enabled profiles
- `--baseline <id>`: choose the comparison baseline
- `--output <path>`: write machine-readable JSON
- `--markdown-output <path>`: write human-readable Markdown

The comparison report includes:

- leaderboard ranking
- baseline diffs
- hardest cases
- disagreement cases

If `--models-config` is omitted, the runner stays in single-model mode and uses `EVAL_*`.

## Design Principles

- Small and hard: first version targets stable regression coverage, not breadth.
- Golden labels are human-authored.
- `memory_gate` and `write_guardian` are evaluated separately.
- Shared scenario IDs keep both datasets aligned without forcing end-to-end evaluation.

## memory_gate Metrics

- decision accuracy
- candidate fact exact match
- candidate fact semantic match

## write_guardian Metrics

- should-write accuracy
- target-file consistency
- allowed tool-trace match
- key content assertions:
  - required snippets present
  - forbidden snippets absent

## Notes

- Shared scenarios omit timestamps; eval runners can synthesize ordered timestamps.
- `write_guardian` benchmark entries include current file content and golden write/refuse expectations.
