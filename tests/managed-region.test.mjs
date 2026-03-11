import test from "node:test";
import assert from "node:assert/strict";

import {
  MANAGED_REGION_END,
  MANAGED_REGION_START,
  detectManagedRegionDrift,
  parseManagedRegion,
  renderManagedRegion,
} from "../dist/memory-management/managed-region.js";

test("parseManagedRegion extracts managed and free-text sections", () => {
  const content = [
    "# USER",
    "",
    "Some free-text intro.",
    "",
    MANAGED_REGION_START,
    "- prefers direct feedback",
    "- prefers concise updates",
    MANAGED_REGION_END,
    "",
    "Some free-text outro.",
    "",
  ].join("\n");

  const parsed = parseManagedRegion(content);

  assert.equal(parsed.hasManagedRegion, true);
  assert.equal(parsed.beforeManaged, "# USER\n\nSome free-text intro.\n\n");
  assert.equal(parsed.managedBody, "- prefers direct feedback\n- prefers concise updates\n");
  assert.equal(parsed.afterManaged, "\nSome free-text outro.\n");
});

test("renderManagedRegion replaces only the managed region body", () => {
  const content = [
    "# USER",
    "",
    "Manual notes before.",
    "",
    MANAGED_REGION_START,
    "- old fact",
    MANAGED_REGION_END,
    "",
    "Manual notes after.",
    "",
  ].join("\n");

  const rendered = renderManagedRegion(content, "- new fact\n- another fact");

  assert.equal(
    rendered,
    [
      "# USER",
      "",
      "Manual notes before.",
      "",
      MANAGED_REGION_START,
      "- new fact",
      "- another fact",
      MANAGED_REGION_END,
      "",
      "Manual notes after.",
      "",
    ].join("\n")
  );
});

test("detectManagedRegionDrift reports drift when rendered content differs", () => {
  const content = [
    "# USER",
    "",
    MANAGED_REGION_START,
    "- existing fact",
    MANAGED_REGION_END,
    "",
  ].join("\n");

  const result = detectManagedRegionDrift(content, "- different fact\n");

  assert.equal(result.isDrifted, true);
  assert.match(result.expectedContent, /different fact/);
  assert.match(result.actualContent, /existing fact/);
});

test("detectManagedRegionDrift reports healthy when rendered content matches", () => {
  const content = [
    "# USER",
    "",
    MANAGED_REGION_START,
    "- stable fact",
    MANAGED_REGION_END,
    "",
  ].join("\n");

  const result = detectManagedRegionDrift(content, "- stable fact\n");

  assert.deepEqual(result, {
    isDrifted: false,
    actualContent: "- stable fact\n",
    expectedContent: "- stable fact\n",
  });
});

test("parseManagedRegion handles files without markers", () => {
  const content = "# USER\n\nPlain free text only.\n";
  const parsed = parseManagedRegion(content);

  assert.equal(parsed.hasManagedRegion, false);
  assert.equal(parsed.beforeManaged, content);
  assert.equal(parsed.managedBody, "");
  assert.equal(parsed.afterManaged, "");
});
