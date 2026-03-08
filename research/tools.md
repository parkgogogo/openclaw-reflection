# TOOLS.md Research

## Official role
`TOOLS.md` is OpenClaw's local notes file for environment-specific tool context. Official docs describe the split this way:
- skills define how tools work
- `TOOLS.md` stores the specifics unique to a particular setup

It is a workspace cheat sheet for local names, aliases, endpoints, and other environment details that help the assistant use tools correctly without baking private infrastructure details into shared skills.

Sources:
- https://docs.openclaw.ai/reference/templates/TOOLS
- https://docs.openclaw.ai/reference/templates/AGENTS
- https://docs.openclaw.ai/tools

## What belongs here
- Camera names and locations
- SSH hosts and aliases
- Preferred TTS voices
- Speaker and room names
- Device nicknames
- Other environment-specific notes that help the assistant use tools in this workspace
- Local mappings from human-facing names to tool-facing identifiers

## What does not belong here
- General instructions for how a tool should be used across environments
- Shared reusable procedures that belong in a skill's `SKILL.md`
- The authoritative inventory of which OpenClaw runtime tools exist
- Assistant identity, behavior, or style rules
- User profile facts
- General long-term memory not tied to local tool usage
- Raw transcript-like notes or project chatter

## Boundary
### TOOLS vs skills
Official docs are explicit:
- skills define how tools work
- `TOOLS.md` holds the local specifics

So a skill should say how to operate a browser, node, camera, SSH, or TTS workflow in general. `TOOLS.md` should say which camera is "front-door", which host is "home-server", or which voice to prefer on this machine.

This means `TOOLS.md` is primarily configuration-shaped knowledge for skill execution, not reusable operational guidance.

### TOOLS vs AGENTS
`AGENTS.md` is the workspace operating manual. Official docs use it to tell the assistant to check skills and to keep local tool notes in `TOOLS.md`.

So:
- `AGENTS.md` says that local tool notes belong in `TOOLS.md`
- `TOOLS.md` contains the local notes themselves

Workspace-wide norms, session routines, and collaboration rules belong in `AGENTS.md`, not `TOOLS.md`.

### TOOLS vs runtime tools / tool inventory
The OpenClaw tools reference documents the real runtime tool surface: built-in tools, plugin tools, profiles, allowlists, groups, parameters, and safety guidance.

`TOOLS.md` is not that source of truth. It should not be treated as a registry of available tools or as a schema for tool calling. It is a local supplement that helps the assistant use whatever tools are actually available in the current OpenClaw runtime.

So if `TOOLS.md` mentions a camera, that does not prove a camera-capable tool exists. And if OpenClaw exposes a tool at runtime, that tool can exist even if `TOOLS.md` says nothing about it.

### TOOLS vs MEMORY / USER
Inference from official docs:
- `USER.md` is about the human
- `MEMORY.md` is broader durable memory
- `TOOLS.md` is local environment context specifically for tool use

If a fact mainly helps answer "how do I use tools correctly in this environment?", it fits `TOOLS.md`. If it mainly describes the user or a durable non-tool lesson, it belongs elsewhere.

## Operational implications for this plugin
- Treat `TOOLS.md` as environment-specific tool context, not as a general memory file
- Prefer writing compact mappings and local identifiers instead of prose-heavy notes
- Reject updates that are really reusable instructions and should live in a skill
- Reject updates that are really user profile, assistant identity, or long-term memory
- Do not infer tool availability from `TOOLS.md` alone; runtime tool exposure is a separate concern
- Be careful with sensitive infrastructure details, since the official motivation for separation is to avoid leaking local setup through shared skills
