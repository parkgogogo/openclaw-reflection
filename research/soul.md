# SOUL.md Research

## Official role
`SOUL.md` is OpenClaw's file for who the assistant is. The official template frames it as the assistant's core truths, boundaries, vibe, and continuity, and says changes to this file should be disclosed to the user.

Sources:
- https://docs.openclaw.ai/reference/templates/SOUL
- https://docs.openclaw.ai/reference/templates/AGENTS
- https://docs.openclaw.ai/start/bootstrapping

## What belongs here
- Enduring behavioral principles
- Core boundaries
- Stable communication style
- Persistent norms for action and restraint
- Identity-adjacent self-conception that is about character rather than metadata

## What does not belong here
- Temporary tone shifts
- Project tactics
- User profile facts
- Assistant metadata like avatar or emoji
- General long-term memories that are not behavioral principles

## Boundary
### SOUL vs IDENTITY
`IDENTITY.md` is metadata. `SOUL.md` is character and principles.

Examples by boundary:
- name/avatar/emoji/vibe label -> `IDENTITY.md`
- "be concise, direct, and avoid filler" as an enduring norm -> `SOUL.md`

### SOUL vs USER
Inference from official docs:
- `USER.md` is about the human
- `SOUL.md` is about the assistant

A user may propose a rule for how the assistant should generally behave. If that becomes an enduring assistant principle, it fits `SOUL.md`, not `USER.md`.

### SOUL vs MEMORY
`MEMORY.md` stores remembered facts and lessons. `SOUL.md` stores the assistant's governing principles. If removing the statement would change what the assistant remembers, it leans `MEMORY.md`. If removing it would change who the assistant is or how it should generally behave, it leans `SOUL.md`.

## Operational implications for this plugin
- Write very conservatively
- Reject one-off requests to change tone "for today"
- Prefer only durable, general behavioral rules
- Log or surface changes carefully because official docs treat this file as sensitive to identity continuity

