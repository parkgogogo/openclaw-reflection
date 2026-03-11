import type { ManagedFileName, ManagedFactId, ReflectionProposalId } from "./types.js";

export type ReflectionReconcileMode = "overwrite" | "adopt" | "detach";

export type ReflectionCommandIntent =
  | { kind: "files" }
  | { kind: "file"; fileName: ManagedFileName }
  | { kind: "fact"; factId: ManagedFactId }
  | { kind: "proposal"; proposalId: ReflectionProposalId }
  | { kind: "apply"; proposalId: ReflectionProposalId }
  | { kind: "discard"; proposalId: ReflectionProposalId }
  | { kind: "propose_delete"; factId: ManagedFactId }
  | { kind: "propose_edit"; factId: ManagedFactId; text: string }
  | { kind: "propose_move"; factId: ManagedFactId; targetFileName: ManagedFileName }
  | { kind: "reconcile"; fileName: ManagedFileName; mode: ReflectionReconcileMode };

const USAGE_ERROR = "Usage: /reflection files|file <FILE>|fact <FACT_ID>|proposal <PROPOSAL_ID>|apply <PROPOSAL_ID>|discard <PROPOSAL_ID>|propose delete <FACT_ID>|propose edit <FACT_ID> --text \"...\"|propose move <FACT_ID> --to <FILE>|reconcile <FILE> --mode overwrite|adopt|detach";

function tokenize(input: string): string[] {
  const matches = input.match(/"([^"\\]|\\.)*"|\S+/g) ?? [];
  return matches.map((token) =>
    token.startsWith("\"") && token.endsWith("\"")
      ? token.slice(1, -1).replace(/\\"/g, "\"")
      : token
  );
}

function requireManagedFileName(value: string | undefined): ManagedFileName {
  if (
    value === "MEMORY.md" ||
    value === "USER.md" ||
    value === "SOUL.md" ||
    value === "IDENTITY.md" ||
    value === "TOOLS.md"
  ) {
    return value;
  }

  throw new Error(USAGE_ERROR);
}

function readFlagValue(tokens: string[], flag: string): string | undefined {
  const index = tokens.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return tokens[index + 1];
}

export function parseReflectionCommand(input: string): ReflectionCommandIntent {
  const tokens = tokenize(input.trim());

  if (tokens.length === 0) {
    throw new Error(USAGE_ERROR);
  }

  const [head, second, third] = tokens;

  if (head === "files") {
    return { kind: "files" };
  }

  if (head === "file") {
    return {
      kind: "file",
      fileName: requireManagedFileName(second),
    };
  }

  if (head === "fact" && second) {
    return {
      kind: "fact",
      factId: second,
    };
  }

  if (head === "proposal" && second) {
    return {
      kind: "proposal",
      proposalId: second,
    };
  }

  if (head === "apply" && second) {
    return {
      kind: "apply",
      proposalId: second,
    };
  }

  if (head === "discard" && second) {
    return {
      kind: "discard",
      proposalId: second,
    };
  }

  if (head === "propose" && second === "delete" && third) {
    return {
      kind: "propose_delete",
      factId: third,
    };
  }

  if (head === "propose" && second === "edit" && third) {
    const text = readFlagValue(tokens, "--text");
    if (!text) {
      throw new Error('Missing required flag: --text');
    }

    return {
      kind: "propose_edit",
      factId: third,
      text,
    };
  }

  if (head === "propose" && second === "move" && third) {
    const targetFileName = readFlagValue(tokens, "--to");
    if (!targetFileName) {
      throw new Error('Missing required flag: --to');
    }

    return {
      kind: "propose_move",
      factId: third,
      targetFileName: requireManagedFileName(targetFileName),
    };
  }

  if (head === "reconcile" && second) {
    const mode = readFlagValue(tokens, "--mode");
    if (mode !== "overwrite" && mode !== "adopt" && mode !== "detach") {
      throw new Error('Missing required flag: --mode');
    }

    return {
      kind: "reconcile",
      fileName: requireManagedFileName(second),
      mode,
    };
  }

  throw new Error(USAGE_ERROR);
}
