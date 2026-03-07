export type EvalSuite = "all" | "memory-gate" | "writer-guardian";

export interface EvalCliOptions {
  suite: EvalSuite;
  useJudge: boolean;
  datasetRoot?: string;
  sharedDatasetPath?: string;
  memoryGateDatasetPath?: string;
  writerGuardianDatasetPath?: string;
}

function getArgValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1 || index + 1 >= argv.length) {
    return undefined;
  }

  return argv[index + 1];
}

function parseSuite(value: string | undefined): EvalSuite {
  const suite = value ?? "all";
  if (
    suite === "all" ||
    suite === "memory-gate" ||
    suite === "writer-guardian"
  ) {
    return suite;
  }

  throw new Error(
    `Unsupported suite: ${suite}. Expected one of: all, memory-gate, writer-guardian`
  );
}

export function parseEvalCliOptions(argv: string[]): EvalCliOptions {
  return {
    suite: parseSuite(getArgValue(argv, "--suite")),
    useJudge: !argv.includes("--no-judge"),
    datasetRoot: getArgValue(argv, "--dataset-root"),
    sharedDatasetPath: getArgValue(argv, "--shared-dataset"),
    memoryGateDatasetPath: getArgValue(argv, "--memory-gate-dataset"),
    writerGuardianDatasetPath: getArgValue(argv, "--writer-guardian-dataset"),
  };
}
