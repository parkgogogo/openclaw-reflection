export interface ConsolidationConfig {
  workspaceDir: string;
  schedule: string;
}

export type ConsolidatedFilename = "MEMORY.md" | "USER.md" | "SOUL.md";

export interface ConsolidationPatch {
  section: string;
  action: "add" | "replace" | "remove";
  content: string;
}

export interface ConsolidationProposal {
  decision: "NO_WRITE" | "WRITE_CLEANUP";
  proposedUpdates: Partial<Record<ConsolidatedFilename, ConsolidationPatch[]>>;
}

export interface ConsolidationResult {
  updates: Partial<Record<ConsolidatedFilename, string>>;
}
