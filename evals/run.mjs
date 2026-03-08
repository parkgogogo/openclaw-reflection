import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parseEvalCliOptions } from "../dist/evals/cli.js";
import { buildMultiModelComparisonReport } from "../dist/evals/comparison.js";
import { resolveEvalDatasetPaths } from "../dist/evals/datasets.js";
import { loadEvalModelProfiles } from "../dist/evals/models.js";
import { writeComparisonReports } from "../dist/evals/reporting.js";
import { LLMService } from "../dist/llm/service.js";
import { FileLogger } from "../dist/logger.js";
import {
  buildSingleModelRunReport,
  createJudge,
  evaluateMemoryGateBenchmark,
  evaluateWriteGuardianBenchmark,
  runMemoryGateCase,
  runWriteGuardianCase,
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

function createServiceFromProfile(profile) {
  return new LLMService({
    baseURL: profile.baseURL,
    apiKey: profile.apiKey,
    model: profile.model,
  });
}

function createEmptyErrorCounts() {
  return {
    provider_error: 0,
    schema_error: 0,
    execution_error: 0,
  };
}

function mergeErrorCounts(left, right) {
  if (!right) {
    return left;
  }

  left.provider_error += right.provider_error;
  left.schema_error += right.schema_error;
  left.execution_error += right.execution_error;
  return left;
}

function printSummary(name, report) {
  console.log(`\n[${name}] ${report.summary.passed}/${report.summary.total} passed`);

  const errorCounts = report.summary.errorCounts;
  if (errorCounts) {
    const totalErrors =
      errorCounts.provider_error +
      errorCounts.schema_error +
      errorCounts.execution_error;
    if (totalErrors > 0) {
      console.log(
        `[${name}] errors: provider_error=${errorCounts.provider_error} schema_error=${errorCounts.schema_error} execution_error=${errorCounts.execution_error}`
      );
    }
  }

  const failures = report.results.filter((result) => !result.pass);
  if (failures.length === 0) {
    const internalErrors = report.results.filter((result) => result.errorType);
    if (internalErrors.length > 0) {
      console.log(`[${name}] internal errors:`);
      for (const result of internalErrors) {
        console.log(
          JSON.stringify(
            {
              scenarioId: result.scenarioId,
              pass: result.pass,
              actualDecision: result.actualDecision,
              errorType: result.errorType,
              error: result.error,
            },
            null,
            2
          )
        );
      }
    }
    return;
  }

  console.log(`[${name}] failures:`);
  for (const failure of failures) {
    console.log(JSON.stringify(failure, null, 2));
  }

  const internalErrorPasses = report.results.filter(
    (result) => result.errorType && result.pass
  );
  if (internalErrorPasses.length > 0) {
    console.log(`[${name}] internal errors in passed cases:`);
    for (const result of internalErrorPasses) {
      console.log(
        JSON.stringify(
          {
            scenarioId: result.scenarioId,
            pass: result.pass,
            actualDecision: result.actualDecision,
            errorType: result.errorType,
            error: result.error,
          },
          null,
          2
        )
      );
    }
  }
}

async function runSingleModelSuite(input) {
  const {
    suite,
    scenarios,
    memoryCases,
    writerCases,
    evalService,
    judgeService,
    useJudge,
    logger,
    modelId,
    modelLabel,
  } = input;

  const startedAt = new Date().toISOString();
  const combinedResults = [];
  let total = 0;
  let passed = 0;
  let errorCounts;

  if (suite === "all" || suite === "memory-gate") {
    const report = await evaluateMemoryGateBenchmark({
      scenarios,
      benchmarkCases: memoryCases,
      executeCase: (scenario) =>
        runMemoryGateCase({ scenario, llmService: evalService, logger }),
      judge: useJudge ? createJudge(judgeService) : undefined,
      logger,
    });
    printSummary(
      suite === "all" ? `${modelId}/memory-gate` : modelId,
      report
    );
    total += report.summary.total;
    passed += report.summary.passed;
    errorCounts = mergeErrorCounts(
      errorCounts ?? createEmptyErrorCounts(),
      report.summary.errorCounts
    );
    combinedResults.push(...report.results);
  }

  if (suite === "all" || suite === "write-guardian") {
    const report = await evaluateWriteGuardianBenchmark({
      scenarios,
      benchmarkCases: writerCases,
      executeCase: (scenario) =>
        runWriteGuardianCase({ scenario, llmService: evalService, logger }),
      logger,
    });
    printSummary(
      suite === "all" ? `${modelId}/write-guardian` : modelId,
      report
    );
    total += report.summary.total;
    passed += report.summary.passed;
    combinedResults.push(...report.results);
  }

  return buildSingleModelRunReport({
    modelId,
    modelLabel,
    suite,
    startedAt,
    finishedAt: new Date().toISOString(),
    summary: {
      total,
      passed,
      errorCounts,
    },
    results: combinedResults,
  });
}

export async function runComparisonMode(input) {
  const modelReports = [];

  for (const profile of input.profiles) {
    modelReports.push(await input.executeModel(profile));
  }

  return buildMultiModelComparisonReport({
    suite: input.suite,
    baselineModelId: input.baselineModelId,
    modelReports,
  });
}

export async function main(argv = process.argv) {
  loadEnvFile(path.join(rootDir, ".env"));

  const {
    suite,
    useJudge,
    datasetRoot,
    sharedDatasetPath,
    memoryGateDatasetPath,
    writeGuardianDatasetPath,
    modelsConfigPath,
    models,
    baselineModelId,
    outputPath,
    markdownOutputPath,
  } = parseEvalCliOptions(argv);
  const logger = new FileLogger(rootDir, "debug");
  const datasetPaths = resolveEvalDatasetPaths({
    rootDir,
    datasetRoot,
    sharedDatasetPath,
    memoryGateDatasetPath,
    writeGuardianDatasetPath,
  });
  const scenarios = readJsonl(datasetPaths.sharedDatasetPath);
  const memoryCases =
    suite === "all" || suite === "memory-gate"
      ? readJsonl(datasetPaths.memoryGateDatasetPath)
      : [];
  const writerCases =
    suite === "all" || suite === "write-guardian"
      ? readJsonl(datasetPaths.writeGuardianDatasetPath)
      : [];

  let failed = false;

  if (modelsConfigPath) {
    const configPath = path.isAbsolute(modelsConfigPath)
      ? modelsConfigPath
      : path.join(rootDir, modelsConfigPath);
    const profiles = await loadEvalModelProfiles({
      configPath,
      selectedModelIds: models,
    });
    const judgeService =
      useJudge &&
      process.env.JUDGE_BASE_URL &&
      process.env.JUDGE_API_KEY &&
      process.env.JUDGE_MODEL
        ? createServiceFromEnv("JUDGE")
        : undefined;

    const comparisonReport = await runComparisonMode({
      suite,
      baselineModelId,
      profiles,
      executeModel: async (profile) => {
        const evalService = createServiceFromProfile(profile);
        return runSingleModelSuite({
          suite,
          scenarios,
          memoryCases,
          writerCases,
          evalService,
          judgeService: judgeService ?? evalService,
          useJudge,
          logger,
          modelId: profile.id,
          modelLabel: profile.label,
        });
      },
    });
    await writeComparisonReports({
      report: comparisonReport,
      outputPath,
      markdownOutputPath,
    });

    failed = comparisonReport.models.some(
      (report) => report.summary.passed !== report.summary.total
    );
    process.exitCode = failed ? 1 : 0;
    return comparisonReport;
  }

  const evalService = createServiceFromEnv("EVAL");
  const judgeService =
    useJudge &&
    process.env.JUDGE_BASE_URL &&
    process.env.JUDGE_API_KEY &&
    process.env.JUDGE_MODEL
      ? createServiceFromEnv("JUDGE")
      : evalService;
  const report = await runSingleModelSuite({
    suite,
    scenarios,
    memoryCases,
    writerCases,
    evalService,
    judgeService,
    useJudge,
    logger,
    modelId: suite,
    modelLabel: suite,
  });
  failed = report.summary.passed !== report.summary.total;
  process.exitCode = failed ? 1 : 0;
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
