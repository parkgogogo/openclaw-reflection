import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function importFresh(modulePath) {
  const moduleUrl = pathToFileURL(path.join(process.cwd(), modulePath)).href;
  return import(`${moduleUrl}?t=${Date.now()}-${Math.random()}`);
}

function createPluginLogger(entries) {
  return {
    debug(message, details) {
      entries.push({ level: "debug", message, details });
    },
    info(message, details) {
      entries.push({ level: "info", message, details });
    },
    warn(message, details) {
      entries.push({ level: "warn", message, details });
    },
    error(message, details) {
      entries.push({ level: "error", message, details });
    },
  };
}

test("parseConfig returns defaults when plugin config is missing", async () => {
  const { parseConfig } = await importFresh("dist/config.js");

  const config = parseConfig({
    config: {
      get() {
        return undefined;
      },
    },
  });

  assert.deepEqual(config, {
    bufferSize: 50,
    logLevel: "info",
    llm: {
      baseURL: "https://api.openai.com/v1",
      apiKey: "",
      model: "gpt-4.1-mini",
    },
    memoryGate: {
      enabled: true,
      windowSize: 10,
    },
    consolidation: {
      enabled: true,
      schedule: "0 2 * * *",
    },
  });
});

test("parseConfig reads nested object values from api.config.get", async () => {
  const { parseConfig } = await importFresh("dist/config.js");

  const values = new Map([
    ["bufferSize", 128],
    ["logLevel", "debug"],
    ["llm", { baseURL: "https://example.test/v1", apiKey: "secret-key", model: "gpt-test" }],
    ["memoryGate", { enabled: false, windowSize: 7 }],
    ["consolidation", { enabled: false, schedule: "15 4 * * *" }],
  ]);

  const config = parseConfig({
    config: {
      get(key) {
        return values.get(key);
      },
    },
  });

  assert.deepEqual(config, {
    bufferSize: 128,
    logLevel: "debug",
    llm: {
      baseURL: "https://example.test/v1",
      apiKey: "secret-key",
      model: "gpt-test",
    },
    memoryGate: {
      enabled: false,
      windowSize: 7,
    },
    consolidation: {
      enabled: false,
      schedule: "15 4 * * *",
    },
  });
});

test("parseConfig prefers api.pluginConfig when OpenClaw provides parsed plugin config", async () => {
  const { parseConfig } = await importFresh("dist/config.js");

  const config = parseConfig({
    pluginConfig: {
      bufferSize: 31,
      logLevel: "error",
      llm: {
        baseURL: "https://plugin-config.example/v1",
        apiKey: "plugin-secret",
        model: "gpt-plugin-config",
      },
      memoryGate: {
        enabled: false,
        windowSize: 2,
      },
      consolidation: {
        enabled: false,
        schedule: "45 7 * * *",
      },
    },
    config: {
      get() {
        return undefined;
      },
    },
  });

  assert.deepEqual(config, {
    bufferSize: 31,
    logLevel: "error",
    llm: {
      baseURL: "https://plugin-config.example/v1",
      apiKey: "plugin-secret",
      model: "gpt-plugin-config",
    },
    memoryGate: {
      enabled: false,
      windowSize: 2,
    },
    consolidation: {
      enabled: false,
      schedule: "45 7 * * *",
    },
  });
});

test("parseConfig reads dotted-path values when nested objects are not returned", async () => {
  const { parseConfig, createConfigLogSnapshot } = await importFresh("dist/config.js");

  const values = new Map([
    ["bufferSize", 64],
    ["logLevel", "warn"],
    ["llm.baseURL", "https://dotted.test/v1"],
    ["llm.apiKey", "abc123"],
    ["llm.model", "gpt-dotted"],
    ["memoryGate.enabled", true],
    ["memoryGate.windowSize", 12],
    ["consolidation.enabled", true],
    ["consolidation.schedule", "0 6 * * *"],
  ]);

  const config = parseConfig({
    config: {
      get(key) {
        return values.get(key);
      },
    },
  });

  assert.deepEqual(config, {
    bufferSize: 64,
    logLevel: "warn",
    llm: {
      baseURL: "https://dotted.test/v1",
      apiKey: "abc123",
      model: "gpt-dotted",
    },
    memoryGate: {
      enabled: true,
      windowSize: 12,
    },
    consolidation: {
      enabled: true,
      schedule: "0 6 * * *",
    },
  });

  assert.deepEqual(createConfigLogSnapshot(config), {
    bufferSize: 64,
    logLevel: "warn",
    llm: {
      baseURL: "https://dotted.test/v1",
      apiKeyConfigured: true,
      model: "gpt-dotted",
    },
    memoryGate: {
      enabled: true,
      windowSize: 12,
    },
    consolidation: {
      enabled: true,
      schedule: "0 6 * * *",
    },
  });
});

test("activate logs a sanitized config snapshot and skips registration in config-only mode", async () => {
  process.env.OPENCLAW_REFLECTION_CONFIG_ONLY = "1";

  try {
    const entries = [];
    const registered = [];
    const mod = await importFresh("dist/index.js");
    const activate = mod.default;

    const api = {
      logger: createPluginLogger(entries),
      pluginConfig: {
        bufferSize: 21,
        logLevel: "debug",
        llm: {
          baseURL: "https://runtime.test/v1",
          apiKey: "runtime-secret",
          model: "gpt-runtime",
        },
        memoryGate: {
          enabled: false,
          windowSize: 4,
        },
        consolidation: {
          enabled: false,
          schedule: "5 1 * * *",
        },
      },
      registerHook(event, handler) {
        registered.push({ event, handler });
      },
    };

    activate(api);

    assert.equal(registered.length, 0);

    const configurationLog = entries.find(
      (entry) => entry.level === "info" && entry.message === "[Reflection] Configuration loaded"
    );
    assert.ok(configurationLog);
    assert.deepEqual(configurationLog.details, {
      bufferSize: 21,
      logLevel: "debug",
      llm: {
        baseURL: "https://runtime.test/v1",
        apiKeyConfigured: true,
        model: "gpt-runtime",
      },
      memoryGate: {
        enabled: false,
        windowSize: 4,
      },
      consolidation: {
        enabled: false,
        schedule: "5 1 * * *",
      },
    });

    const configOnlyLog = entries.find(
      (entry) =>
        entry.level === "info" &&
        entry.message === "[Reflection] Config-only mode enabled, skipping hooks and side effects"
    );
    assert.ok(configOnlyLog);
  } finally {
    delete process.env.OPENCLAW_REFLECTION_CONFIG_ONLY;
  }
});
