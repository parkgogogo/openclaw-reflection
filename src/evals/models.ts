import { readFile } from "node:fs/promises";

export interface EvalModelProfile {
  id: string;
  label: string;
  model: string;
  enabled: boolean;
  tags?: string[];
}

export interface ResolvedEvalModelProfile extends EvalModelProfile {
  baseURL: string;
  apiKey: string;
}

interface LoadEvalModelProfilesInput {
  configPath: string;
  selectedModelIds?: string[];
  env?: NodeJS.ProcessEnv;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEvalModelProfile(value: unknown): EvalModelProfile {
  if (!isRecord(value)) {
    throw new Error("Eval model profile must be an object");
  }

  const {
    id,
    label,
    model,
    enabled,
    tags,
  } = value;

  if (typeof id !== "string" || id.trim() === "") {
    throw new Error("Eval model profile id must be a non-empty string");
  }

  if (typeof label !== "string" || label.trim() === "") {
    throw new Error(`Eval model profile ${id} label must be a non-empty string`);
  }

  if (typeof model !== "string" || model.trim() === "") {
    throw new Error(`Eval model profile ${id} model must be a non-empty string`);
  }

  if (typeof enabled !== "boolean") {
    throw new Error(`Eval model profile ${id} enabled must be a boolean`);
  }

  if (
    tags !== undefined &&
    (!Array.isArray(tags) || tags.some((tag) => typeof tag !== "string"))
  ) {
    throw new Error(`Eval model profile ${id} tags must be a string array`);
  }

  return {
    id,
    label,
    model,
    enabled,
    tags,
  };
}

function parseEvalModelConfig(content: string): EvalModelProfile[] {
  const parsed: unknown = JSON.parse(content);

  if (!isRecord(parsed) || !Array.isArray(parsed.profiles)) {
    throw new Error("Eval model config must contain a profiles array");
  }

  return parsed.profiles.map((profile) => parseEvalModelProfile(profile));
}

export async function loadEvalModelProfiles(
  input: LoadEvalModelProfilesInput
): Promise<ResolvedEvalModelProfile[]> {
  const env = input.env ?? process.env;
  const baseURL = env.EVAL_BASE_URL;
  const apiKey = env.EVAL_API_KEY;
  if (
    typeof baseURL !== "string" ||
    baseURL.trim() === "" ||
    typeof apiKey !== "string" ||
    apiKey.trim() === ""
  ) {
    throw new Error(
      "Missing required env vars for model comparison: EVAL_BASE_URL, EVAL_API_KEY"
    );
  }

  const profiles = parseEvalModelConfig(await readFile(input.configPath, "utf8"));
  const enabledProfiles = profiles.filter((profile) => profile.enabled);

  if (enabledProfiles.length === 0) {
    throw new Error("Eval model config has no enabled profiles");
  }

  const selectedModelIds =
    input.selectedModelIds?.filter((modelId) => modelId.trim() !== "") ?? [];

  const filteredProfiles =
    selectedModelIds.length === 0
      ? enabledProfiles
      : selectedModelIds.map((modelId) => {
          const profile = enabledProfiles.find((candidate) => candidate.id === modelId);
          if (!profile) {
            throw new Error(`Unknown model ids: ${modelId}`);
          }

          return profile;
        });

  return filteredProfiles.map((profile) => ({
    ...profile,
    baseURL,
    apiKey,
  }));
}
