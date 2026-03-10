# Message Received Debug Capture Design

## Goal

When Reflection runs with `logLevel=debug`, capture the latest raw `message_received` callback payload so we can model the real OpenClaw event shape precisely.

## Scope

- Add a dedicated debug artifact at `logs/debug.json`
- Only write it for `message_received`
- Always overwrite with the most recent sample
- Include the unsanitized raw `event` and `hookContext`
- Keep the existing daily `reflection-YYYY-MM-DD.log` behavior unchanged

## Why This Shape

The current structured log is useful for runtime diagnosis, but it mixes normalized and sanitized data into a rolling log file. For schema modeling, the most useful output is the raw callback object and raw hook context, preserved as-is in one stable location.

Overwriting the same file is deliberate: it avoids unbounded growth and makes it obvious which sample is the latest.

## Design

### Trigger

- Enabled only when plugin `logLevel` resolves to `debug`
- Called from the `message_received` callback before normalization changes the view of the payload

### Output File

- Path: `logs/debug.json`
- JSON object shape:
  - `timestamp`
  - `hookName`
  - `event`
  - `hookContext`

### Non-Goals

- No history retention
- No extra sanitization or truncation
- No capture for `before_message_write`
- No changes to gateway-visible command behavior

## Risks

- Raw payloads may contain more detail than the normal log stream. This is acceptable because the file is only produced in explicit debug mode.
- Circular structures would break JSON serialization. Current OpenClaw hook payloads appear plain-object based; if that changes, the write should fail safely without affecting the main plugin flow.

## Validation

- Add tests proving debug mode writes `logs/debug.json`
- Add tests proving subsequent writes overwrite the previous sample
- Add tests proving non-debug logger levels do not create the file
