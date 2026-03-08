import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";

import { loadEvalModelProfiles } from "../dist/evals/models.js";

async function withTempConfig(config, run) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "eval-models-test-"));
  const configPath = path.join(tempDir, "models.json");

  try {
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
    await run(configPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("loadEvalModelProfiles loads enabled profiles and resolves shared EVAL provider config", async () => {
  await withTempConfig(
    {
      profiles: [
        {
          id: "grok-fast",
          label: "Grok Fast",
          model: "x-ai/grok-4.1-fast",
          enabled: true,
          tags: ["baseline"],
        },
        {
          id: "disabled-model",
          label: "Disabled",
          model: "disabled/model",
          enabled: false,
        },
      ],
    },
    async (configPath) => {
      const profiles = await loadEvalModelProfiles({
        configPath,
        env: {
          EVAL_BASE_URL: "https://openrouter.ai/api/v1",
          EVAL_API_KEY: "openrouter-secret",
        },
      });

      assert.equal(profiles.length, 1);
      assert.equal(profiles[0].id, "grok-fast");
      assert.equal(profiles[0].baseURL, "https://openrouter.ai/api/v1");
      assert.equal(profiles[0].apiKey, "openrouter-secret");
      assert.deepEqual(profiles[0].tags, ["baseline"]);
    }
  );
});

test("loadEvalModelProfiles filters to explicitly requested model ids", async () => {
  await withTempConfig(
    {
      profiles: [
        {
          id: "grok-fast",
          label: "Grok Fast",
          model: "x-ai/grok-4.1-fast",
          enabled: true,
        },
        {
          id: "gpt-5",
          label: "GPT-5",
          model: "openai/gpt-5",
          enabled: true,
        },
      ],
    },
    async (configPath) => {
      const profiles = await loadEvalModelProfiles({
        configPath,
        selectedModelIds: ["gpt-5"],
        env: {
          EVAL_BASE_URL: "https://openrouter.ai/api/v1",
          EVAL_API_KEY: "openrouter-secret",
        },
      });

      assert.equal(profiles.length, 1);
      assert.equal(profiles[0].id, "gpt-5");
      assert.equal(profiles[0].baseURL, "https://openrouter.ai/api/v1");
      assert.equal(profiles[0].apiKey, "openrouter-secret");
    }
  );
});

test("loadEvalModelProfiles rejects unknown selected model ids", async () => {
  await withTempConfig(
    {
      profiles: [
        {
          id: "grok-fast",
          label: "Grok Fast",
          baseURL: "https://api.x.ai/v1",
          apiKeyEnv: "XAI_API_KEY",
          model: "x-ai/grok-4.1-fast",
          enabled: true,
        },
      ],
    },
    async (configPath) => {
      await assert.rejects(
        () =>
          loadEvalModelProfiles({
            configPath,
            selectedModelIds: ["missing-model"],
            env: {
              EVAL_BASE_URL: "https://openrouter.ai/api/v1",
              EVAL_API_KEY: "openrouter-secret",
            },
          }),
        /Unknown model ids: missing-model/
      );
    }
  );
});

test("loadEvalModelProfiles rejects missing shared EVAL_API_KEY", async () => {
  await withTempConfig(
    {
      profiles: [
        {
          id: "grok-fast",
          label: "Grok Fast",
          model: "x-ai/grok-4.1-fast",
          enabled: true,
        },
      ],
    },
    async (configPath) => {
      await assert.rejects(
        () =>
          loadEvalModelProfiles({
            configPath,
            env: {
              EVAL_BASE_URL: "https://openrouter.ai/api/v1",
            },
          }),
        /Missing required env vars for model comparison: EVAL_BASE_URL, EVAL_API_KEY/
      );
    }
  );
});

test("loadEvalModelProfiles rejects missing shared EVAL_BASE_URL", async () => {
  await withTempConfig(
    {
      profiles: [
        {
          id: "grok-fast",
          label: "Grok Fast",
          model: "x-ai/grok-4.1-fast",
          enabled: true,
        },
      ],
    },
    async (configPath) => {
      await assert.rejects(
        () =>
          loadEvalModelProfiles({
            configPath,
            env: {
              EVAL_API_KEY: "openrouter-secret",
            },
          }),
        /Missing required env vars for model comparison: EVAL_BASE_URL, EVAL_API_KEY/
      );
    }
  );
});
