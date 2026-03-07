import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";

import { FileCurator } from "../file-curator/index.js";
import { LLMService } from "../llm/service.js";
import { MemoryGateAnalyzer } from "../memory-gate/analyzer.js";
import type {
  AgentStep,
  LLMService as LLMServiceContract,
  Logger,
  MemoryGateOutput,
} from "../types.js";

export interface SharedScenario {
  scenario_id: string;
  task_type?: "memory_gate" | "writer_guardian";
  title: string;
  recent_messages?: Array<{
    role: "user" | "agent";
    message: string;
  }>;
  current_user_message?: string;
  current_agent_reply?: string;
  gate_decision?: MemoryGateOutput["decision"];
  gate_reason?: string;
  candidate_fact?: string;
  target_file?: "MEMORY.md" | "USER.md" | "SOUL.md" | "IDENTITY.md";
  current_file_content?: string;
  notes: string;
}

export interface MemoryGateBenchmarkCase {
  scenario_id: string;
  expected_decision: MemoryGateOutput["decision"];
  expected_candidate_fact?: string;
  allowed_candidate_fact_variants?: string[];
  severity: "core" | "boundary";
  tags: string[];
}

export interface WriterGuardianBenchmarkCase {
  scenario_id: string;
  expected_should_write: boolean;
  expected_outcome_type: string;
  allowed_tool_traces: string[][];
  expected_content_contains?: string[];
  expected_content_not_contains?: string[];
  tags: string[];
}

export interface MemoryGateCaseResult {
  scenarioId: string;
  pass: boolean;
  decisionPass: boolean;
  candidatePass: boolean;
  judgeUsed: boolean;
  actualDecision: MemoryGateOutput["decision"];
  expectedDecision: MemoryGateOutput["decision"];
  actualCandidateFact?: string;
  expectedCandidateFact?: string;
  error?: string;
}

export interface WriterGuardianCaseResult {
  scenarioId: string;
  pass: boolean;
  shouldWritePass: boolean;
  toolTracePass: boolean;
  contentPass: boolean;
  actualShouldWrite: boolean;
  actualToolTrace: string[];
  targetFile: string;
  error?: string;
}

export interface BenchmarkSummary {
  total: number;
  passed: number;
}

export interface Judge {
  compareCandidateFact(input: {
    expected: string;
    actual: string;
    variants: string[];
  }): Promise<{ equivalent: boolean; reason: string }>;
}

function createNoopLogger(): Logger {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function withScenarioLogger(baseLogger: Logger, scenarioId: string): Logger {
  return {
    debug(component, event, details) {
      baseLogger.debug(component, event, details, scenarioId);
    },
    info(component, event, details) {
      baseLogger.info(component, event, details, scenarioId);
    },
    warn(component, event, details) {
      baseLogger.warn(component, event, details, scenarioId);
    },
    error(component, event, details) {
      baseLogger.error(component, event, details, scenarioId);
    },
  };
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function buildScenarioMap(scenarios: SharedScenario[]): Map<string, SharedScenario> {
  return new Map(scenarios.map((scenario) => [scenario.scenario_id, scenario]));
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function normalizeFileContent(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n");
  return normalized.endsWith("\n") ? normalized : `${normalized}\n`;
}

export async function evaluateMemoryGateBenchmark(input: {
  scenarios: SharedScenario[];
  benchmarkCases: MemoryGateBenchmarkCase[];
  executeCase: (scenario: SharedScenario) => Promise<MemoryGateOutput>;
  judge?: Judge;
  logger?: Logger;
}): Promise<{ summary: BenchmarkSummary; results: MemoryGateCaseResult[] }> {
  const scenarioMap = buildScenarioMap(input.scenarios);
  const results: MemoryGateCaseResult[] = [];
  const logger = input.logger ?? createNoopLogger();

  for (const benchmarkCase of input.benchmarkCases) {
    const scenario = scenarioMap.get(benchmarkCase.scenario_id);
    if (!scenario) {
      throw new Error(`Missing shared scenario: ${benchmarkCase.scenario_id}`);
    }

    try {
      logger.info("EvalRunner", "Starting memory gate case", {
        scenarioId: benchmarkCase.scenario_id,
        expectedDecision: benchmarkCase.expected_decision,
      });

      const actual = await input.executeCase(scenario);
      const decisionPass = actual.decision === benchmarkCase.expected_decision;
      let candidatePass = true;
      let judgeUsed = false;

      if (benchmarkCase.expected_decision !== "NO_WRITE") {
        const expectedFact = benchmarkCase.expected_candidate_fact ?? "";
        const actualFact = actual.candidateFact ?? "";
        const variants = benchmarkCase.allowed_candidate_fact_variants ?? [];
        const exactMatches =
          normalizeText(actualFact) === normalizeText(expectedFact) ||
          variants.some((variant) => normalizeText(actualFact) === normalizeText(variant));

        candidatePass = exactMatches;

        if (!candidatePass && input.judge && actualFact.trim() !== "" && expectedFact.trim() !== "") {
          const judged = await input.judge.compareCandidateFact({
            expected: expectedFact,
            actual: actualFact,
            variants,
          });
          candidatePass = judged.equivalent;
          judgeUsed = true;
        }
      }

      const pass = decisionPass && candidatePass;
      results.push({
        scenarioId: benchmarkCase.scenario_id,
        pass,
        decisionPass,
        candidatePass,
        judgeUsed,
        actualDecision: actual.decision,
        expectedDecision: benchmarkCase.expected_decision,
        actualCandidateFact: actual.candidateFact,
        expectedCandidateFact: benchmarkCase.expected_candidate_fact,
      });
      logger.info("EvalRunner", "Completed memory gate case", {
        scenarioId: benchmarkCase.scenario_id,
        pass,
        decisionPass,
        candidatePass,
        judgeUsed,
        actualDecision: actual.decision,
      });
    } catch (error) {
      const reason = getErrorMessage(error);
      results.push({
        scenarioId: benchmarkCase.scenario_id,
        pass: false,
        decisionPass: false,
        candidatePass: false,
        judgeUsed: false,
        actualDecision: "NO_WRITE",
        expectedDecision: benchmarkCase.expected_decision,
        expectedCandidateFact: benchmarkCase.expected_candidate_fact,
        error: reason,
      });
      logger.error("EvalRunner", "Memory gate case failed", {
        scenarioId: benchmarkCase.scenario_id,
        reason,
      });
    }
  }

  return {
    summary: {
      total: results.length,
      passed: results.filter((result) => result.pass).length,
    },
    results,
  };
}

export async function evaluateWriterGuardianBenchmark(input: {
  scenarios: SharedScenario[];
  benchmarkCases: WriterGuardianBenchmarkCase[];
  executeCase: (scenario: SharedScenario) => Promise<{
    shouldWrite: boolean;
    toolTrace: string[];
    finalContent: string;
  }>;
  logger?: Logger;
}): Promise<{ summary: BenchmarkSummary; results: WriterGuardianCaseResult[] }> {
  const scenarioMap = buildScenarioMap(input.scenarios);
  const results: WriterGuardianCaseResult[] = [];
  const logger = input.logger ?? createNoopLogger();

  for (const benchmarkCase of input.benchmarkCases) {
    const scenario = scenarioMap.get(benchmarkCase.scenario_id);
    if (!scenario) {
      throw new Error(`Missing shared scenario: ${benchmarkCase.scenario_id}`);
    }

    if (!scenario.target_file || typeof scenario.current_file_content !== "string") {
      throw new Error(`Writer scenario is missing target_file or current_file_content: ${scenario.scenario_id}`);
    }

    try {
      logger.info("EvalRunner", "Starting writer guardian case", {
        scenarioId: benchmarkCase.scenario_id,
        targetFile: scenario.target_file,
        expectedShouldWrite: benchmarkCase.expected_should_write,
      });

      const actual = await input.executeCase(scenario);
      const initialContent = normalizeFileContent(scenario.current_file_content);
      const normalizedFinal = normalizeFileContent(actual.finalContent);
      const shouldWritePass =
        actual.shouldWrite === benchmarkCase.expected_should_write &&
        (benchmarkCase.expected_should_write ? true : normalizedFinal === initialContent);
      const toolTracePass = benchmarkCase.allowed_tool_traces.some((trace) =>
        arraysEqual(trace, actual.toolTrace)
      );
      const expectedContains = benchmarkCase.expected_content_contains ?? [];
      const expectedNotContains = benchmarkCase.expected_content_not_contains ?? [];
      const contentPass =
        expectedContains.every((snippet) => normalizedFinal.includes(snippet)) &&
        expectedNotContains.every((snippet) => !normalizedFinal.includes(snippet));
      const pass = shouldWritePass && toolTracePass && contentPass;

      results.push({
        scenarioId: benchmarkCase.scenario_id,
        pass,
        shouldWritePass,
        toolTracePass,
        contentPass,
        actualShouldWrite: actual.shouldWrite,
        actualToolTrace: actual.toolTrace,
        targetFile: scenario.target_file,
      });
      logger.info("EvalRunner", "Completed writer guardian case", {
        scenarioId: benchmarkCase.scenario_id,
        pass,
        shouldWritePass,
        toolTracePass,
        contentPass,
        actualShouldWrite: actual.shouldWrite,
        actualToolTrace: actual.toolTrace,
      });
    } catch (error) {
      const reason = getErrorMessage(error);
      results.push({
        scenarioId: benchmarkCase.scenario_id,
        pass: false,
        shouldWritePass: false,
        toolTracePass: false,
        contentPass: false,
        actualShouldWrite: false,
        actualToolTrace: [],
        targetFile: scenario.target_file,
        error: reason,
      });
      logger.error("EvalRunner", "Writer guardian case failed", {
        scenarioId: benchmarkCase.scenario_id,
        targetFile: scenario.target_file,
        reason,
      });
    }
  }

  return {
    summary: {
      total: results.length,
      passed: results.filter((result) => result.pass).length,
    },
    results,
  };
}

export async function runMemoryGateCase(input: {
  scenario: SharedScenario;
  llmService: LLMServiceContract;
  logger?: Logger;
}): Promise<MemoryGateOutput> {
  if (
    !input.scenario.current_user_message ||
    typeof input.scenario.current_agent_reply !== "string"
  ) {
    throw new Error(`Memory gate scenario is missing current turn fields: ${input.scenario.scenario_id}`);
  }

  const analyzer = new MemoryGateAnalyzer(
    input.llmService,
    withScenarioLogger(input.logger ?? createNoopLogger(), input.scenario.scenario_id)
  );
  const recentMessages = (input.scenario.recent_messages ?? []).map((message, index) => ({
    ...message,
    timestamp: 1_700_000_000_000 + index * 1000,
  }));

  return analyzer.analyze({
    recentMessages,
    currentUserMessage: input.scenario.current_user_message,
    currentAgentReply: input.scenario.current_agent_reply,
  });
}

export async function runWriterGuardianCase(input: {
  scenario: SharedScenario;
  llmService: LLMServiceContract;
  logger?: Logger;
}): Promise<{ shouldWrite: boolean; toolTrace: string[]; finalContent: string }> {
  const scenario = input.scenario;
  if (
    !scenario.target_file ||
    !scenario.gate_decision ||
    !scenario.gate_reason ||
    !scenario.candidate_fact ||
    typeof scenario.current_file_content !== "string"
  ) {
    throw new Error(`Writer guardian scenario is missing required fields: ${scenario.scenario_id}`);
  }

  const workspaceDir = await mkdtemp(path.join(os.tmpdir(), "reflection-eval-"));
  const logger = withScenarioLogger(
    input.logger ?? createNoopLogger(),
    scenario.scenario_id
  );
  const filePath = path.join(workspaceDir, scenario.target_file);
  const originalContent = normalizeFileContent(scenario.current_file_content);
  await writeFile(filePath, originalContent, "utf8");

  let lastSteps: AgentStep[] = [];
  const recordingService: LLMServiceContract = {
    generateObject: (params) => input.llmService.generateObject(params),
    runAgent: async (params) => {
      const result = await input.llmService.runAgent(params);
      lastSteps = result.steps;
      return result;
    },
  };

  try {
    const curator = new FileCurator({ workspaceDir }, logger, recordingService);
    await curator.write({
      decision: scenario.gate_decision,
      reason: scenario.gate_reason,
      candidateFact: scenario.candidate_fact,
    });
    const finalContent = normalizeFileContent((await readFile(filePath, "utf8")) ?? originalContent);
    const toolTrace = lastSteps
      .filter((step) => step.type === "tool" && typeof step.toolName === "string")
      .map((step) => step.toolName as string);
    const shouldWrite = toolTrace.includes("write") || finalContent !== originalContent;

    return {
      shouldWrite,
      toolTrace,
      finalContent,
    };
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
}

export function createJudge(llmService: LLMService): Judge {
  return {
    async compareCandidateFact(input) {
      return llmService.generateObject({
        systemPrompt:
          "You judge whether two candidate memory facts are semantically equivalent. Output JSON only.",
        userPrompt: [
          `Expected fact: ${input.expected}`,
          `Actual fact: ${input.actual}`,
          `Allowed variants: ${input.variants.join(" | ") || "(none)"}`,
          "",
          "Return whether the actual fact is an acceptable semantic match.",
        ].join("\n"),
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["equivalent", "reason"],
          properties: {
            equivalent: { type: "boolean" },
            reason: { type: "string" },
          },
        },
      });
    },
  };
}
