# OpenClaw Plugin 开发笔记

> 学习来源：官方文档 https://docs.openclaw.ai/tools/plugin
> 搜索验证：多个来源交叉确认
> 笔记时间：2026-03-03
> 更新时间：2026-03-04（补充 Hooks 事件完整列表）
> 说明：如有不清楚之处，请参考上述元文档链接

---

## 核心概念

### Plugin vs Skill 的区别

| 特性 | Skill | Plugin |
|------|-------|--------|
| 形式 | SKILL.md 文件 | TypeScript/JavaScript 模块 |
| 加载方式 | 静态文档 | 运行时通过 jiti 加载 |
| 运行位置 | Agent 上下文 | Gateway 进程内 |
| 能力 | 自然语言驱动 | 深度 Gateway 扩展 |
| 配置验证 | 无需验证 | JSON Schema |

### Plugins 核心特点

1. **运行时加载** - OpenClaw 通过 `jiti` 在运行时直接加载 TypeScript，开发时无需编译
2. **同进程运行** - Plugins 与 Gateway 在同一个进程中运行，属于**可信代码**
3. **注册能力** - 可以注册 Tools、Hooks、Channels、Model Providers、Auto-reply Commands

---

## 插件目录结构

```
my-plugin/
├── openclaw.plugin.json    # 插件清单（必需）
├── index.ts                # 入口文件（必需）
└── package.json            # npm 包配置（可选，用于发布到 npm）
```

---

## 1. Manifest 文件 (openclaw.plugin.json)

### 完整字段说明

```json
{
  "id": "my-plugin",
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "apiKey": { "type": "string" },
      "region": { "type": "string" }
    }
  },
  "uiHints": {
    "apiKey": { "label": "API Key", "sensitive": true },
    "region": { "label": "Region", "placeholder": "us-east-1" }
  },
  "configPatch": {
    "tools": {
      "web": {
        "search": { "provider": "perplexity" }
      }
    }
  }
}
```

### 字段详解

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 插件唯一标识符 |
| `services` | string[] | 可选 | 注册的服务名列表 |
| `configSchema` | JSON Schema | 可选 | 配置项的 JSON Schema 验证 |
| `uiHints` | object | 可选 | UI 提示：标签、占位符、敏感标记 |
| `configPatch` | object | 可选 | 安装时自动合并到用户配置 |

### uiHints 格式

```json
{
  "uiHints": {
    "fieldName": {
      "label": "显示标签",
      "placeholder": "占位提示",
      "sensitive": true
    }
  }
}
```

- `sensitive: true` - 标记为敏感字段（如 API Key），UI 会加密显示

### configPatch 用途

用于插件安装时自动修改用户配置，例如设置默认工具提供商：

```json
{
  "configPatch": {
    "tools": {
      "web": {
        "search": { "provider": "perplexity" }
      }
    }
  }
}
```

---

## 2. 入口文件 (index.ts)

### 基础结构

每个插件必须导出一个 `register` 函数：

```typescript
export default function register(api: OpenClawPluginApi) {
  // 注册各种组件...
}
```

### API 对象方法

根据搜索结果，插件可以通过 `api` 对象注册以下内容：

#### 注册 Channel

```typescript
export default function register(api) {
  api.registerChannel({
    plugin: myChannel
  });
}
```

Channel 插件需要提供完整的通道实现，包括入站和出站消息处理。

#### 注册 Model Provider

```typescript
api.registerProvider({
  id: 'my-provider',
  auth: {
    type: 'apiKey',
    fields: [{ name: 'apiKey', sensitive: true }]
  }
});
```

Providers 可以注册认证流程，用户可以在 OpenClaw 内部完成 OAuth 或 API Key 设置。

#### 注册 Hooks

```typescript
api.registerHook('session:start', async (ctx) => {
  console.log('Session started:', ctx.sessionId);
});
```

**完整 Hooks 事件列表：**

| 事件名称 | 触发时机 | 上下文数据 |
|----------|----------|------------|
| `command:new` | 用户执行 `/new` 命令 | `{ sessionId, sessionKey? }` |
| `command:reset` | 用户执行 `/reset` 命令 | `{ sessionId, sessionKey? }` |
| `command:stop` | 用户执行 `/stop` 命令 | `{ sessionId, sessionKey? }` |
| `session:start` | 新会话开始时 | `{ sessionId, sessionKey }` |
| `session:end` | 会话结束时 | `{ sessionId, sessionKey }` |
| `message:received` | 收到入站消息时 | `{ from, content, timestamp?, channelId, accountId? }` |
| `message:preprocessed` | 消息预处理完成（媒体/链接理解后，Agent 处理前） | 完整消息上下文 |
| `message:sent` | 出站消息发送成功时 | `{ sessionKey?, ... }` |

**计划/讨论中的事件：**

| 事件名称 | 状态 | 说明 |
|----------|------|------|
| `gateway:shutdown` | 📝 Feature Request | Gateway 关闭时 |
| `gateway:pre-restart` | 📝 Feature Request | Gateway 重启前 |
| `skill:pre-install` | 📝 Feature Request | Skill 安装前（阻塞式） |
| `skill:post-install` | 📝 Feature Request | Skill 安装后（观察式） |
| `tool:before_call` | 🔧 内部讨论中 | 工具调用前 |
| `tool:after_call` | 🔧 内部讨论中 | 工具调用后 |

**注意：** Plugin 注册的 hooks 不能通过 `openclaw hooks` CLI 单独管理，需要通过启用/禁用整个 plugin 来控制。

**Hooks 上下文数据详情：**

```typescript
// command:* 事件上下文
{
  sessionId: string;      // 会话 ID
  sessionKey?: string;    // 会话密钥（用于路由身份关联）
}

// session:* 事件上下文
{
  sessionId: string;      // 会话 ID
  sessionKey: string;     // 会话密钥
}

// message:received 事件上下文
{
  from: string;           // 发送者标识（手机号、用户 ID 等）
  content: string;        // 消息内容
  timestamp?: number;     // Unix 时间戳（毫秒）
  channelId: string;      // 通道 ID（whatsapp/telegram/discord 等）
  accountId?: string;     // 账户 ID
}

// message:sent 事件上下文
{
  sessionKey?: string;    // 会话密钥（v2026.3.2+ 开始包含）
  // ... 其他消息相关字段
}

// tool:after_call 事件上下文（讨论中）
{
  toolName: string;       // 工具名称
  params: object;         // 调用参数
  result?: any;           // 返回结果
  error?: Error;          // 错误信息
  durationMs: number;     // 执行耗时
}
```

**版本变更：**
- **v2026.3.2+**: `session:start` 和 `session:end` 事件开始包含 `sessionKey`，方便插件关联生命周期回调与路由身份。

#### 注册 Tools

```typescript
api.registerTool({
  name: 'my_tool',
  description: 'Does something useful',
  parameters: {
    type: 'object',
    properties: {
      input: { type: 'string' }
    }
  },
  async execute(args) {
    return { result: `Processed: ${args.input}` };
  }
});
```

#### 注册 Auto-reply Commands

可以注册不需要调用 AI Agent 就能执行的命令。

### api.runtime 辅助函数

Plugins 可以通过 `api.runtime` 访问选定的核心辅助函数。

---

## 3. package.json 配置

### 基本 openclaw 字段

```json
{
  "name": "@myname/my-plugin",
  "openclaw": {
    "extensions": ["./src/index.ts"]
  }
}
```

### Channel 插件专用配置

Channel 插件可以在 package.json 中声明 onboarding 元数据：

```json
{
  "name": "@openclaw/nextcloud-talk",
  "openclaw": {
    "extensions": ["./index.ts"],
    "channel": {
      "id": "nextcloud-talk",
      "label": "Nextcloud Talk",
      "selectionLabel": "Nextcloud Talk (self-hosted)",
      "docsPath": "/channels/nextcloud-talk",
      "docsLabel": "nextcloud-talk",
      "blurb": "Self-hosted chat via Nextcloud Talk webhook bots.",
      "order": 65,
      "aliases": ["nc-talk", "nc"]
    },
    "install": {
      "npmSpec": "@openclaw/nextcloud-talk",
      "localPath": "extensions/nextcloud-talk",
      "defaultChoice": "npm"
    }
  }
}
```

### Channel 字段说明

| 字段 | 说明 |
|------|------|
| `id` | 通道唯一标识 |
| `label` | 显示名称 |
| `selectionLabel` | 选择时的标签（可包含补充说明） |
| `docsPath` | 文档路径 |
| `docsLabel` | 文档标签 |
| `blurb` | 简短描述 |
| `order` | 排序权重 |
| `aliases` | 别名列表 |

### Install 字段说明

| 字段 | 说明 |
|------|------|
| `npmSpec` | npm 包名 |
| `localPath` | 本地路径 |
| `defaultChoice` | 默认安装方式 (`npm` 或 `local`) |

---

## 4. 插件安装与管理

### CLI 命令

```bash
# 从本地路径安装
openclaw plugins install ./my-plugin

# 从 npm 安装
openclaw plugins install @scope/plugin-name

# 查看已安装插件
openclaw plugins list

# 查看插件详情
openclaw plugins info <id>

# 卸载插件
openclaw plugins uninstall <id>
```

### 开发时快速路径

开发测试时，可以直接将 `.ts` 文件放入全局扩展目录：

```
~/.openclaw/extensions/my-plugin.ts
```

这种方式适合快速原型开发，无需打包。

---

## 5. 开发工作流

### 开发模式

```bash
# 克隆 OpenClaw 仓库
git clone https://github.com/openclaw/openclaw.git
cd openclaw

# 安装依赖
pnpm install

# 构建 UI
pnpm ui:build

# 构建项目
pnpm build

# 开发模式（自动重载）
pnpm gateway:watch
```

### TypeScript 支持

OpenClaw 使用 `jiti` 在运行时直接加载 TypeScript，**开发时无需编译**。`dist/` 构建仅在发布到 npm 时需要。

### 使用 Bun（可选）

Bun 可用于直接运行 TypeScript：

```bash
bun <file.ts>
bunx <tool>
```

---

## 6. Plugin SDK

### SDK 路径

- **位置**: `dist/plugin-sdk/`
- **内容**: TypeScript 类型、验证工具、基础接口

### 使用方式

插件可以通过 `import type` 使用 SDK，无需打包整个 OpenClaw 代码库：

```typescript
import type { OpenClawPluginApi, ToolDefinition } from 'moltbot/plugin-sdk';
```

### SDK 提供的能力

- TypeScript 类型定义
- 验证工具
- 基础接口（所有 slot 类型）

---

## 7. 最佳实践

### 依赖管理

- 保持依赖树"纯 JS/TS"
- **避免**使用需要 postinstall 构建的包

### 错误处理

- 注册错误会被捕获并记录
- 单个插件的错误**不会**导致其他插件崩溃

### 配置验证

- 使用 JSON Schema 进行配置验证
- 配置验证**不执行**插件代码

### 安全

- Plugins 是**可信代码**（与 Gateway 同进程）
- 只从审查过的来源安装插件

### Hook 管理

- 不能通过 `openclaw hooks` 单独启用/禁用 plugin 管理的 hooks
- 需要启用/禁用整个 plugin

---

## 8. 注册错误处理

根据搜索结果，插件注册时的错误处理机制：

1. 注册错误会被捕获并记录
2. 错误不会导致其他插件崩溃
3. 所有注册的工具、hooks、channels、providers 等都可以被追踪

---

## 参考链接

| 资源 | 链接 | 说明 |
|------|------|------|
| 官方文档 | https://docs.openclaw.ai/tools/plugin | 权威参考 |
| 社区文档 | https://www.learnclawdbot.org/docs/plugin | 补充说明 |
| 示例项目 | https://github.com/soimy/openclaw-channel-dingtalk | 钉钉 Channel 插件 |
| 教程 | https://lumadock.com/tutorials/openclaw-custom-api-integration-guide | 实战指南 |
| npm 包 | https://www.npmjs.com/package/openclaw | CLI 工具 |

---

## 待确认/待补充

以下信息在搜索结果中未找到详细说明，如需使用请参考官方文档或源码：

1. `api.registerTool()` 的完整参数签名（`parameters` 结构、`execute` 返回类型）
2. `api.runtime` 提供的具体辅助函数（已知有 `stt.transcribeAudioFile()`）
3. Channel 插件的完整接口定义
4. Auto-reply Commands 的注册方式

---

*笔记更新时间：2026-03-04*  
*作者：Lia*  
*如有疑问，请优先参考 https://docs.openclaw.ai/tools/plugin*
