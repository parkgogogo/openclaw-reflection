#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST_HOME="${HOME}"
PROFILE_NAME="${OPENCLAW_TEST_PROFILE:-reflection-package-test}"
GATEWAY_PORT="${OPENCLAW_TEST_GATEWAY_PORT:-18891}"
MODEL_ID="grok-4.1-fast"
OPENCLAW_E2E_TRACK="${OPENCLAW_E2E_TRACK:-pinned}"
KEEP_E2E_ARTIFACTS="${KEEP_E2E_ARTIFACTS:-0}"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/openclaw-reflection-e2e.XXXXXX")"
ARTIFACTS_DIR="$TMP_ROOT/artifacts"
WORKSPACE_DIR="$TMP_ROOT/workspace"
OPENCLAW_BUN_APP_DIR="$TMP_ROOT/openclaw-cli-app"
OPENCLAW_NPM_PREFIX="$OPENCLAW_BUN_APP_DIR"

export HOME="$TMP_ROOT/home"
export XDG_CONFIG_HOME="$TMP_ROOT/xdg-config"
export XDG_CACHE_HOME="$TMP_ROOT/xdg-cache"
export XDG_DATA_HOME="$TMP_ROOT/xdg-data"
export npm_config_cache="$TMP_ROOT/npm-cache"

mkdir -p \
  "$HOME" \
  "$XDG_CONFIG_HOME" \
  "$XDG_CACHE_HOME" \
  "$XDG_DATA_HOME" \
  "$npm_config_cache" \
  "$ARTIFACTS_DIR" \
  "$WORKSPACE_DIR"

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo "Missing $ROOT_DIR/.env" >&2
  exit 1
fi

set -a
source "$ROOT_DIR/.env"
set +a

: "${EVAL_BASE_URL:?EVAL_BASE_URL is required in .env}"
: "${EVAL_API_KEY:?EVAL_API_KEY is required in .env}"

NVM_DIR="${NVM_DIR:-$HOST_HOME/.nvm}"
if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  echo "nvm is required at $NVM_DIR/nvm.sh" >&2
  exit 1
fi

# shellcheck source=/dev/null
source "$NVM_DIR/nvm.sh"
NODE_BIN="$(nvm which 22)"
if [[ ! -x "$NODE_BIN" ]]; then
  echo "Node 22 is required. Run: nvm install 22" >&2
  exit 1
fi

NPM_BIN="$(cd "$(dirname "$NODE_BIN")" && pwd)/npm"
if [[ ! -x "$NPM_BIN" ]]; then
  echo "npm is required next to Node 22 at $NPM_BIN" >&2
  exit 1
fi

BUN_BIN="$(command -v bun || true)"

NODE_PREFIX="$(cd "$(dirname "$NODE_BIN")/.." && pwd)"
OPENCLAW_MJS="$NODE_PREFIX/lib/node_modules/openclaw/openclaw.mjs"
if [[ "$OPENCLAW_E2E_TRACK" == "latest" ]]; then
  if [[ -n "$BUN_BIN" ]]; then
    echo "[e2e] installing latest OpenClaw into sandbox with bun"
    rm -rf "$OPENCLAW_BUN_APP_DIR"
    mkdir -p "$OPENCLAW_BUN_APP_DIR"
    if ! (
      cd "$OPENCLAW_BUN_APP_DIR" &&
      bun init -y >/dev/null 2>&1 &&
      "$BUN_BIN" add --silent openclaw@latest >/dev/null
    ); then
      echo "[e2e] bun install failed, falling back to npm"
      rm -rf "$OPENCLAW_BUN_APP_DIR"
    fi
  fi

  if [[ ! -d "$OPENCLAW_NPM_PREFIX/node_modules/openclaw" ]]; then
    mkdir -p "$OPENCLAW_NPM_PREFIX"
    echo "[e2e] installing latest OpenClaw into sandbox with npm"
    "$NPM_BIN" install --silent --prefix "$OPENCLAW_NPM_PREFIX" openclaw@latest
  fi

  OPENCLAW_MJS="$OPENCLAW_NPM_PREFIX/node_modules/openclaw/openclaw.mjs"
fi

if [[ ! -f "$OPENCLAW_MJS" ]]; then
  echo "OpenClaw CLI not found at $OPENCLAW_MJS" >&2
  exit 1
fi

PROFILE_DIR="$HOME/.openclaw-$PROFILE_NAME"
PROFILE_CONFIG="$PROFILE_DIR/openclaw.json"
EXTENSIONS_DIR="$PROFILE_DIR/extensions"
TMP_CONFIG_JSON="$ARTIFACTS_DIR/plugin-config.json"
GATEWAY_LOG="$ARTIFACTS_DIR/gateway.log"
HEALTH_JSON="$ARTIFACTS_DIR/health.json"
AGENT_JSON="$ARTIFACTS_DIR/agent-result.json"
AGENT_ERR="$ARTIFACTS_DIR/agent-result.stderr.log"
REFLECTION_FILES_JSON="$ARTIFACTS_DIR/reflection-files.json"
PLUGIN_LOG=""
DEBUG_LOG=""
TARBALL_PATH=""
GATEWAY_PID=""

run_openclaw() {
  "$NODE_BIN" "$OPENCLAW_MJS" --profile "$PROFILE_NAME" "$@"
}

print_artifact_location() {
  echo "[e2e] artifacts: $TMP_ROOT"
}

cleanup() {
  local rc="${1:-0}"

  if [[ -n "$GATEWAY_PID" ]] && kill -0 "$GATEWAY_PID" 2>/dev/null; then
    pkill -TERM -P "$GATEWAY_PID" 2>/dev/null || true
    kill "$GATEWAY_PID" 2>/dev/null || true
  fi

  if [[ -n "$TARBALL_PATH" && -f "$TARBALL_PATH" ]]; then
    rm -f "$TARBALL_PATH"
  fi

  if [[ "$KEEP_E2E_ARTIFACTS" == "1" ]]; then
    print_artifact_location
    return
  fi

  if [[ "$rc" != "0" ]]; then
    print_artifact_location
    return
  fi

  rm -rf "$TMP_ROOT"
}
trap 'rc=$?; trap - EXIT; cleanup "$rc"; exit "$rc"' EXIT

fail() {
  local message="$1"
  echo "[e2e] $message" >&2
  if [[ -f "$PLUGIN_LOG" ]]; then
    echo "--- plugin log ---" >&2
    tail -n 100 "$PLUGIN_LOG" >&2 || true
  fi
  if [[ -f "$DEBUG_LOG" ]]; then
    echo "--- debug payload ---" >&2
    cat "$DEBUG_LOG" >&2 || true
  fi
  if [[ -f "$GATEWAY_LOG" ]]; then
    echo "--- gateway log ---" >&2
    cat "$GATEWAY_LOG" >&2 || true
  fi
  if [[ -f "$AGENT_ERR" ]]; then
    echo "--- agent stderr ---" >&2
    cat "$AGENT_ERR" >&2 || true
  fi
  exit 1
}

echo "[e2e] bootstrapping isolated profile in $TMP_ROOT"
ONBOARD_ARGS=(
  --non-interactive
  --accept-risk
  --mode local
  --flow quickstart
  --workspace "$WORKSPACE_DIR"
  --gateway-bind loopback
  --gateway-port "$GATEWAY_PORT"
  --skip-channels
  --skip-skills
  --skip-ui
  --skip-health
  --skip-daemon
)

if [[ "$EVAL_BASE_URL" == *"openrouter.ai"* ]]; then
  ONBOARD_ARGS+=(
    --auth-choice openrouter-api-key
    --openrouter-api-key "$EVAL_API_KEY"
  )
else
  ONBOARD_ARGS+=(
    --auth-choice custom-api-key
    --custom-api-key "$EVAL_API_KEY"
    --custom-base-url "$EVAL_BASE_URL"
    --custom-model-id "$MODEL_ID"
  )
fi

run_openclaw onboard "${ONBOARD_ARGS[@]}" >/dev/null

if [[ ! -f "$PROFILE_CONFIG" ]]; then
  fail "OpenClaw onboarding did not create profile config at $PROFILE_CONFIG"
fi

cat > "$TMP_CONFIG_JSON" <<EOF
{
  "workspaceDir": "$TMP_ROOT/workspace",
  "bufferSize": 50,
  "logLevel": "debug",
  "llm": {
    "baseURL": "$EVAL_BASE_URL",
    "apiKey": "$EVAL_API_KEY",
    "model": "$MODEL_ID"
  },
  "memoryGate": {
    "enabled": true,
    "windowSize": 10
  },
  "consolidation": {
    "enabled": false,
    "schedule": "0 2 * * *"
  }
}
EOF

echo "[e2e] packing plugin tarball"
TARBALL_NAME="$(cd "$ROOT_DIR" && npm pack | tail -n 1)"
TARBALL_PATH="$ROOT_DIR/$TARBALL_NAME"

echo "[e2e] removing legacy plugin id if present"
rm -rf "$EXTENSIONS_DIR/reflection-plugin" "$EXTENSIONS_DIR/openclaw-reflection"
"$NODE_BIN" - "$PROFILE_CONFIG" "$GATEWAY_PORT" <<'EOF'
const fs = require("node:fs");

const [configPath, gatewayPort] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

config.gateway = config.gateway ?? {};
config.gateway.port = Number(gatewayPort);
config.gateway.bind = "loopback";

config.plugins = config.plugins ?? {};
if (Array.isArray(config.plugins.allow)) {
  config.plugins.allow = config.plugins.allow.filter(
    (id) => id !== "reflection-plugin" && id !== "openclaw-reflection"
  );
}
config.plugins.entries = config.plugins.entries ?? {};
config.plugins.installs = config.plugins.installs ?? {};

delete config.plugins.entries["reflection-plugin"];
delete config.plugins.entries["openclaw-reflection"];
delete config.plugins.installs["reflection-plugin"];
delete config.plugins.installs["openclaw-reflection"];

fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
EOF

echo "[e2e] installing tarball into profile $PROFILE_NAME"
run_openclaw plugins install "$TARBALL_PATH"

echo "[e2e] writing plugin config"
"$NODE_BIN" - "$PROFILE_CONFIG" "$TMP_CONFIG_JSON" <<'EOF'
const fs = require("node:fs");

const [configPath, pluginConfigPath] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const pluginConfig = JSON.parse(fs.readFileSync(pluginConfigPath, "utf8"));

config.plugins = config.plugins ?? {};
config.plugins.allow = ["openclaw-reflection"];
config.plugins.entries = config.plugins.entries ?? {};
config.plugins.entries["openclaw-reflection"] = {
  ...(config.plugins.entries["openclaw-reflection"] ?? {}),
  enabled: true,
  config: pluginConfig,
};

fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
EOF

run_openclaw config validate --json >"$ARTIFACTS_DIR/config-validate.json"

if lsof -nP -iTCP:"$GATEWAY_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  fail "Gateway port $GATEWAY_PORT is already in use"
fi

PLUGIN_LOG="$(find "$EXTENSIONS_DIR/openclaw-reflection/logs" -maxdepth 1 -name 'reflection-*.log' -type f 2>/dev/null | sort | tail -n 1)"
DEBUG_LOG="$EXTENSIONS_DIR/openclaw-reflection/logs/debug.json"
SUCCESS_MARKER="Plugin registered successfully, all hooks active"

echo "[e2e] starting gateway on port $GATEWAY_PORT"
(env OPENCLAW_REFLECTION_DEBUG_EVENTS=1 "$NODE_BIN" "$OPENCLAW_MJS" --profile "$PROFILE_NAME" gateway run --verbose >"$GATEWAY_LOG" 2>&1) &
GATEWAY_PID=$!

for _ in 1 2 3 4 5 6 7 8 9 10; do
  if [[ -n "$GATEWAY_PID" ]] && ! kill -0 "$GATEWAY_PID" 2>/dev/null; then
    fail "gateway exited before becoming healthy"
  fi

  if curl --silent --show-error --fail --max-time 2 "http://127.0.0.1:$GATEWAY_PORT/health" >"$HEALTH_JSON" 2>/dev/null; then
    break
  fi

  sleep 1
done

if [[ -z "$PLUGIN_LOG" ]]; then
  PLUGIN_LOG="$(find "$EXTENSIONS_DIR/openclaw-reflection/logs" -maxdepth 1 -name 'reflection-*.log' -type f 2>/dev/null | sort | tail -n 1)"
fi

if ! rg -q '"ok":[[:space:]]*true' "$HEALTH_JSON"; then
  fail "gateway health probe did not succeed"
fi

if ! [[ -f "$PLUGIN_LOG" ]] || ! rg -q "$SUCCESS_MARKER" "$PLUGIN_LOG"; then
  fail "plugin did not report successful registration"
fi

TURN_ID="e2e-$(date +%s)-$$"
CHAT_SEND_PARAMS="$(printf '{"sessionKey":"main","message":"Remember this test turn: your name is Lia and call me Park.","idempotencyKey":"%s","timeoutMs":120000}' "$TURN_ID")"

echo "[e2e] running controlled gateway turn to verify hook capture"
if ! run_openclaw gateway call chat.send \
  --json \
  --params "$CHAT_SEND_PARAMS" \
  >"$AGENT_JSON" 2>"$AGENT_ERR"; then
  fail "chat.send turn failed"
fi

sleep 2

if ! [[ -f "$DEBUG_LOG" ]]; then
  fail "message_received debug payload was not written"
fi

if ! rg -q '"hookName":[[:space:]]*"message_received"' "$DEBUG_LOG"; then
  fail "debug payload does not show message_received hook capture"
fi

if ! rg -q 'message:received|message_received' "$PLUGIN_LOG"; then
  fail "plugin log does not show inbound message capture evidence"
fi

if ! rg -q 'before_message_write' "$PLUGIN_LOG"; then
  fail "plugin log does not show assistant-side hook evidence"
fi

echo "[e2e] calling reflection.files gateway method"
if ! run_openclaw gateway call reflection.files \
  --json \
  --params '{}' \
  >"$REFLECTION_FILES_JSON" 2>>"$AGENT_ERR"; then
  fail "reflection.files gateway method call failed"
fi

if ! rg -q 'USER\.md' "$REFLECTION_FILES_JSON"; then
  fail "reflection.files gateway response did not include managed file names"
fi

echo "[e2e] gateway health ok"
cat "$HEALTH_JSON"
echo "[e2e] success"
