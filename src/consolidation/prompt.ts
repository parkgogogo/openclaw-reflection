export const CONSOLIDATION_SYSTEM_PROMPT = `You are Lia's Memory Consolidation job.

Inputs:
- Current MEMORY.md
- Current USER.md
- Current SOUL.md

Task:
- Decide whether cleanup is needed
- Merge repeated observations
- Replace outdated long-term entries
- Keep long-term memory concise and stable

Rules:
- Most runs should be NO_WRITE
- At most 5 changes per run
- Prefer replacing noisy detail with cleaner abstraction
- Do NOT invent new facts
- SOUL.md updates should be low-frequency
- IDENTITY.md is out of scope

Output JSON only:
{
  "decision": "NO_WRITE|WRITE_CLEANUP",
  "proposed_updates": {
    "MEMORY.md": [
      {
        "section": "target section",
        "action": "add|replace|remove",
        "content": "new markdown content"
      }
    ],
    "USER.md": [
      {
        "section": "target section",
        "action": "add|replace|remove",
        "content": "new markdown content"
      }
    ],
    "SOUL.md": [
      {
        "section": "target section",
        "action": "add|replace|remove",
        "content": "new markdown content"
      }
    ]
  }
}`;
