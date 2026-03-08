import type {
  MemoryGateCaseResult,
  SingleModelRunReport,
  WriteGuardianCaseResult,
} from "./runner.js";

export interface RankedModelReport {
  modelId: string;
  passed: number;
  total: number;
  errorCounts?: SingleModelRunReport["summary"]["errorCounts"];
}

export interface BaselineDiff {
  modelId: string;
  regressedCases: string[];
  improvedCases: string[];
  disagreementCases: string[];
}

export interface HardestCase {
  scenarioId: string;
  failedBy: string[];
}

export interface DisagreementCase {
  scenarioId: string;
  modelIds: string[];
}

type EvalCaseResult = MemoryGateCaseResult | WriteGuardianCaseResult;

function getScenarioId(result: EvalCaseResult): string {
  return result.scenarioId;
}

function getTotalErrors(report: SingleModelRunReport): number {
  const errorCounts = report.summary.errorCounts;
  if (!errorCounts) {
    return 0;
  }

  return (
    errorCounts.provider_error +
    errorCounts.schema_error +
    errorCounts.execution_error
  );
}

function getCaseSignature(result: EvalCaseResult): string {
  if ("actualDecision" in result) {
    return JSON.stringify({
      pass: result.pass,
      actualDecision: result.actualDecision,
      decisionPass: result.decisionPass,
      candidatePass: result.candidatePass,
      errorType: result.errorType,
    });
  }

  return JSON.stringify({
    pass: result.pass,
    actualShouldWrite: result.actualShouldWrite,
    toolTrace: result.actualToolTrace,
  });
}

function buildResultMap(report: SingleModelRunReport): Map<string, EvalCaseResult> {
  return new Map(
    report.results.map((result) => [getScenarioId(result as EvalCaseResult), result as EvalCaseResult])
  );
}

export function rankModelReports(
  reports: SingleModelRunReport[]
): RankedModelReport[] {
  return reports
    .map((report) => ({
      modelId: report.modelId,
      passed: report.summary.passed,
      total: report.summary.total,
      errorCounts: report.summary.errorCounts,
      totalErrors: getTotalErrors(report),
    }))
    .sort((left, right) => {
      if (right.passed !== left.passed) {
        return right.passed - left.passed;
      }

      if (left.totalErrors !== right.totalErrors) {
        return left.totalErrors - right.totalErrors;
      }

      return left.modelId.localeCompare(right.modelId);
    })
    .map(({ totalErrors: _totalErrors, ...report }) => report);
}

export function buildBaselineDiffs(
  reports: SingleModelRunReport[],
  baselineModelId: string
): BaselineDiff[] {
  const baselineReport = reports.find((report) => report.modelId === baselineModelId);
  if (!baselineReport) {
    throw new Error(`Missing baseline model: ${baselineModelId}`);
  }

  const baselineResults = buildResultMap(baselineReport);

  return reports
    .filter((report) => report.modelId !== baselineModelId)
    .map((report) => {
      const reportResults = buildResultMap(report);
      const regressedCases: string[] = [];
      const improvedCases: string[] = [];
      const disagreementCases: string[] = [];

      for (const [scenarioId, baselineResult] of baselineResults.entries()) {
        const candidateResult = reportResults.get(scenarioId);
        if (!candidateResult) {
          continue;
        }

        if (baselineResult.pass && !candidateResult.pass) {
          regressedCases.push(scenarioId);
        }

        if (!baselineResult.pass && candidateResult.pass) {
          improvedCases.push(scenarioId);
        }

        if (getCaseSignature(baselineResult) !== getCaseSignature(candidateResult)) {
          disagreementCases.push(scenarioId);
        }
      }

      return {
        modelId: report.modelId,
        regressedCases,
        improvedCases,
        disagreementCases,
      };
    });
}

export function findHardestCases(
  reports: SingleModelRunReport[]
): HardestCase[] {
  const failedByScenario = new Map<string, string[]>();

  for (const report of reports) {
    for (const result of report.results) {
      const caseResult = result as EvalCaseResult;
      if (caseResult.pass) {
        continue;
      }

      const scenarioId = getScenarioId(caseResult);
      const failedBy = failedByScenario.get(scenarioId) ?? [];
      failedBy.push(report.modelId);
      failedByScenario.set(scenarioId, failedBy);
    }
  }

  return [...failedByScenario.entries()]
    .map(([scenarioId, failedBy]) => ({
      scenarioId,
      failedBy,
    }))
    .sort((left, right) => {
      if (right.failedBy.length !== left.failedBy.length) {
        return right.failedBy.length - left.failedBy.length;
      }

      return left.scenarioId.localeCompare(right.scenarioId);
    });
}

export function findDisagreementCases(
  reports: SingleModelRunReport[]
): DisagreementCase[] {
  const cases = new Map<string, Array<{ modelId: string; signature: string }>>();

  for (const report of reports) {
    for (const result of report.results) {
      const caseResult = result as EvalCaseResult;
      const scenarioId = getScenarioId(caseResult);
      const entries = cases.get(scenarioId) ?? [];
      entries.push({
        modelId: report.modelId,
        signature: getCaseSignature(caseResult),
      });
      cases.set(scenarioId, entries);
    }
  }

  return [...cases.entries()]
    .filter(([, entries]) => new Set(entries.map((entry) => entry.signature)).size > 1)
    .map(([scenarioId, entries]) => ({
      scenarioId,
      modelIds: entries.map((entry) => entry.modelId),
    }))
    .sort((left, right) => left.scenarioId.localeCompare(right.scenarioId));
}
