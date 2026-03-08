#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE_NAME="${OPENCLAW_TEST_PROFILE:-reflection-package-test}"
GATEWAY_PORT="${OPENCLAW_TEST_GATEWAY_PORT:-18891}"
MODEL_ID="grok-4.1-fast"

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo "Missing $ROOT_DIR/.env" >&2
  exit 1
fi

set -a
source "$ROOT_DIR/.env"
set +a

: "${EVAL_BASE_URL:?EVAL_BASE_URL is required in .env}"
: "${EVAL_API_KEY:?EVAL_API_KEY is required in .env}"

NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
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

NODE_PREFIX="$(cd "$(dirname "$NODE_BIN")/.." && pwd)"
OPENCLAW_MJS="$NODE_PREFIX/lib/node_modules/openclaw/openclaw.mjs"
if [[ ! -f "$OPENCLAW_MJS" ]]; then
  echo "OpenClaw CLI not found for Node 22 at $OPENCLAW_MJS" >&2
  exit 1
fi

run_openclaw() {
  "$NODE_BIN" "$OPENCLAW_MJS" --profile "$PROFILE_NAME" "$@"
}

PROFILE_CONFIG="$HOME/.openclaw-$PROFILE_NAME/openclaw.json"
PROFILE_DIR="$HOME/.openclaw-$PROFILE_NAME"
EXTENSIONS_DIR="$PROFILE_DIR/extensions"
if [[ ! -f "$PROFILE_CONFIG" ]]; then
  echo "Profile $PROFILE_NAME does not exist at $PROFILE_CONFIG" >&2
  echo "Create it once first, then rerun this script." >&2
  exit 1
fi

TMP_CONFIG_JSON="$(mktemp)"
GATEWAY_LOG="$(mktemp)"
HEALTH_JSON="$(mktemp)"
TARBALL_PATH=""
GATEWAY_PID=""

cleanup() {
  if [[ -n "$GATEWAY_PID" ]] && kill -0 "$GATEWAY_PID" 2>/dev/null; then
    pkill -TERM -P "$GATEWAY_PID" 2>/dev/null || true
    kill "$GATEWAY_PID" 2>/dev/null || true
  fi
  rm -f "$TMP_CONFIG_JSON" "$GATEWAY_LOG" "$HEALTH_JSON"
  if [[ -n "$TARBALL_PATH" && -f "$TARBALL_PATH" ]]; then
    rm -f "$TARBALL_PATH"
  fi
}
trap 'rc=$?; trap - EXIT; cleanup; exit "$rc"' EXIT

cat > "$TMP_CONFIG_JSON" <<EOF
{
  "workspaceDir": "$HOME/.openclaw-$PROFILE_NAME/workspace",
  "bufferSize": 50,
  "logLevel": "info",
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
    "enabled": true,
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
run_openclaw config validate --json

if lsof -nP -iTCP:"$GATEWAY_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Gateway port $GATEWAY_PORT is already in use" >&2
  exit 1
fi

PLUGIN_LOG="$EXTENSIONS_DIR/openclaw-reflection/logs/reflection-$(date +%F).log"
SUCCESS_MARKER="Plugin registered successfully, all hooks active"

echo "[e2e] starting gateway on port $GATEWAY_PORT"
(exec "$NODE_BIN" "$OPENCLAW_MJS" --profile "$PROFILE_NAME" gateway run --verbose >"$GATEWAY_LOG" 2>&1) &
GATEWAY_PID=$!

for _ in 1 2 3 4 5 6 7 8 9 10; do
  if [[ -n "$GATEWAY_PID" ]] && ! kill -0 "$GATEWAY_PID" 2>/dev/null; then
    echo "[e2e] gateway exited before becoming healthy" >&2
    echo "--- plugin log ---" >&2
    if [[ -f "$PLUGIN_LOG" ]]; then
      tail -n 50 "$PLUGIN_LOG" >&2
    fi
    echo "--- gateway log ---" >&2
    cat "$GATEWAY_LOG" >&2
    exit 1
  fi

  if curl --silent --show-error --fail --max-time 2 "http://127.0.0.1:$GATEWAY_PORT/health" >"$HEALTH_JSON" 2>/dev/null; then
    break
  fi

  sleep 1
done

if ! rg -q '"ok":[[:space:]]*true' "$HEALTH_JSON"; then
  echo "[e2e] gateway health probe did not succeed" >&2
  echo "--- gateway log ---" >&2
  cat "$GATEWAY_LOG" >&2
  exit 1
fi

if ! [[ -f "$PLUGIN_LOG" ]] || ! rg -q "$SUCCESS_MARKER" "$PLUGIN_LOG"; then
  echo "[e2e] plugin did not report successful registration" >&2
  echo "--- plugin log ---" >&2
  if [[ -f "$PLUGIN_LOG" ]]; then
    tail -n 50 "$PLUGIN_LOG" >&2
  else
    echo "plugin log not found: $PLUGIN_LOG" >&2
  fi
  echo "--- gateway log ---" >&2
  cat "$GATEWAY_LOG" >&2
  exit 1
fi

echo "[e2e] gateway health ok"
cat "$HEALTH_JSON"
echo "[e2e] success"
