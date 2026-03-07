# Memory Gate Dataset V2

这是一组新的 `memory_gate` review dataset 草案，基于 `research/` 下对 OpenClaw 官方文档的边界研究设计。

目标：
- 强化 `USER / MEMORY / SOUL / IDENTITY / NO_WRITE` 的职责边界
- 补上 `MEMORY` 正样本
- 先用于人工 review，不直接替换当前 benchmark

## Coverage

- `UPDATE_USER`: 4
- `UPDATE_MEMORY`: 3
- `UPDATE_SOUL`: 3
- `UPDATE_IDENTITY`: 3
- `NO_WRITE`: 3

总计：`16`

## Case List

| Scenario ID | Expected Decision | Why |
| --- | --- | --- |
| `mg2_user_prefers_brutal_honesty` | `UPDATE_USER` | 稳定协作偏好，关于如何和这个用户协作 |
| `mg2_user_prefers_chinese_default` | `UPDATE_USER` | 稳定语言偏好 |
| `mg2_user_hates_surprise_rewrites` | `UPDATE_USER` | 稳定工作偏好 |
| `mg2_user_prefers_morning_checkins` | `UPDATE_USER` | 稳定节奏偏好，关于这个用户而非一般原则 |
| `mg2_memory_shared_term_north_star` | `UPDATE_MEMORY` | 持久共享语境，不是用户档案，也不是 assistant principle |
| `mg2_memory_lesson_failed_retrospective` | `UPDATE_MEMORY` | 持久 lesson learned，不是用户 trait |
| `mg2_memory_private_context_family_health` | `UPDATE_MEMORY` | 重要私密背景，帮助后续协助，但不适合写成用户偏好 |
| `mg2_soul_refuse_when_unsure` | `UPDATE_SOUL` | enduring behavioral principle |
| `mg2_soul_be_direct_and_non_sycophantic` | `UPDATE_SOUL` | enduring assistant manner |
| `mg2_soul_disclose_soul_changes` | `UPDATE_SOUL` | assistant continuity rule |
| `mg2_identity_name_change` | `UPDATE_IDENTITY` | name metadata |
| `mg2_identity_avatar_change` | `UPDATE_IDENTITY` | avatar metadata |
| `mg2_identity_vibe_label` | `UPDATE_IDENTITY` | vibe metadata, not principle |
| `mg2_no_write_smalltalk` | `NO_WRITE` | transient conversation noise |
| `mg2_no_write_single_turn_tactic` | `NO_WRITE` | one-off tactical request |
| `mg2_no_write_active_project_thread` | `NO_WRITE` | current thread/project chatter, not durable by default |

## Scenarios

### `mg2_user_prefers_brutal_honesty`

- title: Stable collaboration preference
- recent messages:
  - `user`: `以后别太委婉，问题直接指出来。`
  - `assistant`: `可以，我会直接指出问题和风险。`
- current user message: `你就按很直接的 code review 风格来。`
- current assistant reply: `后续我会保持直接、明确的技术反馈。`
- expected decision: `UPDATE_USER`
- expected candidate_fact: `prefers direct technical feedback`
- rationale: 这是关于这个用户如何希望被协作，不是在定义 assistant 对所有人的一般原则。

### `mg2_user_prefers_chinese_default`

- title: Stable language preference
- recent messages:
  - `user`: `以后默认中文。`
  - `assistant`: `可以，默认用中文。`
- current user message: `除非我特地说英文，否则都中文。`
- current assistant reply: `收到，默认使用中文。`
- expected decision: `UPDATE_USER`
- expected candidate_fact: `prefers Chinese by default unless English is requested`
- rationale: 典型用户偏好。

### `mg2_user_hates_surprise_rewrites`

- title: Stable workflow preference
- recent messages:
  - `user`: `你别直接大改文件，先让我看方案。`
  - `assistant`: `可以，先给方案，再动大改。`
- current user message: `大的结构调整先跟我确认。`
- current assistant reply: `后续遇到大改动会先给你方案。`
- expected decision: `UPDATE_USER`
- expected candidate_fact: `prefers reviewing major changes before large rewrites`
- rationale: 这是用户的稳定协作偏好，不是 assistant 的普遍原则。

### `mg2_user_prefers_morning_checkins`

- title: Stable cadence preference
- recent messages:
  - `user`: `我早上脑子最清楚。`
  - `assistant`: `那重要同步尽量放早上。`
- current user message: `以后要做复杂确认，尽量上午找我。`
- current assistant reply: `收到，复杂确认尽量放上午。`
- expected decision: `UPDATE_USER`
- expected candidate_fact: `prefers important check-ins in the morning`
- rationale: 这是用户个人节奏偏好。

### `mg2_memory_shared_term_north_star`

- title: Durable shared term
- recent messages:
  - `user`: `之后我说 North Star 文档，就是那份内部战略备忘录。`
  - `assistant`: `明白，North Star 指内部战略备忘录。`
- current user message: `别再把它理解成公开 roadmap 了。`
- current assistant reply: `后续我会把 North Star 解释为内部战略备忘录。`
- expected decision: `UPDATE_MEMORY`
- expected candidate_fact: `North Star document refers to the internal strategy memo, not the public roadmap`
- rationale: 这是持久共享语境。不是用户偏好，也不是 assistant principle。

### `mg2_memory_lesson_failed_retrospective`

- title: Durable lesson learned
- recent messages:
  - `user`: `我们之前试过每周复盘，最后变成形式主义。`
  - `assistant`: `那说明那个机制不值得照搬。`
- current user message: `以后别默认再推荐那套 weekly retro 了。`
- current assistant reply: `明白，weekly retro 在这里已经验证过效果差。`
- expected decision: `UPDATE_MEMORY`
- expected candidate_fact: `Previous weekly retrospectives became performative and were not useful`
- rationale: 这是一个长期 lesson learned，适合一般长期记忆，不等于用户画像。

### `mg2_memory_private_context_family_health`

- title: Important private life context
- recent messages:
  - `user`: `我妈最近在做化疗，所以我这段时间经常要跑医院。`
  - `assistant`: `明白，这段背景会影响安排和响应节奏。`
- current user message: `之后如果我突然消失，通常是这个原因。`
- current assistant reply: `收到，我会把这当成重要背景来理解。`
- expected decision: `UPDATE_MEMORY`
- expected candidate_fact: `User may become unavailable unexpectedly due to a family member's chemotherapy treatment`
- rationale: 这条是重要私密背景。它帮助长期协助，但不适合缩成偏好或身份元数据。

### `mg2_soul_refuse_when_unsure`

- title: Enduring restraint principle
- recent messages:
  - `user`: `如果你不确定这条值不值得写，就别写。`
  - `assistant`: `可以，把拒写当成默认保守策略。`
- current user message: `宁可少写，也别污染长期文件。`
- current assistant reply: `我会在不确定时优先拒绝写入。`
- expected decision: `UPDATE_SOUL`
- expected candidate_fact: `When uncertain about a long-term write, refuse rather than pollute memory`
- rationale: 这是 assistant 的持久行为原则。

### `mg2_soul_be_direct_and_non_sycophantic`

- title: Enduring communication principle
- recent messages:
  - `user`: `你保持直接一点，不要讨好式表达。`
  - `assistant`: `可以，我会保持直接和事实导向。`
- current user message: `少安抚，多判断。`
- current assistant reply: `后续保持直接、非谄媚、工程化的表达。`
- expected decision: `UPDATE_SOUL`
- expected candidate_fact: `Maintain a direct, non-sycophantic, engineering-focused style`
- rationale: 这是对 assistant 一般行为的要求，不只是针对这个用户的一次性偏好。

### `mg2_soul_disclose_soul_changes`

- title: Continuity rule
- recent messages:
  - `user`: `如果你改了自己的 SOUL，应该告诉我。`
  - `assistant`: `可以，把这当成连续性约束。`
- current user message: `这种变化不能悄悄发生。`
- current assistant reply: `我会在 SOUL 变化时明确告知。`
- expected decision: `UPDATE_SOUL`
- expected candidate_fact: `Disclose meaningful SOUL changes to the user`
- rationale: 这是 assistant continuity/boundary rule，符合官方对 SOUL 的定义。

### `mg2_identity_name_change`

- title: Identity name metadata
- recent messages:
  - `user`: `以后你的名字叫 Echo。`
  - `assistant`: `收到，我会使用 Echo 作为名字。`
- current user message: `名字就定 Echo。`
- current assistant reply: `已记录身份名称为 Echo。`
- expected decision: `UPDATE_IDENTITY`
- expected candidate_fact: `Name is Echo`
- rationale: 纯身份元数据。

### `mg2_identity_avatar_change`

- title: Identity avatar metadata
- recent messages:
  - `user`: `头像换成白底黑线条的狐狸。`
  - `assistant`: `好，头像风格切成极简狐狸。`
- current user message: `整体还是干净一点。`
- current assistant reply: `会把头像设为干净的极简狐狸风。`
- expected decision: `UPDATE_IDENTITY`
- expected candidate_fact: `Avatar/style is a clean minimalist fox`
- rationale: 头像是明确的身份元数据。

### `mg2_identity_vibe_label`

- title: Identity vibe metadata
- recent messages:
  - `user`: `整体 vibe 就是冷静、锋利、克制。`
  - `assistant`: `明白，身份气质会收成这个方向。`
- current user message: `不是要你冷漠，就是克制。`
- current assistant reply: `会把身份 vibe 定义为 calm, sharp, restrained。`
- expected decision: `UPDATE_IDENTITY`
- expected candidate_fact: `Vibe is calm, sharp, and restrained`
- rationale: 这里是 metadata-style vibe label，不是行为原则文本本身。

### `mg2_no_write_smalltalk`

- title: Small talk
- recent messages:
  - `user`: `今天真困。`
  - `assistant`: `那先喝点水。`
- current user message: `哈哈，希望下午别崩。`
- current assistant reply: `希望你下午顺一点。`
- expected decision: `NO_WRITE`
- expected candidate_fact: -
- rationale: 瞬时闲聊。

### `mg2_no_write_single_turn_tactic`

- title: One-off tactical instruction
- recent messages:
  - `user`: `这次你先只给结论。`
  - `assistant`: `好，这次我先只给结论。`
- current user message: `先别展开。`
- current assistant reply: `结论是可以。`
- expected decision: `NO_WRITE`
- expected candidate_fact: -
- rationale: 单轮战术要求，不应升格成长期事实。

### `mg2_no_write_active_project_thread`

- title: Current project thread
- recent messages:
  - `user`: `这两天先把 benchmark 跑通。`
  - `assistant`: `好，先集中在 benchmark。`
- current user message: `评测脚本和数据集这轮优先。`
- current assistant reply: `这轮我先处理评测链路。`
- expected decision: `NO_WRITE`
- expected candidate_fact: -
- rationale: 当前线程/项目优先级，默认不视为 durable memory。

## Review focus

这组数据最值得 review 的点：

1. `UPDATE_MEMORY` 三条是否真的应该是 `MEMORY`，还是仍然应该拆回 `USER` 或 `NO_WRITE`
2. `UPDATE_SOUL` 和 `UPDATE_IDENTITY` 的边界是否够清楚
3. `mg2_soul_be_direct_and_non_sycophantic` 是否会被你判成 `UPDATE_USER`
4. `mg2_memory_private_context_family_health` 是否更应该进 `USER`

