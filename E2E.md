# OpenClaw Reflection Plugin - E2E 测试与部署方案

## 目标

在 OpenClaw 中完整运行 reflection-plugin，验证：
1. ✅ 最新对话消息进入 buffer
2. ✅ 日志正常工作
3. ✅ 配置生效

---

## 架构流程

```
┌─────────────────────────────────────────────────────────────────────┐
│                        OpenClaw Gateway                              │
│                                                                      │
│  ┌─────────────────────┐     ┌─────────────────────────────────┐   │
│  │   Reflection        │     │                                 │   │
│  │   Plugin            │◄────┤  message:received (用户消息)    │   │
│  │                     │     │  message:sent (AI 回复)         │   │
│  │  ┌───────────────┐  │     │  session:end (会话结束)         │   │
│  │  │ Circular      │  │     │                                 │   │
│  │  │ Buffer        │  │     └─────────────────────────────────┘   │
│  │  └───────┬───────┘  │                                           │
│  │          │          │     ┌─────────────────────────────────┐   │
│  │          ▼          │     │  File System                     │   │
│  │  ┌───────────────┐  │     │  ├── logs/reflection-YYYY-MM.log │   │
│  │  │ Session       │  │────►│  └── logs/ (自动创建)            │   │
│  │  │ Manager       │  │     └─────────────────────────────────┘   │
│  │  └───────────────┘  │                                           │
│  └─────────────────────┘                                           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  验证方式                                                            │
│  1. 发送测试消息 → 查看 buffer 内容                                  │
│  2. 检查日志文件 → 确认消息记录                                      │
│  3. 触发 session:end → 确认清理                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: 插件部署

### 1.1 确认插件 ID

编辑 `openclaw.plugin.json`，确认插件 ID：

```json
{
  "id": "reflection-plugin",
  "entry": "dist/index.js",
  "configSchema": {
    "type": "object",
    "properties": {
      "bufferSize": {
        "type": "integer",
        "minimum": 1,
        "default": 100
      },
      "sessionTTL": {
        "type": "integer",
        "minimum": 1,
        "default": 3600000
      },
      "logLevel": {
        "type": "string",
        "enum": ["debug", "info", "warn", "error"],
        "default": "info"
      }
    }
  }
}
```

### 1.2 OpenClaw 配置

编辑 `~/.openclaw/openclaw.json`：

```json
{
  "plugins": {
    "entries": {
      "reflection-plugin": {
        "enabled": true,
        "config": {
          "bufferSize": 50,
          "sessionTTL": 300000,
          "logLevel": "debug"
        }
      }
    },
    "load": {
      "paths": [
        "/Users/dnq/.openclaw/workspace/repo/openclaw-reflection-plugin"
      ]
    }
  }
}
```

**关键配置说明：**

| 配置项 | 说明 |
|--------|------|
| `plugins.entries.<id>` | 必须与 `openclaw.plugin.json` 中的 `id` 完全一致 |
| `plugins.entries.<id>.enabled` | 启用/禁用插件 |
| `plugins.entries.<id>.config` | 插件自定义配置，根据 `configSchema` 校验 |
| `plugins.load.paths` | 本地插件路径数组，OpenClaw 会从这些路径加载插件 |

### 1.3 构建插件

```bash
cd /Users/dnq/.openclaw/workspace/repo/openclaw-reflection-plugin

# 安装依赖
npm install

# 构建 TypeScript
npm run build

# 确认输出文件存在
ls -la dist/index.js
```

---

## Phase 2: 启动验证

### 2.1 重启 Gateway

```bash
# 重启 OpenClaw Gateway
openclaw gateway restart

# 或前台启动查看日志
openclaw gateway --verbose
```

### 2.2 验证插件加载

查看 Gateway 日志，确认插件已加载：

```bash
# 查看 Gateway 日志（macOS）
tail -f ~/Library/Logs/openclaw/gateway.log

# 或使用 openclaw 命令
openclaw gateway health
```

**预期输出：**
```
[info] Plugin loaded: reflection-plugin
[info] Reflection plugin registered
[info] bufferSize: 50, sessionTTL: 300000, logLevel: debug
[info] Hooks registered successfully
```

### 2.3 验证配置生效

检查配置是否正确传入：

```bash
# 查看 Gateway 配置
openclaw gateway call config.get '{"key": "plugins"}'
```

---

## Phase 3: E2E 测试场景

### 场景 A: 基础消息捕获

**步骤：**
1. 向 Bot 发送消息
2. 等待 Bot 回复
3. 验证 buffer 和日志

**发送测试消息：**
```
用户: 测试消息 123
```

**验证日志：**

插件日志文件位置：`/Users/dnq/.openclaw/workspace/repo/openclaw-reflection-plugin/logs/reflection-YYYY-MM-DD.log`

```bash
# 查看最新日志
tail -20 logs/reflection-$(date +%Y-%m-%d).log | jq .
```

**预期日志条目：**
```json
{
  "timestamp": "2024-03-04T10:05:00.123Z",
  "level": "debug",
  "component": "MessageHandler",
  "event": "Message received",
  "sessionKey": "main:telegram:5847030824",
  "details": {
    "sessionKey": "main:telegram:5847030824",
    "channelId": "telegram:5847030824",
    "hasContent": true
  }
}
{
  "timestamp": "2024-03-04T10:05:00.456Z",
  "level": "debug",
  "component": "SessionBufferManager",
  "event": "Message pushed to buffer",
  "sessionKey": "main:telegram:5847030824",
  "details": {
    "messageId": "01HQ1234567890ABCDEF",
    "bufferSize": 1
  }
}
{
  "timestamp": "2024-03-04T10:05:02.789Z",
  "level": "debug",
  "component": "MessageHandler",
  "event": "Message sent",
  "sessionKey": "main:telegram:5847030824",
  "details": {
    "sessionKey": "main:telegram:5847030824",
    "channelId": "telegram:5847030824",
    "hasContent": true
  }
}
```

### 场景 B: 缓冲区定长验证

**修改配置：**
```json
{
  "plugins": {
    "entries": {
      "reflection-plugin": {
        "enabled": true,
        "config": {
          "bufferSize": 3,
          "sessionTTL": 300000,
          "logLevel": "debug"
        }
      }
    },
    "load": {
      "paths": [
        "/Users/dnq/.openclaw/workspace/repo/openclaw-reflection-plugin"
      ]
    }
  }
}
```

**步骤：**
1. 重启 Gateway
2. 连续发送 5 条消息
3. 验证只有最新 3 条在 buffer

**验证命令：**
```bash
# 发送 5 条消息，然后检查日志
cat logs/reflection-$(date +%Y-%m-%d).log | grep "Evicted oldest message"
```

**预期输出：**
```json
{
  "timestamp": "...",
  "level": "debug",
  "component": "SessionBufferManager",
  "event": "Evicted oldest message",
  "details": {
    "evictedId": "..."
  }
}
```

### 场景 C: Session TTL 清理

**修改配置：**
```json
{
  "plugins": {
    "entries": {
      "reflection-plugin": {
        "enabled": true,
        "config": {
          "bufferSize": 50,
          "sessionTTL": 10000,
          "logLevel": "debug"
        }
      }
    }
  }
}
```

**步骤：**
1. 重启 Gateway
2. 发送消息建立 session
3. 等待 10+ 秒（不发送新消息）
4. 发送新消息触发 cleanup
5. 验证 session 被清理

**预期日志：**
```json
{
  "timestamp": "...",
  "level": "info",
  "component": "SessionBufferManager",
  "event": "Expired session cleaned up",
  "details": {
    "sessionKey": "...",
    "cleanedCount": 1
  }
}
```

### 场景 D: Session 结束清理

**步骤：**
1. 正常对话几轮
2. 使用 `/reset` 或 `/new` 结束会话
3. 验证 buffer 被清理

**预期日志：**
```json
{
  "timestamp": "...",
  "level": "info",
  "component": "MessageHandler",
  "event": "Session ended, clearing buffer",
  "details": {
    "sessionKey": "..."
  }
}
{
  "timestamp": "...",
  "level": "info",
  "component": "SessionBufferManager",
  "event": "Session cleared",
  "details": {
    "sessionKey": "..."
  }
}
```

---

## Phase 4: 验证工具

### 4.1 日志查看脚本

创建 `scripts/check-logs.sh`：

```bash
#!/bin/bash
PLUGIN_DIR="/Users/dnq/.openclaw/workspace/repo/openclaw-reflection-plugin"
LOG_FILE="$PLUGIN_DIR/logs/reflection-$(date +%Y-%m-%d).log"

echo "=== Reflection Plugin Logs ==="
echo "Log file: $LOG_FILE"
echo ""

if [ ! -f "$LOG_FILE" ]; then
  echo "❌ Log file not found"
  exit 1
fi

echo "=== Recent Messages ==="
tail -20 "$LOG_FILE" | jq -r '[.timestamp, .level, .component, .event] | @tsv'

echo ""
echo "=== Session Count ==="
cat "$LOG_FILE" | jq -r '.sessionKey' | grep -v null | sort | uniq | wc -l

echo ""
echo "=== Buffer Operations ==="
cat "$LOG_FILE" | jq 'select(.event | contains("pushed") or contains("evicted")) | {timestamp, event, details}'
```

### 4.2 实时监控命令

```bash
cd /Users/dnq/.openclaw/workspace/repo/openclaw-reflection-plugin

# 实时查看日志
tail -f logs/reflection-$(date +%Y-%m-%d).log | jq .

# 过滤特定 session
tail -f logs/reflection-$(date +%Y-%m-%d).log | jq 'select(.sessionKey == "main:telegram:5847030824")'

# 统计消息数量
cat logs/reflection-$(date +%Y-%m-%d).log | jq -s 'group_by(.sessionKey) | map({session: .[0].sessionKey, count: length})'

# 查看特定级别以上的日志
cat logs/reflection-$(date +%Y-%m-%d).log | jq 'select(.level == "info" or .level == "warn" or .level == "error")'
```

---

## Phase 5: 故障排查

### 问题：插件未加载

**检查清单：**
1. Gateway 是否重启？
2. `openclaw.plugin.json` 中的 `id` 是否与 `openclaw.json` 中的 key 匹配？
3. `plugins.load.paths` 路径是否正确？
4. `dist/index.js` 是否已构建？

**调试命令：**
```bash
# 查看 Gateway 启动日志
openclaw gateway --verbose

# 检查插件配置
openclaw config get plugins

# 验证文件存在
ls -la /Users/dnq/.openclaw/workspace/repo/openclaw-reflection-plugin/dist/index.js
ls -la /Users/dnq/.openclaw/workspace/repo/openclaw-reflection-plugin/openclaw.plugin.json
```

### 问题：配置未生效

**检查清单：**
1. `plugins.entries.<id>.config` 中的配置项名称是否正确？
2. 配置值类型是否符合 `configSchema`？
3. 是否重启了 Gateway？

**修复示例：**
```json
{
  "plugins": {
    "entries": {
      "reflection-plugin": {
        "enabled": true,
        "config": {
          "bufferSize": 50,
          "sessionTTL": 300000,
          "logLevel": "debug"
        }
      }
    }
  }
}
```

### 问题：Hook 未触发

**检查清单：**
1. Gateway 版本是否支持 hooks？
2. Hook 名称是否正确？(`message:received`, `message:sent`)
3. 插件是否成功注册？查看 `register()` 是否执行

**调试：**
在 `index.ts` 中添加调试日志：
```typescript
console.log('[Reflection] Registering hooks...');
api.hooks.on('message:received', (event) => {
  console.log('[Reflection] Received event:', event);
  // ...
});
```

### 问题：日志未写入

**检查清单：**
1. 插件目录是否有写权限？
2. `logs/` 目录是否被创建？
3. `logLevel` 是否设为 `debug`？

**修复：**
```bash
cd /Users/dnq/.openclaw/workspace/repo/openclaw-reflection-plugin
mkdir -p logs
chmod 755 logs
```

### 问题：Buffer 为空

**检查清单：**
1. sessionKey 是否正确提取？
2. 消息是否正常进入 handler？
3. 是否有错误被吞掉？

---

## 成功标准

| 检查项 | 状态 | 验证方式 |
|--------|------|----------|
| Gateway 启动无报错 | ⬜ | `openclaw gateway --verbose` |
| Plugin 成功注册 | ⬜ | 日志中出现 "Reflection plugin registered" |
| 收到用户消息 | ⬜ | 日志中出现 "Message received" |
| AI 回复被记录 | ⬜ | 日志中出现 "Message sent" |
| Buffer 正确存储 | ⬜ | bufferSize 变化符合预期 |
| 过期 Session 清理 | ⬜ | 日志中出现 "Expired session cleaned up" |
| Session 结束清理 | ⬜ | `/reset` 后 buffer 被清理 |
| 日志文件正常写入 | ⬜ | `logs/reflection-*.log` 存在且有内容 |

---

## 附录：Hook 事件格式参考

### message:received

```typescript
{
  type: 'message',
  action: 'received',
  sessionKey: 'main:telegram:5847030824',
  timestamp: Date,
  context: {
    from: '5847030824',           // 发送者 ID
    content: '你好',               // 消息内容
    channelId: 'telegram:5847030824',
    accountId: 'default',
    timestamp: 1709521200123,
  }
}
```

### message:sent

```typescript
{
  type: 'message',
  action: 'sent',
  sessionKey: 'main:telegram:5847030824',
  timestamp: Date,
  context: {
    to: '5847030824',             // 接收者 ID
    text: '你好！有什么可以帮你的？', // AI 回复内容
    success: true,
    channel: 'telegram',
  }
}
```

### session:end

```typescript
{
  type: 'session',
  action: 'end',
  sessionKey: 'main:telegram:5847030824',
  timestamp: Date,
  context: {
    reason?: 'user_reset' | 'ttl_expired'
  }
}
```

---

## 附录：配置参考

### 完整 openclaw.json 示例

```json
{
  "gateway": {
    "port": 18789,
    "mode": "local"
  },
  "plugins": {
    "entries": {
      "reflection-plugin": {
        "enabled": true,
        "config": {
          "bufferSize": 100,
          "sessionTTL": 3600000,
          "logLevel": "info"
        }
      }
    },
    "load": {
      "paths": [
        "/Users/dnq/.openclaw/workspace/repo/openclaw-reflection-plugin"
      ]
    }
  }
}
```

### 配置项说明

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `bufferSize` | integer | 100 | 每个会话的缓冲区大小 |
| `sessionTTL` | integer | 3600000 | Session 过期时间（毫秒） |
| `logLevel` | string | "info" | 日志级别：debug/info/warn/error |

---

*E2E Plan v2.0 by Lia* 🌸
