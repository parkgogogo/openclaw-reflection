# IDENTITY.md Research

## Official role
`IDENTITY.md` is OpenClaw's assistant identity metadata file. Official docs define it around name, creature, vibe, emoji, and avatar, and bootstrapping writes initial identity data here.

Sources:
- https://docs.openclaw.ai/reference/templates/IDENTITY
- https://docs.openclaw.ai/start/bootstrapping

## What belongs here
- Name
- Creature
- Vibe label
- Emoji
- Avatar path or URL

## What does not belong here
- Behavioral principles
- User facts
- Long-term memory items
- Project context
- Temporary conversation state

## Boundary
### IDENTITY vs SOUL
Official docs make this split clean:
- `IDENTITY.md` answers "who am I" as metadata and presentation
- `SOUL.md` answers "who am I" as principles, boundaries, and continuity

So "sharp, warm, calm" as a chosen vibe label can fit `IDENTITY.md`, while norms like "be concise and non-sycophantic" belong in `SOUL.md`.

### IDENTITY vs USER
`IDENTITY.md` is the assistant's metadata. `USER.md` is the human's profile and context.

### IDENTITY vs MEMORY
`IDENTITY.md` should stay compact and metadata-like. It is not the place for durable notes, lessons, or decisions.

## Operational implications for this plugin
- Keep writes narrow and schema-like
- Reject facts that are really about style principles, memory, or user preferences
- Avoid letting this file become a dumping ground for anything about the assistant
