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

### 1.1 确认插件位置

```bash
# 插件应位于 OpenClaw 的 plugins 目录
# 标准路径：~/.openclaw/plugins/ 或 workspace 的相对路径

# 检查当前插件位置
ls -la ~/.openclaw/plugins/openclaw-reflection-plugin 2>/dev/null \
  || ls -la /opt/homebrew/lib/node_modules/openclaw/plugins/ 2>/dev/null \
  || echo "需要手动配置插件路径"
```

### 1.2 OpenClaw 配置

编辑 `~/.openclaw/config.yaml`：

```yaml
plugins:
  # 方式1: 本地路径
  - path: /Users/dnq/.openclaw/workspace/repo/openclaw-reflection-plugin
    config:
      bufferSize: 50
      sessionTTL: 300000  # 5分钟，方便测试
      logLevel: debug

  # 方式2: npm 包名（发布后）
  # - package: openclaw-reflection-plugin
  #   config:
  #     bufferSize: 100
```

### 1.3 插件清单确认

确保 `openclaw.plugin.json`：

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

---

## Phase 2: 启动验证

### 2.1 构建并重启 Gateway

```bash
cd /Users/dnq/.openclaw/workspace/repo/openclaw-reflection-plugin

# 1. 重新构建
npm run build

# 2. 重启 OpenClaw Gateway
openclaw gateway restart

# 3. 检查插件是否加载
openclaw gateway logs | grep -i reflection
```

### 2.2 预期日志输出

```
[2024-03-04T10:00:00.000Z] [info] [Plugin] Reflection plugin registered
[2024-03-04T10:00:00.001Z] [info] [Plugin] bufferSize: 50, sessionTTL: 300000, logLevel: debug
[2024-03-04T10:00:00.002Z] [info] [Plugin] Hooks registered successfully
```

---

## Phase 3: E2E 测试场景

### 场景 A: 基础消息捕获

**步骤：**
1. 向 Bot 发送消息
2. 等待 Bot 回复
3. 验证 buffer 和日志

**发送测试消息：**
```bash
# 通过 Telegram/Discord 发送: "测试消息 123"
```

**验证 Buffer：**
```bash
# 方法1: 通过插件暴露的 tool（如果实现）
# 需要在 plugin 中注册 tool

# 方法2: 直接查看日志
ls -la logs/
cat logs/reflection-$(date +%Y-%m-%d).log | jq .
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

**配置：**
```yaml
bufferSize: 3  # 故意设小，方便观察驱逐
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

**配置：**
```yaml
sessionTTL: 10000  # 10秒，方便测试
```

**步骤：**
1. 重启 Gateway
2. 发送消息建立 session
3. 等待 10+ 秒
4. 触发 cleanup（发送新消息或等待定时任务）
5. 验证 session 被清理

**预期日志：**
```json
{
  "timestamp": "...",
  "level": "info",
  "component": "SessionBufferManager",
  "event": "Expired session cleaned up",
  "details": {
    "sessionKey": "..."
  }
}
```

### 场景 D: Session 结束清理

**步骤：**
1. 正常对话几轮
2. 使用 `/reset` 或结束会话
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

### 4.2 Buffer 状态查询（需要 Plugin 支持）

扩展 plugin 暴露查询 API：

```typescript
// index.ts
export function register(api: PluginAPI): void {
  // ... 现有代码 ...
  
  // 暴露查询接口（如果 Plugin API 支持）
  if (api.registerTool) {
    api.registerTool('reflection.getBuffer', {
      handler: async (params: { sessionKey?: string }) => {
        const key = params.sessionKey ?? 'current';
        return {
          sessionKey: key,
          messageCount: bufferManager?.getMessages(key).length ?? 0,
          messages: bufferManager?.getMessages(key) ?? [],
        };
      },
    });
  }
}
```

### 4.3 实时监控命令

```bash
# 实时查看日志
tail -f logs/reflection-$(date +%Y-%m-%d).log | jq .

# 过滤特定 session
tail -f logs/reflection-$(date +%Y-%m-%d).log | jq 'select(.sessionKey == "main:telegram:5847030824")'

# 统计消息数量
cat logs/reflection-$(date +%Y-%m-%d).log | jq -s 'group_by(.sessionKey) | map({session: .[0].sessionKey, count: length})'
```

---

## Phase 5: 故障排查

### 问题：插件未加载

**检查清单：**
1. Gateway 是否重启？
2. 插件路径是否正确？
3. `openclaw.plugin.json` 是否存在？
4. `dist/index.js` 是否已构建？

**调试命令：**
```bash
openclaw gateway logs --follow
openclaw plugins list  # 如果有此命令
```

### 问题：Hook 未触发

**检查清单：**
1. Gateway 版本是否支持 hooks？
2. Hook 名称是否正确？(`message:received`, `message:sent`)
3. 事件格式是否匹配？

### 问题：日志未写入

**检查清单：**
1. 插件目录是否有写权限？
2. `logs/` 目录是否被创建？
3. logLevel 是否设为 `debug`？

**修复：**
```bash
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
| Gateway 启动无报错 | ⬜ | `openclaw gateway logs` |
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

*E2E Plan by Lia* 🌸
