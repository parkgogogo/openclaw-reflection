# Memory Gate OpenRouter Model Benchmark 2026-03-09

- Suite: `memory-gate`
- Cases: `18`
- Route: shared OpenRouter-compatible `EVAL_BASE_URL` / `EVAL_API_KEY`
- Compared models:
  - `x-ai/grok-4.1-fast`
  - `inception/mercury-2`
  - `google/gemini-2.5-flash-lite`
  - `openai/gpt-4o-mini`
  - `minimax/minimax-m2.5`
  - `qwen/qwen3.5-flash-02-23`

| Model | Pass/Total | Accuracy | Errors (P/S/E) | Notes |
| --- | --- | --- | --- | --- |
| `x-ai/grok-4.1-fast` | `17/18` | `94.4%` | `0/0/0` | Best overall stability in this round |
| `qwen/qwen3.5-flash-02-23` | `17/18` | `94.4%` | `0/1/0` | Same pass rate as Grok, but one schema error |
| `google/gemini-2.5-flash-lite` | `16/18` | `88.9%` | `0/0/0` | Strong cheap option, weaker on TOOLS boundary |
| `inception/mercury-2` | `11/18` | `61.1%` | `0/0/0` | Frequently leaks USER updates into SOUL/NO_WRITE boundaries |
| `minimax/minimax-m2.5` | `9/18` | `50.0%` | `0/0/0` | Unstable on UPDATE_* vs NO_WRITE boundaries |
| `openai/gpt-4o-mini` | `4/18` | `22.2%` | `18/0/0` | Provider-side structured-output incompatibility on this route |

## Interpretation

- Default baseline: `x-ai/grok-4.1-fast`
- Best backup: `qwen/qwen3.5-flash-02-23`
- Cheapest serious candidate: `google/gemini-2.5-flash-lite`
- Not recommended as default: `inception/mercury-2`, `minimax/minimax-m2.5`
- Not recommended on the current OpenRouter/Azure-backed route: `openai/gpt-4o-mini`
