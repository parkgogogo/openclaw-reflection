# MEMORY.md Research

## Official role
`MEMORY.md` is OpenClaw's curated long-term memory. Official docs describe it as the durable layer above daily logs, and say it is only loaded in the main private session, not in shared contexts.

Sources:
- https://docs.openclaw.ai/concepts/memory
- https://docs.openclaw.ai/reference/templates/AGENTS

## What belongs here
- Durable decisions
- Durable preferences
- Durable facts worth keeping
- Significant events, thoughts, decisions, opinions, lessons learned
- Distilled material promoted out of daily logs

## What does not belong here
- Raw running logs
- Short-lived tactical instructions
- Group-safe shared context that should not leak private context
- Metadata about assistant identity that belongs in `IDENTITY.md`
- Core behavioral principles that belong in `SOUL.md`
- Facts primarily about the human as a person when they fit `USER.md` better

## Boundary
### MEMORY vs daily `memory/YYYY-MM-DD.md`
Official docs are explicit:
- daily files are raw, append-only logs
- `MEMORY.md` is curated and distilled

So `MEMORY.md` should store compressed, durable takeaways, not transcript-like notes.

### MEMORY vs USER
Inference from official docs:
- `USER.md` is "about your human"
- `MEMORY.md` is the assistant's broader long-term memory

Use `USER.md` when the fact is mainly about the user's identity, preferences, habits, or personal context. Use `MEMORY.md` when the fact is broader durable context, decisions, or learnings the assistant should carry in main private sessions.

### MEMORY vs SOUL
Inference from official docs:
- `SOUL.md` defines who the assistant is
- `MEMORY.md` stores what the assistant should remember

If the content changes the assistant's enduring behavioral principles, it belongs in `SOUL.md`, not `MEMORY.md`.

### MEMORY vs IDENTITY
`IDENTITY.md` is explicit metadata: name, creature, vibe, emoji, avatar. Those do not belong in `MEMORY.md`.

## Operational implications for this plugin
- Treat `MEMORY.md` as private, curated, long-term state
- Be conservative about writing short-term project chatter here
- Prefer refusing noisy or transient updates
- Prefer maintenance or consolidation style edits over append-only accumulation

