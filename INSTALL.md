# OpenClaw Plugin Install Skill

This file is written for OpenClaw itself to follow when installing `@parkgogogo/openclaw-reflection`.

## Role

Your job is to install the packaged plugin, gather the minimum required config from the operator, write the config under the correct plugin id, and verify that the gateway becomes healthy.

Do not assume missing config values. Ask for them.

## Ask First

Before writing config, ask the operator for the following values if they are not already known from the active profile:

1. The target `workspaceDir`
2. The LLM provider `baseURL`
3. The LLM provider `apiKey`
4. The LLM model id
5. Whether the profile uses `plugins.allow`

Use these defaults unless the operator asks for something else:

- `bufferSize`: `50`
- `logLevel`: `info`
- `memoryGate.enabled`: `true`
- `memoryGate.windowSize`: `10`
- `consolidation.enabled`: `true`
- `consolidation.schedule`: `0 2 * * *`

Recommended model:

- `x-ai/grok-4.1-fast`

## Install Rules

- Use the packaged plugin from npm, not a linked checkout
- Configure the plugin under `openclaw-reflection`
- Never use the old id `reflection-plugin`
- Do not leave `llm.baseURL`, `llm.apiKey`, or `llm.model` empty
- Only add `openclaw-reflection` to `plugins.allow` if the profile already uses an allowlist

## Install Steps

### 1. Install The Package

Run:

```bash
openclaw plugins install @parkgogogo/openclaw-reflection@0.1.0
```

If the operator explicitly provides a local release tarball instead, use:

```bash
openclaw plugins install ./parkgogogo-openclaw-reflection-0.1.0.tgz
```

### 2. Write The Plugin Config

Write this under `plugins.entries.openclaw-reflection` in the active OpenClaw profile:

```json
{
  "enabled": true,
  "config": {
    "workspaceDir": "/absolute/path/to/agent-workspace",
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
      "enabled": true,
      "schedule": "0 2 * * *"
    }
  }
}
```

If the profile uses an allowlist, make sure `plugins.allow` contains:

```json
["openclaw-reflection"]
```

### 3. Validate The Config

Run:

```bash
openclaw config validate --json
```

Do not continue if validation fails.

### 4. Start Or Restart The Gateway

Run:

```bash
openclaw gateway run --force --verbose
```

### 5. Verify Success

In another shell, verify the gateway probe:

```bash
curl --fail http://127.0.0.1:PORT/health
```

Success requires all of the following:

- The gateway starts without plugin registration errors
- The plugin log contains `Plugin registered successfully, all hooks active`
- `GET /health` returns JSON containing `"ok": true`

## Failure Handling

If installation or startup fails:

1. Check that the plugin id is `openclaw-reflection`
2. Check that `llm.baseURL`, `llm.apiKey`, and `llm.model` are non-empty
3. Check that `plugins.allow` is not blocking the plugin
4. Re-run `openclaw config validate --json`
5. Re-read the plugin log and gateway log before retrying
