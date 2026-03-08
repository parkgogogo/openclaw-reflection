import path from "node:path";

export interface ResolveEvalDatasetPathsInput {
  rootDir: string;
  datasetRoot?: string;
  sharedDatasetPath?: string;
  memoryGateDatasetPath?: string;
  writeGuardianDatasetPath?: string;
}

export interface EvalDatasetPaths {
  sharedDatasetPath: string;
  memoryGateDatasetPath: string;
  writeGuardianDatasetPath: string;
}

function resolvePath(rootDir: string, targetPath: string): string {
  return path.isAbsolute(targetPath) ? targetPath : path.join(rootDir, targetPath);
}

export function resolveEvalDatasetPaths(
  input: ResolveEvalDatasetPathsInput
): EvalDatasetPaths {
  const datasetRoot = input.datasetRoot
    ? resolvePath(input.rootDir, input.datasetRoot)
    : path.join(input.rootDir, "evals/datasets");

  return {
    sharedDatasetPath: input.sharedDatasetPath
      ? resolvePath(input.rootDir, input.sharedDatasetPath)
      : path.join(datasetRoot, "shared/scenarios.jsonl"),
    memoryGateDatasetPath: input.memoryGateDatasetPath
      ? resolvePath(input.rootDir, input.memoryGateDatasetPath)
      : path.join(datasetRoot, "memory-gate/benchmark.jsonl"),
    writeGuardianDatasetPath: input.writeGuardianDatasetPath
      ? resolvePath(input.rootDir, input.writeGuardianDatasetPath)
      : path.join(datasetRoot, "write-guardian/benchmark.jsonl"),
  };
}
