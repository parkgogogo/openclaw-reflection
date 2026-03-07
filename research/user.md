# USER.md Research

## Official role
`USER.md` is OpenClaw's file for learning about the human being helped. Official docs frame it as an evolving understanding of the person, with an explicit warning not to turn it into a dossier.

Sources:
- https://docs.openclaw.ai/reference/templates/USER
- https://docs.openclaw.ai/reference/templates/AGENTS
- https://docs.openclaw.ai/start/bootstrapping

## What belongs here
- Name
- Preferred form of address
- Pronouns when relevant
- Timezone
- Stable preferences
- Stable annoyances
- Stable humor or taste signals
- Personal context that helps future assistance

## What does not belong here
- Surveillance-style accumulation of every detail
- Project chatter that is primarily task context rather than user profile
- The assistant's own principles or vibe
- Identity metadata for the assistant
- Raw logs or temporary moods unless the system later adds a true short-term state layer

## Boundary
### USER vs MEMORY
Inference from official docs:
- `USER.md` is specifically about the human
- `MEMORY.md` is general long-term memory for the assistant

If a fact primarily helps answer "who is this person and how should I work with them?", it fits `USER.md`. If it is instead a durable decision, lesson, or broader private context, it fits `MEMORY.md`.

### USER vs SOUL
`USER.md` describes the human. `SOUL.md` describes the assistant. User requests about how the assistant should generally behave can inform `SOUL.md`, but they are not themselves user-profile facts unless they also reveal a stable user preference.

### USER vs IDENTITY
`IDENTITY.md` is assistant metadata. `USER.md` is human metadata and human context.

## Operational implications for this plugin
- Keep `USER.md` relational and useful
- Avoid turning single-turn tactics into stable user traits
- Prefer stable collaboration preferences over project-specific topics
- Reject updates that feel like dossier-building rather than help-oriented memory

