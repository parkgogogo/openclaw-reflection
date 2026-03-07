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

test("FileCurator exposes read and write tools to the writer guardian", async () => {
  const workspaceDir = await mkdtemp(path.join(os.tmpdir(), "reflection-curator-"));
  const userFile = path.join(workspaceDir, "USER.md");

  await writeFile(
    userFile,
    "# USER\n\n## Preferences\n- existing preference\n",
    "utf8"
  );

  let receivedRunAgent = null;
  const llmService = {
    async runAgent(params) {
      receivedRunAgent = params;
      const readTool = params.tools.find((tool) => tool.name === "read");
      const writeTool = params.tools.find((tool) => tool.name === "write");

      assert.ok(readTool, "expected read tool to be available");
      assert.ok(writeTool, "expected write tool to be available");

      const current = await readTool.execute({});
      assert.match(
        current,
        /existing preference/,
        "expected read tool to expose current file content"
      );

      await writeTool.execute({
        content: "# USER\n\n## Preferences\n- existing preference\n- prefer direct technical feedback\n",
      });

      return {
        didWrite: true,
        finalMessage: "updated",
        steps: [],
      };
    },
  };

  try {
    const curator = new FileCurator({ workspaceDir }, createLogger(), llmService);
    await curator.write({
      decision: "UPDATE_USER",
      reason: "user clarified preference",
      candidateFact: "prefer direct technical feedback",
    });

    const content = await readFile(userFile, "utf8");

    assert.ok(receivedRunAgent, "expected FileCurator to delegate to llmService.runAgent");
    assert.match(
      receivedRunAgent.systemPrompt,
      /Writer Guardian/,
      "expected writer guardian system prompt"
    );
    assert.doesNotMatch(
      receivedRunAgent.systemPrompt,
      /\bLia\b/,
      "writer guardian prompt should not hardcode a specific assistant name"
    );
    assert.doesNotMatch(
      receivedRunAgent.systemPrompt,
      /ongoing projects|active threads/i,
      "MEMORY prompt should not treat project chatter as durable memory by default"
    );
    assert.doesNotMatch(
      receivedRunAgent.systemPrompt,
      /recurring goals, projects/i,
      "USER prompt should not treat project topics as user profile by default"
    );
    assert.match(
      receivedRunAgent.systemPrompt,
      /project chatter.*USER\.md/i,
      "writer guardian prompt should explicitly reject project chatter in USER.md"
    );
    assert.match(
      receivedRunAgent.systemPrompt,
      /continuity/i,
      "writer guardian prompt should treat continuity rules as valid SOUL content"
    );
    assert.match(
      receivedRunAgent.systemPrompt,
      /explicit metadata change.*write/i,
      "writer guardian prompt should allow explicit IDENTITY metadata changes"
    );
    assert.match(
      receivedRunAgent.systemPrompt,
      /replace existing metadata/i,
      "writer guardian prompt should allow replacing old identity metadata"
    );
    assert.match(
      receivedRunAgent.systemPrompt,
      /preserve the candidate fact/i,
      "writer guardian prompt should preserve candidate fact wording when writing"
    );
    assert.equal(
      content,
      "# USER\n\n## Preferences\n- existing preference\n- prefer direct technical feedback\n",
      "expected write tool to overwrite the full target file"
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

  const llmService = {
    async runAgent() {
      return {
        didWrite: false,
        finalMessage: "temporary mood change is not a soul-level update",
        steps: [],
      };
    },
  };

  try {
    const curator = new FileCurator({ workspaceDir }, logger, llmService);
    await curator.write({
      decision: "UPDATE_SOUL",
      reason: "temporary tone change",
      candidateFact: "be more casual today",
    });

    const content = await readFile(soulFile, "utf8");

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
      "expected refusal log to include guardian reason"
    );
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});
