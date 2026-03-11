import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";

import {
  MANAGED_REGION_END,
  MANAGED_REGION_START,
} from "../dist/memory-management/managed-region.js";
import { ReflectionMemoryManagementService } from "../dist/memory-management/service.js";

async function createWorkspace() {
  const workspaceDir = await mkdtemp(path.join(os.tmpdir(), "reflection-memory-service-"));

  await writeFile(
    path.join(workspaceDir, "USER.md"),
    [
      "# USER",
      "",
      "Manual notes before.",
      "",
      MANAGED_REGION_START,
      "- prefers direct technical feedback",
      MANAGED_REGION_END,
      "",
      "Manual notes after.",
      "",
    ].join("\n"),
    "utf8"
  );

  await writeFile(
    path.join(workspaceDir, "MEMORY.md"),
    [
      "# MEMORY",
      "",
      MANAGED_REGION_START,
      MANAGED_REGION_END,
      "",
    ].join("\n"),
    "utf8"
  );

  return workspaceDir;
}

async function createService() {
  const workspaceDir = await createWorkspace();
  const service = new ReflectionMemoryManagementService({ workspaceDir });

  await service.recordManagedWrite({
    fileName: "USER.md",
    text: "prefers direct technical feedback",
    provenance: {
      decision: "UPDATE_USER",
      reason: "user clarified a stable preference",
      recordedAt: "2026-03-12T00:00:00.000Z",
      sessionKey: "session-1",
      sourceMessageId: "message-1",
    },
  });

  return { workspaceDir, service };
}

test("ReflectionMemoryManagementService lists managed files and file facts", async () => {
  const { workspaceDir, service } = await createService();

  try {
    const files = await service.listFiles();
    const userFile = await service.getFileView("USER.md");

    assert.equal(files.some((file) => file.fileName === "USER.md"), true);
    assert.equal(
      files.find((file) => file.fileName === "USER.md")?.health,
      "healthy"
    );
    assert.equal(userFile.health, "healthy");
    assert.equal(userFile.facts.length, 1);
    assert.equal(userFile.facts[0].text, "prefers direct technical feedback");
    assert.match(userFile.renderedManagedBody, /prefers direct technical feedback/);
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test("ReflectionMemoryManagementService returns fact provenance and lifecycle history", async () => {
  const { workspaceDir, service } = await createService();

  try {
    const userFile = await service.getFileView("USER.md");
    const factView = await service.getFactView(userFile.facts[0].id);

    assert.equal(factView.fact.text, "prefers direct technical feedback");
    assert.equal(factView.provenance.decision, "UPDATE_USER");
    assert.equal(factView.events.length, 1);
    assert.equal(factView.events[0].type, "established");
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test("ReflectionMemoryManagementService creates and applies edit, move, and delete proposals", async () => {
  const { workspaceDir, service } = await createService();

  try {
    const userFile = await service.getFileView("USER.md");
    const factId = userFile.facts[0].id;

    const editProposal = await service.createEditProposal(
      factId,
      "prefers concise technical feedback"
    );
    assert.equal(editProposal.action, "edit");
    assert.match(editProposal.diff, /prefers concise technical feedback/);

    await service.applyProposal(editProposal.id);
    const editedUserFile = await service.getFileView("USER.md");
    assert.equal(editedUserFile.facts[0].text, "prefers concise technical feedback");

    const moveProposal = await service.createMoveProposal(factId, "MEMORY.md");
    assert.equal(moveProposal.action, "move");
    await service.applyProposal(moveProposal.id);

    const movedUserFile = await service.getFileView("USER.md");
    const memoryFile = await service.getFileView("MEMORY.md");
    assert.equal(movedUserFile.facts.length, 0);
    assert.equal(memoryFile.facts.length, 1);
    assert.equal(memoryFile.facts[0].text, "prefers concise technical feedback");

    const deleteProposal = await service.createDeleteProposal(factId);
    assert.equal(deleteProposal.action, "delete");
    await service.applyProposal(deleteProposal.id);

    const deletedMemoryFile = await service.getFileView("MEMORY.md");
    assert.equal(deletedMemoryFile.facts.length, 0);
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test("ReflectionMemoryManagementService refuses mutations when managed region drift is detected", async () => {
  const { workspaceDir, service } = await createService();

  try {
    const userFile = await service.getFileView("USER.md");
    const factId = userFile.facts[0].id;
    const userPath = path.join(workspaceDir, "USER.md");

    await writeFile(
      userPath,
      [
        "# USER",
        "",
        "Manual notes before.",
        "",
        MANAGED_REGION_START,
        "- manually edited outside the store",
        MANAGED_REGION_END,
        "",
        "Manual notes after.",
        "",
      ].join("\n"),
      "utf8"
    );

    await assert.rejects(
      service.createDeleteProposal(factId),
      /drift/i
    );
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test("ReflectionMemoryManagementService applyProposal updates only the managed region", async () => {
  const { workspaceDir, service } = await createService();

  try {
    const userFile = await service.getFileView("USER.md");
    const proposal = await service.createEditProposal(
      userFile.facts[0].id,
      "prefers concise technical feedback"
    );

    await service.applyProposal(proposal.id);

    const content = await readFile(path.join(workspaceDir, "USER.md"), "utf8");
    assert.match(content, /Manual notes before\./);
    assert.match(content, /Manual notes after\./);
    assert.match(content, /prefers concise technical feedback/);
    assert.doesNotMatch(content, /prefers direct technical feedback/);
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});
