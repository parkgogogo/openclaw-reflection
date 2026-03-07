import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";

import { Consolidator } from "../dist/consolidation/consolidator.js";

function createLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

test("Consolidator uses cleanup decision and LLM proposed updates on long-term files", async () => {
  const workspaceDir = await mkdtemp(path.join(os.tmpdir(), "reflection-consolidator-"));
  await writeFile(
    path.join(workspaceDir, "MEMORY.md"),
    "# MEMORY\n\n## Active Projects\n- legacy item\n\n## Open Threads\n- duplicate thread\n- duplicate thread\n",
    "utf8"
  );
  await writeFile(
    path.join(workspaceDir, "USER.md"),
    "# USER\n\n## Preferences\n- old preference\n",
    "utf8"
  );
  await writeFile(
    path.join(workspaceDir, "SOUL.md"),
    "# SOUL\n\n## Communication Style\n- too wordy\n",
    "utf8"
  );

  let calls = 0;
  const llmService = {
    async generateObject() {
      calls += 1;
      return {
        decision: "WRITE_CLEANUP",
        proposed_updates: {
          "MEMORY.md": [
            {
              section: "Open Threads",
              action: "replace",
              content: "- reflection plugin v3 alignment",
            },
          ],
          "USER.md": [
            {
              section: "Preferences",
              action: "replace",
              content: "- prefer concise responses",
            },
          ],
          "SOUL.md": [
            {
              section: "Communication Style",
              action: "replace",
              content: "- concise, direct, technically rigorous",
            },
          ],
        },
      };
    },
  };

  try {
    const consolidator = new Consolidator(
      {
        workspaceDir,
        schedule: "0 2 * * *",
      },
      createLogger(),
      llmService
    );

    const result = await consolidator.consolidate();
    const memoryContent = await readFile(path.join(workspaceDir, "MEMORY.md"), "utf8");
    const userContent = await readFile(path.join(workspaceDir, "USER.md"), "utf8");
    const soulContent = await readFile(path.join(workspaceDir, "SOUL.md"), "utf8");

    assert.equal(calls, 1, "expected Consolidator to call the LLM exactly once");
    assert.ok(
      memoryContent.includes("- reflection plugin v3 alignment"),
      "expected MEMORY.md to be updated from LLM output"
    );
    assert.ok(
      userContent.includes("- prefer concise responses"),
      "expected USER.md to be updated from LLM output"
    );
    assert.ok(
      soulContent.includes("- concise, direct, technically rigorous"),
      "expected SOUL.md to be updated from LLM output"
    );
    assert.ok(
      Object.prototype.hasOwnProperty.call(result.updates, "MEMORY.md"),
      "expected result.updates to include MEMORY.md"
    );
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});
