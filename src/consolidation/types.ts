export interface ConsolidationConfig {
  memoryDir: string;
  workspaceDir: string;
  schedule: string;
  minDailyEntries: number;
}

export interface ConsolidationResult {
  updates: {
    "MEMORY.md"?: string;
    "USER.md"?: string;
    "SOUL.md"?: string;
  };
  archived: string[];
}
