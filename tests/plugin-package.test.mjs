import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), relativePath), "utf8"));
}

test("plugin manifest id matches the unscoped package name", () => {
  const pkg = readJson("package.json");
  const manifest = readJson("openclaw.plugin.json");
  const expectedId = pkg.name.split("/").at(-1);

  assert.equal(manifest.id, expectedId);
});

test("package.json exposes the OpenClaw plugin e2e regression script", () => {
  const pkg = readJson("package.json");

  assert.equal(
    pkg.scripts["e2e:openclaw-plugin"],
    "bash scripts/e2e-openclaw-plugin.sh"
  );
});

test("OpenClaw plugin e2e regression script reuses the package test profile", () => {
  const scriptPath = path.join(process.cwd(), "scripts/e2e-openclaw-plugin.sh");

  assert.equal(fs.existsSync(scriptPath), true, "expected e2e script to exist");

  const content = fs.readFileSync(scriptPath, "utf8");
  assert.match(content, /reflection-package-test/);
  assert.match(content, /grok-4\.1-fast/);
  assert.match(content, /EXTENSIONS_DIR="\$PROFILE_DIR\/extensions"/);
  assert.match(content, /rm -rf "\$EXTENSIONS_DIR\/reflection-plugin" "\$EXTENSIONS_DIR\/openclaw-reflection"/);
  assert.match(content, /config\.plugins\.allow = \["openclaw-reflection"\]/);
  assert.match(content, /delete config\.plugins\.entries\["reflection-plugin"\]/);
  assert.match(content, /run_openclaw plugins install "\$TARBALL_PATH"/);
  assert.match(content, /curl --silent --show-error --fail --max-time 2 "http:\/\/127\.0\.0\.1:\$GATEWAY_PORT\/health"/);
  assert.match(content, /SUCCESS_MARKER="Plugin registered successfully, all hooks active"/);
  assert.match(content, /config\.plugins\.entries\["openclaw-reflection"\] = \{/);
});
