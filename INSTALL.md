# OpenClaw Plugin Install Skill

Use this file when installing `@parkgogogo/openclaw-reflection`.

## Role

Install the package, collect only missing config, write the plugin entry, validate config, and restart the gateway.

## Ask Only If Missing

- `workspaceDir`
  Recommendation: use OpenClaw's current workspace for the active profile.
  Only ask if the current workspace is unknown or the operator wants a different one.
- `llm.baseURL`
- `llm.apiKey`
- `llm.model`
- whether the profile already uses `plugins.allow`

## Defaults

- `bufferSize`: `50`
- `logLevel`: `info`
- `memoryGate.enabled`: `true`
- `memoryGate.windowSize`: `10`
- `consolidation.enabled`: `false`
- `consolidation.schedule`: `0 2 * * *`
- recommended model: `x-ai/grok-4.1-fast`

## Rules

- Install from npm, not a linked checkout.
- Write config under `plugins.entries.openclaw-reflection`.
- Do not leave `llm.baseURL`, `llm.apiKey`, or `llm.model` empty.
- Only add `openclaw-reflection` to `plugins.allow` if the profile already uses an allowlist.

## Steps

### 1. Install

```bash
openclaw plugins install @parkgogogo/openclaw-reflection@0.1.0
```

### 2. Write Config

Use the current OpenClaw workspace as `workspaceDir` unless the operator explicitly wants another workspace.

```jsonc
{
  "enabled": true,
  "config": {
    "workspaceDir": "/absolute/path/to/current-openclaw-workspace",
    "bufferSize": 50,
    "logLevel": "info",
    "llm": {
      "baseURL": "https://openrouter.ai/api/v1",
      "apiKey": "YOUR_API_KEY",
      "model": "x-ai/grok-4.1-fast"
    },
    "memoryGate": {
      "enabled": true,
      "windowSize": 10
    },
    "consolidation": {
      "enabled": false,
      "schedule": "0 2 * * *"
    }
  }
}
```

If the profile uses `plugins.allow`, ensure it contains:

```json
["openclaw-reflection"]
```

### 3. Validate

```bash
openclaw config validate --json
```

Stop if validation fails.

### 4. Restart

```bash
openclaw gateway restart
```
