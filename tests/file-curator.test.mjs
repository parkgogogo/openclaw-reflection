import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";

import { FileCurator } from "../dist/file-curator/index.js";

function createLogger() {
  const entries = [];

  return {
    entries,
    debug(scope, message, meta) {
      entries.push({ level: "debug", scope, message, meta });
    },
    info(scope, message, meta) {
      entries.push({ level: "info", scope, message, meta });
    },
    warn(scope, message, meta) {
      entries.push({ level: "warn", scope, message, meta });
    },
    error(scope, message, meta) {
      entries.push({ level: "error", scope, message, meta });
    },
  };
}

test("FileCurator rewrites the whole target file from current raw content", async () => {
  const workspaceDir = await mkdtemp(path.join(os.tmpdir(), "reflection-curator-"));
  const userFile = path.join(workspaceDir, "USER.md");

  await writeFile(
    userFile,
    "# USER\n\n## Preferences\n- existing preference\n",
    "utf8"
  );

  let calls = 0;
  let receivedSystemPrompt = "";
  let receivedPrompt = "";
  const llmClient = {
    async complete(prompt, systemPrompt) {
      calls += 1;
      receivedPrompt = prompt;
      receivedSystemPrompt = systemPrompt;
      return JSON.stringify({
        should_update: true,
        file: "USER.md",
        reason: "new stable preference",
        next_content: [
          "# USER",
          "",
          "## Preferences",
          "- existing preference",
          "- prefer direct technical feedback",
          "",
          "## Collaboration",
          "- prefers concise, direct critique",
          "",
        ].join("\n"),
      });
    },
  };

  try {
    const curator = new FileCurator({ workspaceDir }, createLogger(), llmClient);
    await curator.write({
      decision: "UPDATE_USER",
      reason: "user clarified preference",
      candidateFact: "prefer direct technical feedback",
    });

    const content = await readFile(userFile, "utf8");

    assert.equal(calls, 1, "expected FileCurator to call the LLM once");
    assert.equal(
      content,
      [
        "# USER",
        "",
        "## Preferences",
        "- existing preference",
        "- prefer direct technical feedback",
        "",
        "## Collaboration",
        "- prefers concise, direct critique",
        "",
      ].join("\n"),
      "expected FileCurator to overwrite the whole target file with LLM output"
    );
    assert.match(
      receivedSystemPrompt,
      /USER\.md.*about your human|about your human.*USER\.md/s,
      "expected unified guardian prompt to encode USER.md semantics"
    );
    assert.match(
      receivedPrompt,
      /Current file content:\n# USER/,
      "expected FileCurator to pass raw current file content to the LLM"
    );
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test("FileCurator logs guardian refusal and leaves the target file untouched", async () => {
  const workspaceDir = await mkdtemp(path.join(os.tmpdir(), "reflection-curator-"));
  const soulFile = path.join(workspaceDir, "SOUL.md");
  const logger = createLogger();

  await writeFile(
    soulFile,
    "# SOUL\n\n## Boundaries\n- protect continuity\n",
    "utf8"
  );

  let calls = 0;
  const llmClient = {
    async complete() {
      calls += 1;
      return JSON.stringify({
        should_update: false,
        file: "SOUL.md",
        reason: "temporary mood change is not a soul-level update",
      });
    },
  };

  try {
    const curator = new FileCurator({ workspaceDir }, logger, llmClient);
    await curator.write({
      decision: "UPDATE_SOUL",
      reason: "temporary tone change",
      candidateFact: "be more casual today",
    });

    const content = await readFile(soulFile, "utf8");

    assert.equal(calls, 1, "expected FileCurator to call the LLM once");
    assert.equal(
      content,
      "# SOUL\n\n## Boundaries\n- protect continuity\n",
      "expected FileCurator to leave SOUL.md unchanged when guardian refuses"
    );

    const refusalLog = logger.entries.find(
      (entry) =>
        entry.level === "info" &&
        entry.scope === "FileCurator" &&
        entry.message.includes("Guardian refused update")
    );

    assert.ok(refusalLog, "expected guardian refusal to be logged internally");
    assert.match(
      refusalLog.meta.reason,
      /temporary mood change/i,
      "expected refusal log to include curator reason"
    );
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});
