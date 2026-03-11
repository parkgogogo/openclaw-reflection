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
  assert.equal(
    pkg.scripts["e2e:openclaw-plugin:latest"],
    "OPENCLAW_E2E_TRACK=latest bash scripts/e2e-openclaw-plugin.sh"
  );
});

test("OpenClaw plugin e2e regression script uses an ephemeral sandbox and supports dual tracks", () => {
  const scriptPath = path.join(process.cwd(), "scripts/e2e-openclaw-plugin.sh");

  assert.equal(fs.existsSync(scriptPath), true, "expected e2e script to exist");

  const content = fs.readFileSync(scriptPath, "utf8");
  assert.match(content, /OPENCLAW_E2E_TRACK="\$\{OPENCLAW_E2E_TRACK:-pinned\}"/);
  assert.match(content, /TMP_ROOT="\$\(mktemp -d/);
  assert.match(content, /export HOME="\$TMP_ROOT\/home"/);
  assert.match(content, /export XDG_CONFIG_HOME="\$TMP_ROOT\/xdg-config"/);
  assert.match(content, /export XDG_CACHE_HOME="\$TMP_ROOT\/xdg-cache"/);
  assert.match(content, /export XDG_DATA_HOME="\$TMP_ROOT\/xdg-data"/);
  assert.match(content, /export npm_config_cache="\$TMP_ROOT\/npm-cache"/);
  assert.match(content, /KEEP_E2E_ARTIFACTS="\$\{KEEP_E2E_ARTIFACTS:-0\}"/);
  assert.match(content, /if \[\[ "\$KEEP_E2E_ARTIFACTS" == "1" \]\]/);
  assert.match(content, /reflection-package-test/);
  assert.match(content, /grok-4\.1-fast/);
  assert.match(content, /EXTENSIONS_DIR="\$PROFILE_DIR\/extensions"/);
  assert.match(content, /ARTIFACTS_DIR="\$TMP_ROOT\/artifacts"/);
  assert.match(content, /workspaceDir": "\$TMP_ROOT\/workspace"/);
  assert.match(content, /"logLevel": "debug"/);
  assert.match(content, /rm -rf "\$EXTENSIONS_DIR\/reflection-plugin" "\$EXTENSIONS_DIR\/openclaw-reflection"/);
  assert.match(content, /config\.plugins\.allow = \["openclaw-reflection"\]/);
  assert.match(content, /delete config\.plugins\.entries\["reflection-plugin"\]/);
  assert.match(content, /run_openclaw plugins install "\$TARBALL_PATH"/);
  assert.match(content, /curl --silent --show-error --fail --max-time 2 "http:\/\/127\.0\.0\.1:\$GATEWAY_PORT\/health"/);
  assert.match(content, /SUCCESS_MARKER="Plugin registered successfully, all hooks active"/);
  assert.match(content, /config\.plugins\.entries\["openclaw-reflection"\] = \{/);
  assert.match(content, /find "\$EXTENSIONS_DIR\/openclaw-reflection\/logs" -maxdepth 1 -name 'reflection-\*\.log'/);
  assert.match(content, /OPENCLAW_BUN_APP_DIR="\$TMP_ROOT\/openclaw-cli-app"/);
  assert.match(content, /BUN_BIN="\$\(command -v bun \|\| true\)"/);
  assert.match(content, /if \[\[ -n "\$BUN_BIN" \]\]; then/);
  assert.match(content, /bun init -y >/);
  assert.match(content, /"\$BUN_BIN" add --silent openclaw@latest/);
  assert.match(content, /echo "\[e2e\] bun install failed, falling back to npm"/);
  assert.match(content, /"\$NPM_BIN" install --silent --prefix "\$OPENCLAW_NPM_PREFIX" openclaw@latest/);
  assert.match(content, /OPENCLAW_MJS="\$OPENCLAW_NPM_PREFIX\/node_modules\/openclaw\/openclaw\.mjs"/);
  assert.match(content, /REFLECTION_FILES_JSON="\$ARTIFACTS_DIR\/reflection-files\.json"/);
  assert.match(content, /run_openclaw gateway call reflection\.files/);
  assert.match(content, /'USER\\\.md'/);
});
