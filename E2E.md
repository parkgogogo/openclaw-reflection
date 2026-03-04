# OpenClaw Reflection Plugin - E2E 验证指南

## 概述

本指南用于在实际运行的 OpenClaw 环境中验证 reflection-plugin 的功能。

**验证目标：**
- [ ] 插件成功加载
- [ ] 用户消息进入 buffer
- [ ] AI 回复进入 buffer
- [ ] 日志正常写入
- [ ] Session 结束正确清理

---

## 角色分工

| 角色 | 职责 |
|------|------|
| **运维 (Lia)** | 修改配置、重启 Gateway、检查日志 |
| **用户 (师兄)** | 发送测试消息、执行命令、确认结果 |

---

## Phase 1: 插件配置与部署

### Step 1.1: 确认插件代码已更新

**执行者:** 运维  
**操作:**
```bash
cd /Users/dnq/.openclaw/workspace/repo/openclaw-reflection-plugin
git pull origin main
ls -la src/
```

**确认清单:**
- [ ] 代码已更新到最新 main 分支
- [ ] `src/index.ts` 存在
- [ ] `openclaw.plugin.json` 存在

**师兄确认:** _____________

---

### Step 1.2: 配置 OpenClaw

**执行者:** 运维  
**操作:** 编辑 `~/.openclaw/openclaw.json`

添加 plugins 配置:
```json
{
  "plugins": {
    "entries": {
      "reflection-plugin": {
        "enabled": true,
        "config": {
          "bufferSize": 10,
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

**确认清单:**
- [ ] `openclaw.json` 已修改
- [ ] `reflection-plugin` ID 正确
- [ ] `load.paths` 指向正确目录
- [ ] `bufferSize` 设为 10（方便测试驱逐）
- [ ] `logLevel` 设为 `debug`

**师兄确认:** _____________

---

### Step 1.3: 重启 Gateway

**执行者:** 运维  
**操作:**
```bash
openclaw gateway restart
```

**等待 5 秒后检查:**
```bash
openclaw gateway health
```

**确认清单:**
- [ ] Gateway 重启成功
- [ ] health 检查返回正常

**师兄确认:** _____________

---

### Step 1.4: 验证插件加载

**执行者:** 运维  
**操作:**
```bash
tail -50 ~/Library/Logs/openclaw/gateway.log 2>/dev/null | grep -i reflection
```

**预期输出:**
```
[info] Plugin loaded: reflection-plugin
[info] Reflection plugin registered
[info] bufferSize: 10, logLevel: debug
[info] Hooks registered successfully
```

**确认清单:**
- [ ] 日志中出现 "Plugin loaded: reflection-plugin"
- [ ] 日志中出现 "Reflection plugin registered"
- [ ] bufferSize 显示为 10

**师兄确认:** _____________

---

## Phase 2: 基础功能验证

### Step 2.1: 发送第一条测试消息

**执行者:** 用户  
**操作:** 在当前对话中发送消息：
```
测试消息 1
```

**确认清单:**
- [ ] 消息成功发送
- [ ] Bot 有回复

**运维确认:** _____________

---

### Step 2.2: 检查消息是否被记录

**执行者:** 运维  
**操作:**
```bash
cd /Users/dnq/.openclaw/workspace/repo/openclaw-reflection-plugin
tail -20 logs/reflection-$(date +%Y-%m-%d).log 2>/dev/null | jq .
```

**预期看到:**
- `event: "Message received"` - 用户消息
- `event: "Message pushed to buffer"` - 消息进入 buffer
- `event: "Message sent"` - AI 回复
- `bufferSize: 1`

**确认清单:**
- [ ] 日志中出现 "Message received"
- [ ] 日志中出现 "Message pushed to buffer"
- [ ] 日志中出现 "Message sent"
- [ ] bufferSize 从 0 变为 1

**师兄确认:** _____________

---

### Step 2.3: 连续发送多条消息测试 buffer

**执行者:** 用户  
**操作:** 连续发送 12 条消息（超过 bufferSize=10）：
```
测试消息 2
测试消息 3
测试消息 4
测试消息 5
测试消息 6
测试消息 7
测试消息 8
测试消息 9
测试消息 10
测试消息 11
测试消息 12
```

**确认清单:**
- [ ] 12 条消息都发送成功

**运维确认:** _____________

---

### Step 2.4: 验证 buffer 驱逐

**执行者:** 运维  
**操作:**
```bash
cd /Users/dnq/.openclaw/workspace/repo/openclaw-reflection-plugin
grep "Evicted oldest message" logs/reflection-$(date +%Y-%m-%d).log | wc -l
```

**预期结果:** 至少 2 条驱逐记录（12 条消息 - 10 buffer = 2 条被驱逐）

**详细检查:**
```bash
grep "Evicted oldest message" logs/reflection-$(date +%Y-%m-%d).log | jq .
```

**确认清单:**
- [ ] 出现 "Evicted oldest message" 日志
- [ ] 驱逐次数 >= 2
- [ ] evictedId 有值

**师兄确认:** _____________

---

## Phase 3: Session 清理验证

### Step 3.1: 记录当前 Session

**执行者:** 运维  
**操作:**
```bash
cd /Users/dnq/.openclaw/workspace/repo/openclaw-reflection-plugin
grep "Session cleared" logs/reflection-$(date +%Y-%m-%d).log
```

**预期:** 此时应该没有 "Session cleared" 记录

**确认清单:**
- [ ] 当前无 Session cleared 记录

**师兄确认:** _____________

---

### Step 3.2: 触发 Session 结束

**执行者:** 用户  
**操作:** 发送命令：
```
/reset
```
或
```
/new
```

**确认清单:**
- [ ] 命令执行成功
- [ ] Bot 响应新会话开始

**运维确认:** _____________

---

### Step 3.3: 验证 Session 被清理

**执行者:** 运维  
**操作:**
```bash
cd /Users/dnq/.openclaw/workspace/repo/openclaw-reflection-plugin
grep "Session ended, clearing buffer" logs/reflection-$(date +%Y-%m-%d).log | tail -1
grep "Session cleared" logs/reflection-$(date +%Y-%m-%d).log | tail -1
```

**预期看到:**
- `event: "Session ended, clearing buffer"`
- `event: "Session cleared"`

**确认清单:**
- [ ] 出现 "Session ended, clearing buffer"
- [ ] 出现 "Session cleared"
- [ ] sessionKey 正确

**师兄确认:** _____________

---

## Phase 4: 日志完整性检查

### Step 4.1: 统计日志条目

**执行者:** 运维  
**操作:**
```bash
cd /Users/dnq/.openclaw/workspace/repo/openclaw-reflection-plugin

echo "=== 日志统计 ==="
echo "总条目数:"
cat logs/reflection-$(date +%Y-%m-%d).log | wc -l

echo ""
echo "各事件类型:"
cat logs/reflection-$(date +%Y-%m-%d).log | jq -r '.event' | sort | uniq -c

echo ""
echo "各日志级别:"
cat logs/reflection-$(date +%Y-%m-%d).log | jq -r '.level' | sort | uniq -c
```

**确认清单:**
- [ ] 日志文件存在且有内容
- [ ] 包含 received/sent/pushed/evicted/cleared 等事件
- [ ] debug/info 级别日志都有

**师兄确认:** _____________

---

### Step 4.2: 验证日志格式

**执行者:** 运维  
**操作:**
```bash
cd /Users/dnq/.openclaw/workspace/repo/openclaw-reflection-plugin
tail -5 logs/reflection-$(date +%Y-%m-%d).log | jq .
```

**预期格式:**
```json
{
  "timestamp": "2024-03-04T10:30:00.123Z",
  "level": "debug",
  "component": "...",
  "event": "...",
  "sessionKey": "...",
  "details": {...}
}
```

**确认清单:**
- [ ] 每条日志都有 timestamp
- [ ] 每条日志都有 level
- [ ] 每条日志都有 component
- [ ] 每条日志都有 event

**师兄确认:** _____________

---

## 验证总结

### 总体结果

| 检查项 | 状态 | 备注 |
|--------|------|------|
| Phase 1: 插件配置与部署 | ⬜ | |
| Phase 2: 基础功能验证 | ⬜ | |
| Phase 3: Session 清理验证 | ⬜ | |
| Phase 4: 日志完整性检查 | ⬜ | |

### 问题记录

| 问题描述 | 发现时间 | 解决状态 |
|----------|----------|----------|
| | | |
| | | |

### 结论

- [ ] **验证通过** - 所有功能正常工作
- [ ] **验证失败** - 需要修复问题

**最终确认:** _____________

---

## 附录：常用调试命令

```bash
# 实时查看日志
cd /Users/dnq/.openclaw/workspace/repo/openclaw-reflection-plugin
tail -f logs/reflection-$(date +%Y-%m-%d).log | jq .

# 只看错误
 tail -f logs/reflection-$(date +%Y-%m-%d).log | jq 'select(.level == "error")'

# 查看特定 session
cat logs/reflection-$(date +%Y-%m-%d).log | jq 'select(.sessionKey == "xxx")'

# 检查 Gateway 日志
tail -f ~/Library/Logs/openclaw/gateway.log | grep -i reflection

# 重启 Gateway
openclaw gateway restart
```

---

*E2E Guide v4.0 - Step by Step* 🌸
