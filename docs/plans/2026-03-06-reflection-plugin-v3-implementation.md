# Reflection Plugin v3 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在现有 Reflection Plugin 基础上，实现 Memory Gate、Daily Writer、File Curator、Consolidation 四个核心模块，完成 v3 架构全量实现。

**Architecture:** 基于现有消息捕获和环形缓冲区架构，新增 Memory Gate 决策层，根据决策结果调用 Daily Writer 或 File Curator 进行文件写入，Consolidation 作为定时任务每日运行。所有模块通过依赖注入连接，保持可测试性。

**Tech Stack:** TypeScript, Node.js, OpenClaw Plugin API, ULID, 文件系统操作

---

## 前置准备

**当前代码状态：**
- 已有：消息捕获、环形缓冲区、会话管理、日志系统
- 缺少：Memory Gate、Daily Writer、File Curator、Consolidation

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
├── writers/                    # 新增
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

export type MemoryDecision = 
  | 'NO_WRITE'
  | 'WRITE_DAILY'
  | 'UPDATE_MEMORY'
  | 'UPDATE_USER'
  | 'UPDATE_SOUL'
  | 'UPDATE_IDENTITY';

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

export interface FileCuratorConfig {
  enabled: boolean;
  workspaceDir: string;
}

export interface ConsolidationConfig {
  enabled: boolean;
  schedule: string; // cron expression
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
  fileCurator: FileCuratorConfig;
  consolidation: ConsolidationConfig;
}
```

**Step 3: Commit**

```bash
git add src/types.ts
git commit -m "types: add Memory Gate, Daily Writer, File Curator, Consolidation config types"
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
  fileCurator: {
    enabled: true,
    workspaceDir: '.',
  },
  consolidation: {
    enabled: true,
    schedule: '0 2 * * *', // 每天凌晨 2 点
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
    fileCurator: {
      enabled: Boolean(api.config?.get?.('fileCurator.enabled') ?? DEFAULT_CONFIG.fileCurator.enabled),
      workspaceDir: String(api.config?.get?.('fileCurator.workspaceDir') ?? DEFAULT_CONFIG.fileCurator.workspaceDir),
    },
    consolidation: {
      enabled: Boolean(api.config?.get?.('consolidation.enabled') ?? DEFAULT_CONFIG.consolidation.enabled),
      schedule: String(api.config?.get?.('consolidation.schedule') ?? DEFAULT_CONFIG.consolidation.schedule),
    },
  };
}
```

**Step 3: Commit**

```bash
git add src/config.ts
git commit -m "config: add default config for Memory Gate, Daily Writer, File Curator, Consolidation"
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

export function getTodayFilename(): string {
  const date = new Date();
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

### Task 4: 创建 Memory Gate 决策类型

**Files:**
- Create: `src/memory-gate/decision.ts`

**Step 1: 创建文件**

```typescript
export type MemoryDecision = 
  | 'NO_WRITE'
  | 'WRITE_DAILY'
  | 'UPDATE_MEMORY'
  | 'UPDATE_USER'
  | 'UPDATE_SOUL'
  | 'UPDATE_IDENTITY';

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
```

**Step 2: Commit**

```bash
git add src/memory-gate/decision.ts
git commit -m "types(memory-gate): add MemoryGate decision types"
```

---

### Task 5: 创建 Memory Gate 分析器

**Files:**
- Create: `src/memory-gate/analyzer.ts`
- Create: `src/memory-gate/prompt.ts`

**Step 1: 创建 prompt.ts**

```typescript
export const MEMORY_GATE_PROMPT = `You are Lia's Memory Gate.

Your job: After each turn, decide whether to update memory files.

You do NOT write files. You only decide:
- NO_WRITE: No valuable information
- WRITE_DAILY: Concrete decision or next step
- UPDATE_MEMORY: Stable long-term fact or precious moment
- UPDATE_USER: User preference or trait clarified
- UPDATE_SOUL: Lia's behavioral principle evolved
- UPDATE_IDENTITY: Identity metadata changed

Principles:
1. Quality > Quantity. Most turns yield NO_WRITE.
2. Conservatism. When in doubt, don't update.
3. Relational > Informational. Record relationship moments, not data.

Output JSON only with decision, reason, and candidate_fact.`;
```

**Step 2: 创建 analyzer.ts**

```typescript
import type { Logger } from '../types.js';
import type { MemoryGateInput, MemoryGateOutput } from './decision.js';
import { MEMORY_GATE_PROMPT } from './prompt.js';

export interface LLMClient {
  complete(prompt: string, systemPrompt: string): Promise<string>;
}

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
      const response = await this.llmClient.complete(prompt, MEMORY_GATE_PROMPT);
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

Analyze this turn and output JSON with decision, reason, and candidate_fact.`;
  }

  private parseResponse(response: string): MemoryGateOutput {
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/) || 
                       response.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : response;
      const parsed = JSON.parse(jsonStr);
      
      return {
        decision: parsed.decision,
        reason: parsed.reason,
        candidateFact: parsed.candidate_fact || parsed.candidateFact,
      };
    } catch (error) {
      return { decision: 'NO_WRITE', reason: 'Failed to parse LLM response' };
    }
  }
}
```

**Step 3: Commit**

```bash
git add src/memory-gate/
git commit -m "feat(memory-gate): add MemoryGate analyzer with LLM integration"
```

---

### Task 6: 创建 Memory Gate 主入口

**Files:**
- Create: `src/memory-gate/index.ts`

**Step 1: 创建文件**

```typescript
export { MemoryGateAnalyzer } from './analyzer.js';
export { MEMORY_GATE_PROMPT } from './prompt.js';
export type { 
  MemoryDecision, 
  MemoryGateInput, 
  MemoryGateOutput 
} from './decision.js';
```

**Step 2: Commit**

```bash
git add src/memory-gate/index.ts
git commit -m "feat(memory-gate): export MemoryGate public API"
```

---

## Phase 4: Daily Writer 模块

### Task 7: 创建 Daily Writer

**Files:**
- Create: `src/writers/daily-writer.ts`

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
git add src/writers/daily-writer.ts
git commit -m "feat(writers): add DailyWriter for memory/YYYY-MM-DD.md"
```

---

## Phase 5: File Curator 模块

### Task 8: 创建 File Curator

**Files:**
- Create: `src/writers/file-curator.ts`

**Step 1: 创建文件**

```typescript
import type { Logger } from '../types.js';
import type { MemoryGateOutput, MemoryDecision } from '../memory-gate/index.js';
import { readFile, writeFile } from '../utils/file-utils.js';
import * as path from 'path';

export interface FileCuratorConfig {
  workspaceDir: string;
}

export class FileCurator {
  private config: FileCuratorConfig;
  private logger: Logger;

  constructor(config: FileCuratorConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  async update(output: MemoryGateOutput): Promise<void> {
    const targetFile = this.getTargetFile(output.decision);
    if (!targetFile || !output.candidateFact) {
      return;
    }

    const filePath = path.join(this.config.workspaceDir, targetFile);
    
    try {
      const existingContent = await readFile(filePath) || '';
      const updatedContent = this.mergeContent(existingContent, output.candidateFact);
      
      await writeFile(filePath, updatedContent);
      
      this.logger.info('FileCurator', 'Updated file', {
        filePath,
        decision: output.decision,
      });
    } catch (error) {
      this.logger.error('FileCurator', 'Failed to update file', { error, filePath });
    }
  }

  private getTargetFile(decision: MemoryDecision): string | null {
    switch (decision) {
      case 'UPDATE_MEMORY':
        return 'MEMORY.md';
      case 'UPDATE_USER':
        return 'USER.md';
      case 'UPDATE_SOUL':
        return 'SOUL.md';
      case 'UPDATE_IDENTITY':
        return 'IDENTITY.md';
      default:
        return null;
    }
  }

  private mergeContent(existing: string, newFact: string): string {
    // Simple append for now - can be enhanced with LLM-based merging
    const timestamp = new Date().toISOString().split('T')[0];
    const entry = `- ${newFact} (${timestamp})\n`;
    
    if (!existing.trim()) {
      return `# MEMORY\n\n## Recent Updates\n${entry}`;
    }
    
    return existing + entry;
  }
}
```

**Step 2: Commit**

```bash
git add src/writers/file-curator.ts
git commit -m "feat(writers): add FileCurator for SOUL.md/USER.md/MEMORY.md/IDENTITY.md"
```

---

### Task 9: 创建 Writers 模块入口

**Files:**
- Create: `src/writers/index.ts`

**Step 1: 创建文件**

```typescript
export { DailyWriter } from './daily-writer.js';
export { FileCurator } from './file-curator.js';
```

**Step 2: Commit**

```bash
git add src/writers/index.ts
git commit -m "feat(writers): export Writers public API"
```

---

## Phase 6: 集成到主流程

### Task 10: 修改 Message Handler 集成 Memory Gate

**Files:**
- Modify: `src/message-handler.ts`

**Step 1: 添加 Memory Gate 调用**

```typescript
// 在文件顶部添加导入
import type { MemoryGateAnalyzer, MemoryGateOutput } from './memory-gate/index.js';
import type { DailyWriter, FileCurator } from './writers/index.js';

// 修改函数签名，添加可选参数
export function handleMessageSent(
  event: unknown,
  bufferManager: SessionBufferManager,
  logger: Logger,
  hookContext?: unknown,
  memoryGate?: MemoryGateAnalyzer,
  dailyWriter?: DailyWriter,
  fileCurator?: FileCurator,
): void {
  // ... 原有代码 ...
  
  bufferManager.push(sessionKey, message);
  
  // 异步触发 Memory Gate 分析
  if (memoryGate && dailyWriter && fileCurator) {
    triggerMemoryGate(
      sessionKey,
      bufferManager,
      message,
      memoryGate,
      dailyWriter,
      fileCurator,
      logger
    );
  }
}

// 新增函数
async function triggerMemoryGate(
  sessionKey: string,
  bufferManager: SessionBufferManager,
  latestMessage: ReflectionMessage,
  memoryGate: MemoryGateAnalyzer,
  dailyWriter: DailyWriter,
  fileCurator: FileCurator,
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
    } else if (output.decision.startsWith('UPDATE_')) {
      await fileCurator.update(output);
    }
  } catch (error) {
    logger.error('MessageHandler', 'Memory Gate processing failed', { error, sessionKey });
  }
}
```

**Step 2: Commit**

```bash
git add src/message-handler.ts
git commit -m "feat(message-handler): integrate Memory Gate, Daily Writer, File Curator"
```

---

### Task 11: 修改主入口初始化新模块

**Files:**
- Modify: `src/index.ts`

**Step 1: 添加导入**

```typescript
import { MemoryGateAnalyzer } from './memory-gate/index.js';
import { DailyWriter, FileCurator } from './writers/index.js';
```

**Step 2: 在 activate 函数中初始化**

```typescript
// 在 bufferManager 初始化后添加

let memoryGate: MemoryGateAnalyzer | null = null;
let dailyWriter: DailyWriter | null = null;
let fileCurator: FileCurator | null = null;

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

if (config.fileCurator.enabled) {
  fileCurator = new FileCurator(
    { workspaceDir: config.fileCurator.workspaceDir },
    runtimeFileLogger
  );
  gatewayLogger.info('[Reflection] File Curator initialized');
}
```

**Step 3: 修改 hook 注册，传入新模块**

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
      fileCurator || undefined,
    );
  }
});
```

**Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat(index): initialize Memory Gate, Daily Writer, File Curator"
```

---

## Phase 7: Consolidation 模块

### Task 12: 创建 Consolidation Scheduler

**Files:**
- Create: `src/consolidation/scheduler.ts`

**Step 1: 创建文件**

```typescript
import type { Logger } from '../types.js';
import { readFile, writeFile } from '../utils/file-utils.js';
import * as path from 'path';

export interface ConsolidationConfig {
  memoryDir: string;
  workspaceDir: string;
  schedule: string;
}

export class ConsolidationScheduler {
  private config: ConsolidationConfig;
  private logger: Logger;
  private timer: NodeJS.Timeout | null = null;

  constructor(config: ConsolidationConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  start(): void {
    // 简单的 setInterval 实现，生产环境可用 node-cron
    const intervalMs = 24 * 60 * 60 * 1000; // 24 小时
    
    this.timer = setInterval(() => {
      this.runConsolidation();
    }, intervalMs);
    
    this.logger.info('Consolidation', 'Scheduler started', {
      schedule: this.config.schedule,
    });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runConsolidation(): Promise<void> {
    this.logger.info('Consolidation', 'Running daily consolidation');
    
    try {
      // 读取近两天 daily memory
      // 提取稳定事实
      // 更新 MEMORY.md / USER.md
      // 归档旧文件
      
      this.logger.info('Consolidation', 'Completed successfully');
    } catch (error) {
      this.logger.error('Consolidation', 'Failed', { error });
    }
  }
}
```

**Step 2: Commit**

```bash
git add src/consolidation/
git commit -m "feat(consolidation): add ConsolidationScheduler skeleton"
```

---

## Phase 8: 测试

### Task 13: 创建测试框架

**Files:**
- Create: `tests/memory-gate.test.ts`

**Step 1: 创建测试**

```typescript
import { describe, it, expect } from 'vitest';
import { MemoryGateAnalyzer } from '../src/memory-gate/analyzer.js';
import type { Logger } from '../src/types.js';

const mockLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

describe('MemoryGateAnalyzer', () => {
  it('should return NO_WRITE for empty conversation', async () => {
    const analyzer = new MemoryGateAnalyzer(
      { complete: async () => '{"decision": "NO_WRITE", "reason": "test"}' },
      mockLogger
    );
    
    const result = await analyzer.analyze({
      recentMessages: [],
      currentUserMessage: 'hello',
      currentAgentReply: 'hi',
    });
    
    expect(result.decision).toBe('NO_WRITE');
  });
});
```

**Step 2: Commit**

```bash
git add tests/
git commit -m "test: add Memory Gate test skeleton"
```

---

## 总结

**已完成任务：**
1. ✅ 配置扩展（types.ts, config.ts）
2. ✅ 工具模块（file-utils.ts）
3. ✅ Memory Gate 模块（decision, analyzer, prompt, index）
4. ✅ Daily Writer 模块
5. ✅ File Curator 模块
6. ✅ 集成到主流程（message-handler.ts, index.ts）
7. ✅ Consolidation 模块骨架
8. ✅ 测试框架

**下一步：**
- 实现 LLMClient（用于实际调用模型）
- 完善 Consolidation 逻辑
- 添加更多测试
- 运行集成测试

**执行方式选择：**
1. **Subagent-Driven** - 在当前会话中，我为每个任务派遣子代理
2. **Parallel Session** - 开启新会话批量执行

师兄选择哪种方式？💗