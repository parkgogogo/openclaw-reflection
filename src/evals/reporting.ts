import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { MultiModelComparisonReport } from "./comparison.js";

function formatErrorCounts(
  errorCounts: MultiModelComparisonReport["models"][number]["summary"]["errorCounts"]
): string {
  if (!errorCounts) {
    return "0/0/0";
  }

  return `${errorCounts.provider_error}/${errorCounts.schema_error}/${errorCounts.execution_error}`;
}

export function renderComparisonMarkdown(
  report: MultiModelComparisonReport
): string {
  const lines = [
    "# Eval Comparison Report",
    "",
    `- Run ID: ${report.runId}`,
    `- Timestamp: ${report.timestamp}`,
    `- Suite: ${report.suite}`,
  ];

  if (report.baselineModelId) {
    lines.push(`- Baseline: ${report.baselineModelId}`);
  }

  lines.push(
    "",
    "## Leaderboard",
    "",
    "| Model | Passed | Total | Errors (provider/schema/execution) |",
    "| --- | --- | --- | --- |"
  );

  for (const entry of report.comparison.ranking) {
    lines.push(
      `| ${entry.modelId} | ${entry.passed} | ${entry.total} | ${formatErrorCounts(
        entry.errorCounts
      )} |`
    );
  }

  lines.push("", "## Baseline Diffs", "");
  if (report.comparison.baselineDiffs.length === 0) {
    lines.push("No baseline diffs.");
  } else {
    for (const diff of report.comparison.baselineDiffs) {
      lines.push(`### ${diff.modelId}`);
      lines.push(`- Regressed: ${diff.regressedCases.join(", ") || "(none)"}`);
      lines.push(`- Improved: ${diff.improvedCases.join(", ") || "(none)"}`);
      lines.push(
        `- Disagreements: ${diff.disagreementCases.join(", ") || "(none)"}`
      );
      lines.push("");
    }
  }

  lines.push("## Hardest Cases", "");
  if (report.comparison.hardestCases.length === 0) {
    lines.push("No failed cases.");
  } else {
    for (const hardestCase of report.comparison.hardestCases) {
      lines.push(
        `- ${hardestCase.scenarioId}: ${hardestCase.failedBy.join(", ")}`
      );
    }
  }

  lines.push("", "## Disagreement Cases", "");
  if (report.comparison.disagreementCases.length === 0) {
    lines.push("No disagreement cases.");
  } else {
    for (const disagreement of report.comparison.disagreementCases) {
      lines.push(
        `- ${disagreement.scenarioId}: ${disagreement.modelIds.join(", ")}`
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

export async function writeComparisonReports(input: {
  report: MultiModelComparisonReport;
  outputPath?: string;
  markdownOutputPath?: string;
}): Promise<{
  jsonWritten: boolean;
  markdownWritten: boolean;
  writtenPaths: string[];
}> {
  const writtenPaths: string[] = [];

  if (input.outputPath) {
    await mkdir(path.dirname(input.outputPath), { recursive: true });
    await writeFile(
      input.outputPath,
      `${JSON.stringify(input.report, null, 2)}\n`,
      "utf8"
    );
    writtenPaths.push(input.outputPath);
  }

  if (input.markdownOutputPath) {
    await mkdir(path.dirname(input.markdownOutputPath), { recursive: true });
    await writeFile(
      input.markdownOutputPath,
      renderComparisonMarkdown(input.report),
      "utf8"
    );
    writtenPaths.push(input.markdownOutputPath);
  }

  return {
    jsonWritten: Boolean(input.outputPath),
    markdownWritten: Boolean(input.markdownOutputPath),
    writtenPaths,
  };
}
