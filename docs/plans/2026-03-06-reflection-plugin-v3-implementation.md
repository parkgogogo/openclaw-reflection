# Reflection Plugin v3 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在现有 Reflection Plugin 基础上，实现双层触发架构：每 turn 轻量 Memory Gate + 定时 Consolidation，完成 v3 架构全量实现。

**Architecture:** 
- **第一层（每 turn）**：Memory Gate 轻量分析，只决策 NO_WRITE 或 WRITE_DAILY，只写 daily memory
- **第二层（定时）**：Consolidation 读取 daily、压缩整理、更新长期文件（MEMORY.md/USER.md/SOUL.md）
- 所有模块通过依赖注入连接，保持可测试性

**Tech Stack:** TypeScript, Node.js, OpenClaw Plugin API, ULID, 文件系统操作

---

## 前置准备

**当前代码状态：**
- 已有：消息捕获、环形缓冲区、会话管理、日志系统
- 缺少：Memory Gate、Daily Writer、Consolidation

**目录结构：**
```
src/
├── index.ts                    # 插件入口（已有）
├── config.ts                   # 配置解析（已有）
├── types.ts                    # 类型定义（已有）
├── logger.ts                   # 日志系统（已有）
├── buffer.ts                   # 环形缓冲区（已有）
├── session-manager.ts          # 会话管理（已有）
├── message-handler.ts          # 消息处理（已有）
├── memory-gate/                # 新增
├── daily-writer/               # 新增
├── consolidation/              # 新增
└── utils/                      # 新增
```

---

## Phase 1: 配置扩展

### Task 1: 扩展类型定义

**Files:**
- Modify: `src/types.ts`

**Step 1: 添加 Memory Gate 相关类型**

```typescript
// 在文件末尾添加

export type MemoryDecision = 'NO_WRITE' | 'WRITE_DAILY';

export interface MemoryGateOutput {
  decision: MemoryDecision;
  reason: string;
  candidateFact?: string;
}

export interface MemoryGateConfig {
  enabled: boolean;
  windowSize: number;
  model: string;
}

export interface DailyWriterConfig {
  enabled: boolean;
  memoryDir: string;
}

export interface ConsolidationConfig {
  enabled: boolean;
  schedule: string; // cron expression
  minDailyEntries: number; // 触发 consolidation 的最小 daily 条目数
}
```

**Step 2: 扩展 PluginConfig**

```typescript
// 修改 PluginConfig 接口
export interface PluginConfig {
  bufferSize: number;
  logLevel: LogLevel;
  memoryGate: MemoryGateConfig;
  dailyWriter: DailyWriterConfig;
  consolidation: ConsolidationConfig;
}
```

**Step 3: Commit**

```bash
git add src/types.ts
git commit -m "types: add Memory Gate, Daily Writer, Consolidation config types"
```

---

### Task 2: 扩展配置解析

**Files:**
- Modify: `src/config.ts`

**Step 1: 添加默认配置**

```typescript
// 在 parseConfig 函数中添加默认值

const DEFAULT_CONFIG: PluginConfig = {
  bufferSize: 50,
  logLevel: 'info',
  memoryGate: {
    enabled: true,
    windowSize: 10,
    model: 'kimi-coding/k2p5',
  },
  dailyWriter: {
    enabled: true,
    memoryDir: './memory',
  },
  consolidation: {
    enabled: true,
    schedule: '0 2 * * *', // 每天凌晨 2 点
    minDailyEntries: 10,
  },
};
```

**Step 2: 修改 parseConfig 函数**

```typescript
export function parseConfig(api: PluginAPI): PluginConfig {
  const bufferSize = Number(api.config?.get?.('bufferSize') ?? DEFAULT_CONFIG.bufferSize);
  const logLevel = (api.config?.get?.('logLevel') as LogLevel) ?? DEFAULT_CONFIG.logLevel;
  
  return {
    bufferSize,
    logLevel,
    memoryGate: {
      enabled: Boolean(api.config?.get?.('memoryGate.enabled') ?? DEFAULT_CONFIG.memoryGate.enabled),
      windowSize: Number(api.config?.get?.('memoryGate.windowSize') ?? DEFAULT_CONFIG.memoryGate.windowSize),
      model: String(api.config?.get?.('memoryGate.model') ?? DEFAULT_CONFIG.memoryGate.model),
    },
    dailyWriter: {
      enabled: Boolean(api.config?.get?.('dailyWriter.enabled') ?? DEFAULT_CONFIG.dailyWriter.enabled),
      memoryDir: String(api.config?.get?.('dailyWriter.memoryDir') ?? DEFAULT_CONFIG.dailyWriter.memoryDir),
    },
    consolidation: {
      enabled: Boolean(api.config?.get?.('consolidation.enabled') ?? DEFAULT_CONFIG.consolidation.enabled),
      schedule: String(api.config?.get?.('consolidation.schedule') ?? DEFAULT_CONFIG.consolidation.schedule),
      minDailyEntries: Number(api.config?.get?.('consolidation.minDailyEntries') ?? DEFAULT_CONFIG.consolidation.minDailyEntries),
    },
  };
}
```

**Step 3: Commit**

```bash
git add src/config.ts
git commit -m "config: add default config for Memory Gate, Daily Writer, Consolidation"
```

---

## Phase 2: 工具模块

### Task 3: 创建文件工具模块

**Files:**
- Create: `src/utils/file-utils.ts`

**Step 1: 创建文件**

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';

export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
}

export async function readFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    return null;
  }
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

export async function appendFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, content, 'utf-8');
}

export async function listFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter(e => e.isFile()).map(e => e.name);
  } catch (error) {
    return [];
  }
}

export async function moveFile(fromPath: string, toPath: string): Promise<void> {
  await fs.mkdir(path.dirname(toPath), { recursive: true });
  await fs.rename(fromPath, toPath);
}

export function getTodayFilename(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}.md`;
}

export function getYesterdayFilename(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}.md`;
}
```

**Step 2: Commit**

```bash
git add src/utils/file-utils.ts
git commit -m "feat(utils): add file utilities for directory and file operations"
```

---

## Phase 3: Memory Gate 模块

### Task 4: 创建 Memory Gate 类型

**Files:**
- Create: `src/memory-gate/types.ts`

**Step 1: 创建文件**

```typescript
export type MemoryDecision = 'NO_WRITE' | 'WRITE_DAILY';

export interface MemoryGateOutput {
  decision: MemoryDecision;
  reason: string;
  candidateFact?: string;
}

export interface MemoryGateInput {
  recentMessages: Array<{
    role: 'user' | 'agent';
    message: string;
    timestamp: number;
  }>;
  currentUserMessage: string;
  currentAgentReply: string;
}

export interface LLMClient {
  complete(prompt: string, systemPrompt: string): Promise<string>;
}
```

**Step 2: Commit**

```bash
git add src/memory-gate/types.ts
git commit -m "types(memory-gate): add MemoryGate types"
```

---

### Task 5: 创建 Memory Gate Prompt

**Files:**
- Create: `src/memory-gate/prompt.ts`

**Step 1: 创建文件**

```typescript
export const MEMORY_GATE_SYSTEM_PROMPT = `You are Lia's Memory Gate.

Your job: After each turn, decide whether this conversation turn should be recorded to daily memory.

You do NOT write files. You only decide:
- NO_WRITE: No valuable information (most turns)
- WRITE_DAILY: Concrete decision, next step, or important fact worth recording today

Principles:
1. Quality > Quantity. Most turns should be NO_WRITE.
2. Conservatism. When in doubt, choose NO_WRITE.
3. Only record: decisions, plans, important facts, not casual chat.

Output JSON only:
{
  "decision": "NO_WRITE" | "WRITE_DAILY",
  "reason": "brief explanation",
  "candidate_fact": "the fact to record (only if WRITE_DAILY)"
}`;
```

**Step 2: Commit**

```bash
git add src/memory-gate/prompt.ts
git commit -m "feat(memory-gate): add Memory Gate system prompt"
```

---

### Task 6: 创建 Memory Gate 分析器

**Files:**
- Create: `src/memory-gate/analyzer.ts`

**Step 1: 创建文件**

```typescript
import type { Logger } from '../types.js';
import type { MemoryGateInput, MemoryGateOutput, LLMClient } from './types.js';
import { MEMORY_GATE_SYSTEM_PROMPT } from './prompt.js';

export class MemoryGateAnalyzer {
  private llmClient: LLMClient;
  private logger: Logger;

  constructor(llmClient: LLMClient, logger: Logger) {
    this.llmClient = llmClient;
    this.logger = logger;
  }

  async analyze(input: MemoryGateInput): Promise<MemoryGateOutput> {
    const prompt = this.buildPrompt(input);
    
    this.logger.debug('MemoryGate', 'Analyzing turn', {
      messageCount: input.recentMessages.length,
    });

    try {
      const response = await this.llmClient.complete(prompt, MEMORY_GATE_SYSTEM_PROMPT);
      const output = this.parseResponse(response);
      
      this.logger.info('MemoryGate', 'Decision made', {
        decision: output.decision,
        reason: output.reason,
      });

      return output;
    } catch (error) {
      this.logger.error('MemoryGate', 'Analysis failed', { error });
      return { decision: 'NO_WRITE', reason: 'Analysis error' };
    }
  }

  private buildPrompt(input: MemoryGateInput): string {
    const messages = input.recentMessages
      .map(m => `[${m.role}]: ${m.message}`)
      .join('\n');

    return `Recent conversation (last ${input.recentMessages.length} messages):
${messages}

Current turn:
[user]: ${input.currentUserMessage}
[agent]: ${input.currentAgentReply}

Should this turn be recorded to daily memory? Output JSON with decision, reason, and candidate_fact.`;
  }

  private parseResponse(response: string): MemoryGateOutput {
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : response;
      const parsed = JSON.parse(jsonStr);
      
      // Validate decision
      const decision = parsed.decision === 'WRITE_DAILY' ? 'WRITE_DAILY' : 'NO_WRITE';
      
      return {
        decision,
        reason: parsed.reason || 'No reason provided',
        candidateFact: parsed.candidate_fact || parsed.candidateFact,
      };
    } catch (error) {
      return { decision: 'NO_WRITE', reason: 'Failed to parse LLM response' };
    }
  }
}
```

**Step 2: Commit**

```bash
git add src/memory-gate/analyzer.ts
git commit -m "feat(memory-gate): add MemoryGate analyzer with LLM integration"
```

---

### Task 7: 创建 Memory Gate 主入口

**Files:**
- Create: `src/memory-gate/index.ts`

**Step 1: 创建文件**

```typescript
export { MemoryGateAnalyzer } from './analyzer.js';
export { MEMORY_GATE_SYSTEM_PROMPT } from './prompt.js';
export type { 
  MemoryDecision, 
  MemoryGateInput, 
  MemoryGateOutput,
  LLMClient,
} from './types.js';
```

**Step 2: Commit**

```bash
git add src/memory-gate/index.ts
git commit -m "feat(memory-gate): export MemoryGate public API"
```

---

## Phase 4: Daily Writer 模块

### Task 8: 创建 Daily Writer

**Files:**
- Create: `src/daily-writer/index.ts`

**Step 1: 创建文件**

```typescript
import type { Logger } from '../types.js';
import type { MemoryGateOutput } from '../memory-gate/index.js';
import { ensureDir, appendFile, getTodayFilename } from '../utils/file-utils.js';
import * as path from 'path';

export interface DailyWriterConfig {
  memoryDir: string;
}

export class DailyWriter {
  private config: DailyWriterConfig;
  private logger: Logger;

  constructor(config: DailyWriterConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  async write(output: MemoryGateOutput): Promise<void> {
    if (output.decision !== 'WRITE_DAILY' || !output.candidateFact) {
      return;
    }

    const filename = getTodayFilename();
    const filePath = path.join(this.config.memoryDir, filename);
    
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    const content = `\n## [${timeStr}]\nContext:\n- ${output.reason}\n\nDecisions:\n- ${output.candidateFact}\n\n`;

    try {
      await ensureDir(this.config.memoryDir);
      await appendFile(filePath, content);
      
      this.logger.info('DailyWriter', 'Written to daily memory', {
        filePath,
        time: timeStr,
      });
    } catch (error) {
      this.logger.error('DailyWriter', 'Failed to write', { error, filePath });
    }
  }
}
```

**Step 2: Commit**

```bash
git add src/daily-writer/index.ts
git commit -m "feat(daily-writer): add DailyWriter for memory/YYYY-MM-DD.md"
```

---

## Phase 5: Consolidation 模块

### Task 9: 创建 Consolidation 类型

**Files:**
- Create: `src/consolidation/types.ts`

**Step 1: 创建文件**

```typescript
export interface ConsolidationConfig {
  memoryDir: string;
  workspaceDir: string;
  schedule: string;
  minDailyEntries: number;
}

export interface ConsolidationResult {
  updates: {
    'MEMORY.md'?: string;
    'USER.md'?: string;
    'SOUL.md'?: string;
  };
  archived: string[];
}

export interface DailyEntry {
  time: string;
  context: string;
  decisions: string[];
}
```

**Step 2: Commit**

```bash
git add src/consolidation/types.ts
git commit -m "types(consolidation): add Consolidation types"
```

---

### Task 10: 创建 Consolidation 逻辑

**Files:**
- Create: `src/consolidation/consolidator.ts`

**Step 1: 创建文件**

```typescript
import type { Logger } from '../types.js';
import type { ConsolidationConfig, ConsolidationResult, DailyEntry } from './types.js';
import { readFile, writeFile, listFiles, moveFile } from '../utils/file-utils.js';
import * as path from 'path';

export class Consolidator {
  private config: ConsolidationConfig;
  private logger: Logger;

  constructor(config: ConsolidationConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  async consolidate(): Promise<ConsolidationResult> {
    this.logger.info('Consolidator', 'Starting consolidation');
    
    // Read daily files
    const dailyFiles = await this.getDailyFiles();
    if (dailyFiles.length < this.config.minDailyEntries) {
      this.logger.info('Consolidator', 'Not enough daily entries, skipping', {
        count: dailyFiles.length,
        min: this.config.minDailyEntries,
      });
      return { updates: {}, archived: [] };
    }

    // Parse entries
    const entries = await this.parseDailyFiles(dailyFiles);
    
    // Generate updates for long-term files
    const updates = await this.generateUpdates(entries);
    
    // Apply updates
    await this.applyUpdates(updates);
    
    // Archive old files
    const archived = await this.archiveOldFiles(dailyFiles);
    
    this.logger.info('Consolidator', 'Consolidation completed', {
      filesProcessed: dailyFiles.length,
      archived: archived.length,
    });
    
    return { updates, archived };
  }

  private async getDailyFiles(): Promise<string[]> {
    const files = await listFiles(this.config.memoryDir);
    return files.filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.md$/));
  }

  private async parseDailyFiles(files: string[]): Promise<DailyEntry[]> {
    const entries: DailyEntry[] = [];
    
    for (const file of files) {
      const content = await readFile(path.join(this.config.memoryDir, file));
      if (content) {
        // Simple parsing - can be enhanced
        entries.push(...this.parseContent(content));
      }
    }
    
    return entries;
  }

  private parseContent(content: string): DailyEntry[] {
    // TODO: Implement proper parsing
    return [];
  }

  private async generateUpdates(entries: DailyEntry[]): Promise<ConsolidationResult['updates']> {
    // TODO: Implement LLM-based consolidation
    return {};
  }

  private async applyUpdates(updates: ConsolidationResult['updates']): Promise<void> {
    for (const [filename, content] of Object.entries(updates)) {
      if (content) {
        const filePath = path.join(this.config.workspaceDir, filename);
        await writeFile(filePath, content);
        this.logger.info('Consolidator', 'Updated file', { filePath });
      }
    }
  }

  private async archiveOldFiles(files: string[]): Promise<string[]> {
    const archived: string[] = [];
    const archiveDir = path.join(this.config.memoryDir, 'archive');
    
    // Archive files older than 7 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    
    for (const file of files) {
      const match = file.match(/^(\d{4})-(\d{2})-(\d{2})\.md$/);
      if (match) {
        const fileDate = new Date(`${match[1]}-${match[2]}-${match[3]}`);
        if (fileDate < cutoff) {
          const fromPath = path.join(this.config.memoryDir, file);
          const toPath = path.join(archiveDir, file);
          await moveFile(fromPath, toPath);
          archived.push(file);
        }
      }
    }
    
    return archived;
  }
}
```

**Step 2: Commit**

```bash
git add src/consolidation/consolidator.ts
git commit -m "feat(consolidation): add Consolidator logic skeleton"
```

---

### Task 11: 创建 Consolidation Scheduler

**Files:**
- Create: `src/consolidation/scheduler.ts`

**Step 1: 创建文件**

```typescript
import type { Logger } from '../types.js';
import type { ConsolidationConfig } from './types.js';
import { Consolidator } from './consolidator.js';

export class ConsolidationScheduler {
  private config: ConsolidationConfig;
  private logger: Logger;
  private consolidator: Consolidator;
  private timer: NodeJS.Timeout | null = null;

  constructor(config: ConsolidationConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.consolidator = new Consolidator(config, logger);
  }

  start(): void {
    // Parse cron-like schedule (simplified: just daily at specific hour)
    const hour = this.parseSchedule(this.config.schedule);
    const now = new Date();
    const nextRun = new Date();
    nextRun.setHours(hour, 0, 0, 0);
    
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }
    
    const delay = nextRun.getTime() - now.getTime();
    
    // Initial delay, then every 24 hours
    setTimeout(() => {
      this.runConsolidation();
      this.timer = setInterval(() => {
        this.runConsolidation();
      }, 24 * 60 * 60 * 1000);
    }, delay);
    
    this.logger.info('ConsolidationScheduler', 'Scheduled', {
      nextRun: nextRun.toISOString(),
      hour,
    });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runConsolidation(): Promise<void> {
    try {
      await this.consolidator.consolidate();
    } catch (error) {
      this.logger.error('ConsolidationScheduler', 'Consolidation failed', { error });
    }
  }

  private parseSchedule(schedule: string): number {
    // Simple parser for "0 2 * * *" (2 AM)
    const parts = schedule.split(' ');
    return parseInt(parts[1] || '2', 10);
  }
}
```

**Step 2: Commit**

```bash
git add src/consolidation/scheduler.ts
git commit -m "feat(consolidation): add ConsolidationScheduler"
```

---

### Task 12: 创建 Consolidation 主入口

**Files:**
- Create: `src/consolidation/index.ts`

**Step 1: 创建文件**

```typescript
export { Consolidator } from './consolidator.js';
export { ConsolidationScheduler } from './scheduler.js';
export type { 
  ConsolidationConfig, 
  ConsolidationResult, 
  DailyEntry 
} from './types.js';
```

**Step 2: Commit**

```bash
git add src/consolidation/index.ts
git commit -m "feat(consolidation): export Consolidation public API"
```

---

## Phase 6: 集成到主流程

### Task 13: 修改主入口初始化新模块

**Files:**
- Modify: `src/index.ts`

**Step 1: 添加导入**

```typescript
import { MemoryGateAnalyzer } from './memory-gate/index.js';
import { DailyWriter } from './daily-writer/index.js';
import { ConsolidationScheduler } from './consolidation/index.js';
```

**Step 2: 在 activate 函数中初始化**

```typescript
// 在 bufferManager 初始化后添加

let memoryGate: MemoryGateAnalyzer | null = null;
let dailyWriter: DailyWriter | null = null;
let consolidationScheduler: ConsolidationScheduler | null = null;

if (config.memoryGate.enabled) {
  // TODO: 实现 LLMClient
  const llmClient = createLLMClient(config.memoryGate.model);
  memoryGate = new MemoryGateAnalyzer(llmClient, runtimeFileLogger);
  gatewayLogger.info('[Reflection] Memory Gate initialized');
}

if (config.dailyWriter.enabled) {
  dailyWriter = new DailyWriter(
    { memoryDir: config.dailyWriter.memoryDir },
    runtimeFileLogger
  );
  gatewayLogger.info('[Reflection] Daily Writer initialized');
}

if (config.consolidation.enabled) {
  consolidationScheduler = new ConsolidationScheduler(
    {
      memoryDir: config.dailyWriter.memoryDir,
      workspaceDir: '.',
      schedule: config.consolidation.schedule,
      minDailyEntries: config.consolidation.minDailyEntries,
    },
    runtimeFileLogger
  );
  consolidationScheduler.start();
  gatewayLogger.info('[Reflection] Consolidation Scheduler started');
}
```

**Step 3: 修改 message_sent hook**

```typescript
api.on('message_sent', (event: unknown, context?: unknown) => {
  if (bufferManager) {
    handleMessageSent(
      event,
      bufferManager,
      runtimeFileLogger,
      context,
      memoryGate || undefined,
      dailyWriter || undefined,
    );
  }
});
```

**Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat(index): initialize Memory Gate, Daily Writer, Consolidation"
```

---

### Task 14: 修改 Message Handler 集成 Memory Gate

**Files:**
- Modify: `src/message-handler.ts`

**Step 1: 添加导入**

```typescript
import type { MemoryGateAnalyzer, MemoryGateOutput } from './memory-gate/index.js';
import type { DailyWriter } from './daily-writer/index.js';
```

**Step 2: 修改 handleMessageSent 函数签名**

```typescript
export function handleMessageSent(
  event: unknown,
  bufferManager: SessionBufferManager,
  logger: Logger,
  hookContext?: unknown,
  memoryGate?: MemoryGateAnalyzer,
  dailyWriter?: DailyWriter,
): void {
  // ... 原有代码 ...
  
  bufferManager.push(sessionKey, message);
  
  // 异步触发 Memory Gate 分析
  if (memoryGate && dailyWriter) {
    triggerMemoryGate(
      sessionKey,
      bufferManager,
      message,
      memoryGate,
      dailyWriter,
      logger
    );
  }
}
```

**Step 3: 添加 triggerMemoryGate 函数**

```typescript
async function triggerMemoryGate(
  sessionKey: string,
  bufferManager: SessionBufferManager,
  latestMessage: ReflectionMessage,
  memoryGate: MemoryGateAnalyzer,
  dailyWriter: DailyWriter,
  logger: Logger,
): Promise<void> {
  const messages = bufferManager.getMessages(sessionKey);
  const recentMessages = messages.slice(-10); // 最近 10 条
  
  const userMessage = recentMessages.find(m => m.role === 'user')?.message || '';
  const agentReply = latestMessage.message;
  
  const input = {
    recentMessages: recentMessages.map(m => ({
      role: m.role,
      message: m.message,
      timestamp: m.timestamp,
    })),
    currentUserMessage: userMessage,
    currentAgentReply: agentReply,
  };
  
  try {
    const output = await memoryGate.analyze(input);
    
    if (output.decision === 'WRITE_DAILY') {
      await dailyWriter.write(output);
    }
    // NO_WRITE: do nothing
  } catch (error) {
    logger.error('MessageHandler', 'Memory Gate processing failed', { error, sessionKey });
  }
}
```

**Step 4: Commit**

```bash
git add src/message-handler.ts
git commit -m "feat(message-handler): integrate Memory Gate and Daily Writer"
```

---

## 总结

**已完成计划：**
- ✅ 14 个任务覆盖全部模块
- ✅ 双层架构：每 turn Memory Gate + 定时 Consolidation
- ✅ Memory Gate 只决策 NO_WRITE/WRITE_DAILY
- ✅ Daily Writer 只写 daily memory
- ✅ Consolidation 负责更新长期文件

**下一步执行选择：**
1. **Subagent-Driven** - 在当前会话中，我为每个任务派遣子代理，任务间有代码审查
2. **Parallel Session** - 开启新会话批量执行

师兄选择哪种方式？💗