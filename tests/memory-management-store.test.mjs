import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import { LocalMemoryManagementStore } from "../dist/memory-management/store.js";

async function createStore() {
  const workspaceDir = await mkdtemp(path.join(os.tmpdir(), "reflection-memory-store-"));
  const store = new LocalMemoryManagementStore({ workspaceDir });

  return {
    workspaceDir,
    store,
  };
}

function createProvenance(overrides = {}) {
  return {
    decision: "UPDATE_USER",
    reason: "user clarified a stable preference",
    recordedAt: "2026-03-12T00:00:00.000Z",
    sessionKey: "session-1",
    sourceMessageId: "message-1",
    ...overrides,
  };
}

test("LocalMemoryManagementStore lists tracked files from active facts", async () => {
  const { workspaceDir, store } = await createStore();

  try {
    await store.appendFactEvent({
      factId: "fact_user",
      type: "established",
      fileName: "USER.md",
      text: "prefers concise updates",
      provenance: createProvenance(),
      timestamp: "2026-03-12T00:00:00.000Z",
    });
    await store.appendFactEvent({
      factId: "fact_memory",
      type: "established",
      fileName: "MEMORY.md",
      text: "working on reflection memory management",
      provenance: createProvenance({
        decision: "UPDATE_MEMORY",
      }),
      timestamp: "2026-03-12T00:01:00.000Z",
    });
    await store.appendFactEvent({
      factId: "fact_user",
      type: "moved",
      fileName: "TOOLS.md",
      timestamp: "2026-03-12T00:02:00.000Z",
    });

    assert.deepEqual(await store.listFiles(), ["MEMORY.md", "TOOLS.md"]);
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test("LocalMemoryManagementStore stores and retrieves facts by file", async () => {
  const { workspaceDir, store } = await createStore();

  try {
    await store.appendFactEvent({
      factId: "fact_user",
      type: "established",
      fileName: "USER.md",
      text: "prefers direct technical feedback",
      provenance: createProvenance(),
      timestamp: "2026-03-12T00:00:00.000Z",
    });

    assert.deepEqual(await store.listFacts("USER.md"), [
      {
        id: "fact_user",
        fileName: "USER.md",
        text: "prefers direct technical feedback",
        status: "active",
        createdAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z",
        provenance: createProvenance(),
      },
    ]);
    assert.deepEqual(await store.getFact("fact_user"), {
      id: "fact_user",
      fileName: "USER.md",
      text: "prefers direct technical feedback",
      status: "active",
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z",
      provenance: createProvenance(),
    });
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test("LocalMemoryManagementStore preserves fact lifecycle events", async () => {
  const { workspaceDir, store } = await createStore();

  try {
    await store.appendFactEvent({
      factId: "fact_user",
      type: "established",
      fileName: "USER.md",
      text: "prefers concise status updates",
      provenance: createProvenance(),
      timestamp: "2026-03-12T00:00:00.000Z",
    });
    await store.appendFactEvent({
      factId: "fact_user",
      type: "edited",
      fileName: "USER.md",
      text: "prefers concise progress updates",
      timestamp: "2026-03-12T00:03:00.000Z",
    });
    await store.appendFactEvent({
      factId: "fact_user",
      type: "deleted",
      fileName: "USER.md",
      timestamp: "2026-03-12T00:04:00.000Z",
    });

    assert.deepEqual(
      (await store.listFactEvents("fact_user")).map((event) => ({
        type: event.type,
        fileName: event.fileName,
        text: event.text ?? null,
      })),
      [
        {
          type: "established",
          fileName: "USER.md",
          text: "prefers concise status updates",
        },
        {
          type: "edited",
          fileName: "USER.md",
          text: "prefers concise progress updates",
        },
        {
          type: "deleted",
          fileName: "USER.md",
          text: null,
        },
      ]
    );
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test("LocalMemoryManagementStore stores and retrieves pending proposals", async () => {
  const { workspaceDir, store } = await createStore();

  try {
    const proposal = await store.createProposal({
      action: "edit",
      factId: "fact_user",
      fileName: "USER.md",
      proposedText: "prefers terse progress updates",
      diff: "@@ -1 +1 @@",
      createdAt: "2026-03-12T00:05:00.000Z",
    });

    assert.equal(proposal.status, "pending");
    assert.match(proposal.id, /^proposal_/);
    assert.deepEqual(await store.getProposal(proposal.id), proposal);
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test("LocalMemoryManagementStore marks proposals as applied", async () => {
  const { workspaceDir, store } = await createStore();

  try {
    const proposal = await store.createProposal({
      action: "delete",
      factId: "fact_user",
      fileName: "USER.md",
      diff: "@@ -1 +0 @@",
      createdAt: "2026-03-12T00:05:00.000Z",
    });

    const applied = await store.applyProposalStateTransition(
      proposal.id,
      "2026-03-12T00:06:00.000Z"
    );

    assert.equal(applied.status, "applied");
    assert.equal(applied.appliedAt, "2026-03-12T00:06:00.000Z");
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test("LocalMemoryManagementStore marks proposals as discarded", async () => {
  const { workspaceDir, store } = await createStore();

  try {
    const proposal = await store.createProposal({
      action: "move",
      factId: "fact_user",
      fileName: "USER.md",
      targetFileName: "MEMORY.md",
      diff: "@@ -1 +1 @@",
      createdAt: "2026-03-12T00:05:00.000Z",
    });

    const discarded = await store.discardProposalStateTransition(
      proposal.id,
      "2026-03-12T00:07:00.000Z"
    );

    assert.equal(discarded.status, "discarded");
    assert.equal(discarded.discardedAt, "2026-03-12T00:07:00.000Z");
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});
