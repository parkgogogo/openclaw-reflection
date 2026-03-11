import test from "node:test";
import assert from "node:assert/strict";

import { parseReflectionCommand } from "../dist/reflection-command.js";

test("parseReflectionCommand parses file and fact navigation commands", () => {
  assert.deepEqual(parseReflectionCommand("files"), {
    kind: "files",
  });
  assert.deepEqual(parseReflectionCommand("file USER.md"), {
    kind: "file",
    fileName: "USER.md",
  });
  assert.deepEqual(parseReflectionCommand("fact fact_123"), {
    kind: "fact",
    factId: "fact_123",
  });
});

test("parseReflectionCommand parses proposal commands", () => {
  assert.deepEqual(parseReflectionCommand("proposal proposal_123"), {
    kind: "proposal",
    proposalId: "proposal_123",
  });
  assert.deepEqual(parseReflectionCommand("apply proposal_123"), {
    kind: "apply",
    proposalId: "proposal_123",
  });
  assert.deepEqual(parseReflectionCommand("discard proposal_123"), {
    kind: "discard",
    proposalId: "proposal_123",
  });
});

test("parseReflectionCommand parses propose delete, edit, and move commands", () => {
  assert.deepEqual(parseReflectionCommand("propose delete fact_123"), {
    kind: "propose_delete",
    factId: "fact_123",
  });
  assert.deepEqual(
    parseReflectionCommand('propose edit fact_123 --text "prefers concise updates"'),
    {
      kind: "propose_edit",
      factId: "fact_123",
      text: "prefers concise updates",
    }
  );
  assert.deepEqual(parseReflectionCommand("propose move fact_123 --to MEMORY.md"), {
    kind: "propose_move",
    factId: "fact_123",
    targetFileName: "MEMORY.md",
  });
});

test("parseReflectionCommand parses reconcile mode commands", () => {
  assert.deepEqual(parseReflectionCommand("reconcile USER.md --mode overwrite"), {
    kind: "reconcile",
    fileName: "USER.md",
    mode: "overwrite",
  });
  assert.deepEqual(parseReflectionCommand("reconcile USER.md --mode adopt"), {
    kind: "reconcile",
    fileName: "USER.md",
    mode: "adopt",
  });
  assert.deepEqual(parseReflectionCommand("reconcile USER.md --mode detach"), {
    kind: "reconcile",
    fileName: "USER.md",
    mode: "detach",
  });
});

test("parseReflectionCommand rejects invalid commands", () => {
  assert.throws(() => parseReflectionCommand(""), /usage/i);
  assert.throws(() => parseReflectionCommand("propose edit fact_123"), /--text/i);
  assert.throws(() => parseReflectionCommand("propose move fact_123"), /--to/i);
  assert.throws(() => parseReflectionCommand("reconcile USER.md"), /--mode/i);
});
