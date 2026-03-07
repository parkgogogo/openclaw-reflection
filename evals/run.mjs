import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parseEvalCliOptions } from "../dist/evals/cli.js";
import { resolveEvalDatasetPaths } from "../dist/evals/datasets.js";
import { LLMService } from "../dist/llm/service.js";
import { FileLogger } from "../dist/logger.js";
import {
  createJudge,
  evaluateMemoryGateBenchmark,
  evaluateWriterGuardianBenchmark,
  runMemoryGateCase,
  runWriterGuardianCase,
} from "../dist/evals/runner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function readJsonl(filePath) {
  const content = fs.readFileSync(filePath, "utf8").trim();
  if (!content) {
    return [];
  }

  return content.split("\n").map((line) => JSON.parse(line));
}

function createServiceFromEnv(prefix) {
  const baseURL = process.env[`${prefix}_BASE_URL`];
  const apiKey = process.env[`${prefix}_API_KEY`];
  const model = process.env[`${prefix}_MODEL`];

  if (!baseURL || !apiKey || !model) {
    throw new Error(`Missing required env vars for ${prefix}: ${prefix}_BASE_URL, ${prefix}_API_KEY, ${prefix}_MODEL`);
  }

  return new LLMService({
    baseURL,
    apiKey,
    model,
  });
}

function printSummary(name, report) {
  console.log(`\n[${name}] ${report.summary.passed}/${report.summary.total} passed`);

  const failures = report.results.filter((result) => !result.pass);
  if (failures.length === 0) {
    return;
  }

  console.log(`[${name}] failures:`);
  for (const failure of failures) {
    console.log(JSON.stringify(failure, null, 2));
  }
}

async function main() {
  loadEnvFile(path.join(rootDir, ".env"));

  const {
    suite,
    useJudge,
    datasetRoot,
    sharedDatasetPath,
    memoryGateDatasetPath,
    writerGuardianDatasetPath,
  } = parseEvalCliOptions(process.argv);
  const logger = new FileLogger(rootDir, "debug");
  const datasetPaths = resolveEvalDatasetPaths({
    rootDir,
    datasetRoot,
    sharedDatasetPath,
    memoryGateDatasetPath,
    writerGuardianDatasetPath,
  });
  const scenarios = readJsonl(datasetPaths.sharedDatasetPath);
  const memoryCases =
    suite === "all" || suite === "memory-gate"
      ? readJsonl(datasetPaths.memoryGateDatasetPath)
      : [];
  const writerCases =
    suite === "all" || suite === "writer-guardian"
      ? readJsonl(datasetPaths.writerGuardianDatasetPath)
      : [];

  const evalService = createServiceFromEnv("EVAL");
  let judgeService = evalService;

  if (
    useJudge &&
    process.env.JUDGE_BASE_URL &&
    process.env.JUDGE_API_KEY &&
    process.env.JUDGE_MODEL
  ) {
    judgeService = createServiceFromEnv("JUDGE");
  }

  let failed = false;

  if (suite === "all" || suite === "memory-gate") {
    const report = await evaluateMemoryGateBenchmark({
      scenarios,
      benchmarkCases: memoryCases,
      executeCase: (scenario) => runMemoryGateCase({ scenario, llmService: evalService, logger }),
      judge: useJudge ? createJudge(judgeService) : undefined,
      logger,
    });
    printSummary("memory-gate", report);
    failed ||= report.summary.passed !== report.summary.total;
  }

  if (suite === "all" || suite === "writer-guardian") {
    const report = await evaluateWriterGuardianBenchmark({
      scenarios,
      benchmarkCases: writerCases,
      executeCase: (scenario) => runWriterGuardianCase({ scenario, llmService: evalService, logger }),
      logger,
    });
    printSummary("writer-guardian", report);
    failed ||= report.summary.passed !== report.summary.total;
  }

  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
