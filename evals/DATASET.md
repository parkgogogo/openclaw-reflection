# Eval Dataset

这份文档是 `evals/datasets/**/*.jsonl` 的可读视图，方便人工 review。

机器输入仍然以这些文件为准：

- `evals/datasets/shared/scenarios.jsonl`
- `evals/datasets/memory-gate/benchmark.jsonl`
- `evals/datasets/writer-guardian/benchmark.jsonl`

当前规模：

- shared scenarios: `28`
- memory-gate benchmark cases: `16`
- writer-guardian benchmark cases: `12`

## Shared Scenarios

### Memory Gate Scenarios

#### `mg_user_preference_direct_feedback`

- title: Stable user collaboration preference
- recent messages:
  - `user`: `以后你直接指出问题，不用太委婉。`
  - `agent`: `明白，我会更直接地指出问题和风险。`
- current user message: `对，代码 review 的时候请直说。`
- current agent reply: `后续我会保持简洁直接的技术反馈风格。`
- expected bucket intent: `USER`
- notes: 稳定协作偏好，不是项目事实

#### `mg_user_prefers_chinese`

- title: Stable language preference
- recent messages:
  - `user`: `之后都用中文跟我说。`
  - `agent`: `可以，后续默认用中文。`
- current user message: `除非我特别要求英文，不然都中文。`
- current agent reply: `收到，默认使用中文。`
- expected bucket intent: `USER`
- notes: 明确语言偏好

#### `mg_user_dislikes_fluff`

- title: User dislikes fluff
- recent messages:
  - `user`: `少一点那种安慰式的话术。`
  - `agent`: `我会尽量减少无用修饰。`
- current user message: `直接说事实和结论就行。`
- current agent reply: `后续会避免 fluff。`
- expected bucket intent: `USER`
- notes: 稳定风格偏好

#### `mg_user_project_focus_reflection_plugin`

- title: Ongoing project focus
- recent messages:
  - `user`: `这周先把 openclaw-reflection 搞稳定。`
  - `agent`: `好，先围绕 reflection plugin 收口。`
- current user message: `现在优先都放在 memoryGate 和 writer guardian 上。`
- current agent reply: `我会把当前重点放在 reflection plugin 的记忆链路。`
- expected bucket intent: `NO_WRITE`
- notes: 当前阶段先不把 project focus 写入长期记忆，避免 USER 膨胀；topic/time 收敛后再讨论

#### `mg_memory_decision_use_two_loops`

- title: Architecture decision: two loops
- recent messages:
  - `user`: `就用两个独立 loop 吧。`
  - `agent`: `明白，MemoryGate 和 Consolidation 分开。`
- current user message: `MemoryGate 实时 route，Consolidation 只做低频整理。`
- current agent reply: `已按双 loop 架构收口。`
- expected bucket intent: `NO_WRITE`
- notes: 当前阶段先不把项目架构事实写入长期记忆，避免 MEMORY 膨胀；topic/time 收敛后再讨论

#### `mg_memory_decision_remove_daily_memory`

- title: Architecture decision: remove daily memory
- recent messages:
  - `user`: `没有 daily memory 这个概念了。`
  - `agent`: `那就彻底移除中间层。`
- current user message: `对，不要再保留 DailyWriter。`
- current agent reply: `明白，daily memory 路径移除。`
- expected bucket intent: `NO_WRITE`
- notes: 当前阶段先不把项目架构事实写入长期记忆，避免 MEMORY 膨胀；topic/time 收敛后再讨论

#### `mg_memory_next_step_build_eval_benchmark`

- title: Concrete next step to build eval benchmark
- recent messages:
  - `user`: `准备开始实际测评实验来测试 memoryGate 和 writer guardian。`
  - `agent`: `先设计 benchmark dataset。`
- current user message: `先设计 dataset，我后面来 review。`
- current agent reply: `我会先产出 benchmark dataset 草案。`
- expected bucket intent: `NO_WRITE`
- notes: 当前阶段先不把 project next step 写入长期记忆，避免 MEMORY 膨胀；topic/time 收敛后再讨论

#### `mg_memory_active_thread_llm_service_refactor`

- title: Active thread: llm service refactor
- recent messages:
  - `user`: `所有的 LLM 能力使用都收束在统一的 Layer。`
  - `agent`: `建议收束到 LLMService。`
- current user message: `LLMService 直接对接 OpenAI-compatible provider。`
- current agent reply: `我会按统一 LLMService 收口。`
- expected bucket intent: `NO_WRITE`
- notes: 当前阶段先不把 active thread 写入长期记忆，避免 MEMORY 膨胀；topic/time 收敛后再讨论

#### `mg_soul_guardian_should_refuse_when_unsure`

- title: Soul principle: refuse when unsure
- recent messages:
  - `user`: `writer 像一个 guardian，可以拒绝写入。`
  - `agent`: `会把拒写权放在 writer 内部。`
- current user message: `当不确定时，guardian 就不要写。`
- current agent reply: `明白，when in doubt, refuse。`
- expected bucket intent: `SOUL`
- notes: 持久行为原则

#### `mg_soul_keep_direct_engineering_style`

- title: Soul principle: direct engineering style
- recent messages:
  - `user`: `你就保持直接、事实导向的工程师风格。`
  - `agent`: `会以直接、务实、技术清晰为主。`
- current user message: `不要 fluff，也不要过度安抚。`
- current agent reply: `后续保持直接、严谨、工程化的语气。`
- expected bucket intent: `SOUL`
- notes: 持久行为风格

#### `mg_identity_name_changed`

- title: Identity metadata changed: name
- recent messages:
  - `user`: `以后你的名字就叫 Lia。`
  - `agent`: `收到，我会以 Lia 作为名字。`
- current user message: `名字确定成 Lia。`
- current agent reply: `已记录身份名称为 Lia。`
- expected bucket intent: `IDENTITY`
- notes: 身份元数据

#### `mg_identity_avatar_changed`

- title: Identity metadata changed: avatar vibe
- recent messages:
  - `user`: `头像改成白底黑线条的极简猫。`
  - `agent`: `明白，头像风格切到极简猫。`
- current user message: `vibe 也更冷静一点。`
- current agent reply: `身份元数据会更新为更冷静的极简风。`
- expected bucket intent: `IDENTITY`
- notes: 身份元数据

#### `mg_no_write_smalltalk`

- title: Small talk should be ignored
- recent messages:
  - `user`: `今天好困。`
  - `agent`: `那就先喝点水休息一下。`
- current user message: `哈哈是的。`
- current agent reply: `希望你今天顺一点。`
- expected bucket intent: `NO_WRITE`
- notes: 当前版本仍视为 NO_WRITE；未来可以单独设计短期情绪/状态层，但不进入长期记忆

#### `mg_no_write_temporary_mood`

- title: Temporary mood should be ignored
- recent messages:
  - `user`: `我今天有点烦。`
  - `agent`: `先别急，我们慢慢看。`
- current user message: `等会儿可能就好了。`
- current agent reply: `那我们先不把这个当长期判断。`
- expected bucket intent: `NO_WRITE`
- notes: 当前版本仍视为 NO_WRITE；未来可以单独设计短期情绪/状态层，但不进入长期记忆

#### `mg_no_write_single_turn_tactical_instruction`

- title: One-off tactical instruction
- recent messages:
  - `user`: `这次回复短一点。`
  - `agent`: `好，这次我会简短。`
- current user message: `先只给结论。`
- current agent reply: `结论是可以。`
- expected bucket intent: `NO_WRITE`
- notes: 单轮战术要求

#### `mg_boundary_user_vs_memory_project_fact`

- title: Boundary: project fact vs user trait
- recent messages:
  - `user`: `我们要把 daily memory 那条链路删掉。`
  - `agent`: `这是架构决策，不是用户偏好。`
- current user message: `对，这是项目实现决策。`
- current agent reply: `我会把它写到项目记忆，而不是 USER。`
- expected bucket intent: `NO_WRITE`
- notes: 当前阶段 project fact 不进入长期记忆，因此这条边界样本先收敛为 NO_WRITE

### Writer Guardian Scenarios

| Scenario ID                                | Title                                         | Route Input       | Target File   | Candidate Fact                                                                                           | Expected Intent |
| ------------------------------------------ | --------------------------------------------- | ----------------- | ------------- | -------------------------------------------------------------------------------------------------------- | --------------- |
| `wg_user_add_stable_preference`            | Write stable USER preference                  | `UPDATE_USER`     | `USER.md`     | `prefers direct technical feedback`                                                                      | 应写入          |
| `wg_user_refuse_one_off_emotion`           | Refuse one-off emotion in USER                | `UPDATE_USER`     | `USER.md`     | `feels annoyed today`                                                                                    | 应拒写          |
| `wg_user_refuse_surveillance_style_detail` | Refuse dossier-like detail in USER            | `UPDATE_USER`     | `USER.md`     | `checked Telegram at 09:13 and 09:47 before replying`                                                    | 应拒写          |
| `wg_memory_add_architecture_decision`      | Write durable architecture decision to MEMORY | `UPDATE_MEMORY`   | `MEMORY.md`   | `Use two independent loops: MemoryGate for realtime routing and Consolidation for low-frequency cleanup` | 应写入          |
| `wg_memory_refuse_ephemeral_chat_noise`    | Refuse ephemeral chat noise in MEMORY         | `UPDATE_MEMORY`   | `MEMORY.md`   | `user said haha after the explanation`                                                                   | 应拒写          |
| `wg_memory_refuse_wrong_route_from_gate`   | Refuse wrong route into MEMORY                | `UPDATE_MEMORY`   | `MEMORY.md`   | `prefers responses in Chinese unless English is requested`                                               | 应拒写          |
| `wg_soul_add_enduring_principle`           | Write enduring SOUL principle                 | `UPDATE_SOUL`     | `SOUL.md`     | `When uncertain about a long-term write, refuse rather than pollute memory`                              | 应写入          |
| `wg_soul_refuse_temporary_tone_shift`      | Refuse temporary tone shift in SOUL           | `UPDATE_SOUL`     | `SOUL.md`     | `be extra casual today`                                                                                  | 应拒写          |
| `wg_soul_refuse_project_specific_tactic`   | Refuse project-specific tactic in SOUL        | `UPDATE_SOUL`     | `SOUL.md`     | `Use rg instead of grep in this repo`                                                                    | 应拒写          |
| `wg_identity_add_metadata_change`          | Write identity metadata change                | `UPDATE_IDENTITY` | `IDENTITY.md` | `Name is Lia`                                                                                            | 应写入          |
| `wg_identity_refuse_non_identity_fact`     | Refuse non-identity fact in IDENTITY          | `UPDATE_IDENTITY` | `IDENTITY.md` | `Prefer direct technical feedback over fluff`                                                            | 应拒写          |
| `wg_identity_refuse_preference_leak`       | Refuse user preference leaking into IDENTITY  | `UPDATE_IDENTITY` | `IDENTITY.md` | `User prefers Chinese by default`                                                                        | 应拒写          |

## Memory Gate Benchmark

| Scenario ID                                    | Expected Decision | Expected Candidate Fact                                                                                  | Severity   | Tags                                          |
| ---------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------- |
| `mg_user_preference_direct_feedback`           | `UPDATE_USER`     | `prefers direct technical feedback`                                                                      | `core`     | `user`, `stable_preference`, `positive`       |
| `mg_user_prefers_chinese`                      | `UPDATE_USER`     | `prefers Chinese by default unless English is requested`                                                 | `core`     | `user`, `language_preference`, `positive`     |
| `mg_user_dislikes_fluff`                       | `UPDATE_USER`     | `dislikes fluff and prefers direct factual responses`                                                    | `core`     | `user`, `style_preference`, `positive`        |
| `mg_user_project_focus_reflection_plugin`      | `NO_WRITE`        | -                                                                                                        | `boundary` | `no_write`, `project_focus`, `refusal`        |
| `mg_memory_decision_use_two_loops`             | `NO_WRITE`        | -                                                                                                        | `core`     | `no_write`, `project_fact`, `refusal`         |
| `mg_memory_decision_remove_daily_memory`       | `NO_WRITE`        | -                                                                                                        | `core`     | `no_write`, `project_fact`, `refusal`         |
| `mg_memory_next_step_build_eval_benchmark`     | `NO_WRITE`        | -                                                                                                        | `core`     | `no_write`, `project_next_step`, `refusal`    |
| `mg_memory_active_thread_llm_service_refactor` | `NO_WRITE`        | -                                                                                                        | `boundary` | `no_write`, `active_thread`, `refusal`        |
| `mg_soul_guardian_should_refuse_when_unsure`   | `UPDATE_SOUL`     | `When uncertain about a long-term write, refuse rather than pollute memory`                              | `core`     | `soul`, `principle`, `positive`               |
| `mg_soul_keep_direct_engineering_style`        | `UPDATE_SOUL`     | `Maintain a direct, pragmatic, engineering-focused style`                                                | `core`     | `soul`, `style`, `positive`                   |
| `mg_identity_name_changed`                     | `UPDATE_IDENTITY` | `Name is Lia`                                                                                            | `core`     | `identity`, `metadata`, `positive`            |
| `mg_identity_avatar_changed`                   | `UPDATE_IDENTITY` | `Avatar/style is a calm minimalist cat vibe`                                                             | `boundary` | `identity`, `metadata`, `positive`            |
| `mg_no_write_smalltalk`                        | `NO_WRITE`        | -                                                                                                        | `core`     | `no_write`, `smalltalk`, `refusal`            |
| `mg_no_write_temporary_mood`                   | `NO_WRITE`        | -                                                                                                        | `core`     | `no_write`, `temporary_signal`, `refusal`     |
| `mg_no_write_single_turn_tactical_instruction` | `NO_WRITE`        | -                                                                                                        | `core`     | `no_write`, `single_turn_tactic`, `refusal`   |
| `mg_boundary_user_vs_memory_project_fact`      | `NO_WRITE`        | -                                                                                                        | `boundary` | `no_write`, `project_fact_boundary`, `refusal` |

### Candidate Fact Variants

当前 `memory-gate` benchmark 还保留了 `allowed_candidate_fact_variants`，用于少量高置信语义改写直接放行。

例子：

- `mg_user_preference_direct_feedback`
  - expected: `prefers direct technical feedback`
  - variants:
    - `prefers direct code review feedback`
    - `wants direct technical feedback`

- `mg_soul_guardian_should_refuse_when_unsure`
  - expected: `When uncertain about a long-term write, refuse rather than pollute memory`
  - variants:
    - `when in doubt, refuse writes`
    - `prefer refusal over polluting memory when uncertain`

## Writer Guardian Benchmark

| Scenario ID                                | Target File   | Expected Should Write | Expected Outcome Type      | Allowed Tool Traces | Content Assertions                                             |
| ------------------------------------------ | ------------- | --------------------- | -------------------------- | ------------------- | -------------------------------------------------------------- |
| `wg_user_add_stable_preference`            | `USER.md`     | `true`                | `update_user_preference`   | `read -> write`     | contains `## Preferences`, `prefers direct technical feedback` |
| `wg_user_refuse_one_off_emotion`           | `USER.md`     | `false`               | `refuse_temporary_signal`  | `(none)` or `read`  | not contains `feels annoyed today`                             |
| `wg_user_refuse_surveillance_style_detail` | `USER.md`     | `false`               | `refuse_dossier_detail`    | `(none)` or `read`  | not contains `09:13`, `09:47`                                  |
| `wg_memory_add_architecture_decision`      | `MEMORY.md`   | `true`                | `update_memory_decision`   | `read -> write`     | contains `## Decisions`, `Use two independent loops`           |
| `wg_memory_refuse_ephemeral_chat_noise`    | `MEMORY.md`   | `false`               | `refuse_ephemeral_noise`   | `(none)` or `read`  | not contains `haha`                                            |
| `wg_memory_refuse_wrong_route_from_gate`   | `MEMORY.md`   | `false`               | `refuse_wrong_route`       | `(none)` or `read`  | not contains `prefers responses in Chinese`                    |
| `wg_soul_add_enduring_principle`           | `SOUL.md`     | `true`                | `update_soul_principle`    | `read -> write`     | contains target principle sentence                             |
| `wg_soul_refuse_temporary_tone_shift`      | `SOUL.md`     | `false`               | `refuse_temporary_tone`    | `(none)` or `read`  | not contains `extra casual today`                              |
| `wg_soul_refuse_project_specific_tactic`   | `SOUL.md`     | `false`               | `refuse_project_tactic`    | `(none)` or `read`  | not contains `Use rg instead of grep`                          |
| `wg_identity_add_metadata_change`          | `IDENTITY.md` | `true`                | `update_identity_metadata` | `read -> write`     | contains `Name: Lia`, not contains `Name: Echo`                |
| `wg_identity_refuse_non_identity_fact`     | `IDENTITY.md` | `false`               | `refuse_non_identity_fact` | `(none)` or `read`  | not contains `Prefer direct technical feedback`                |
| `wg_identity_refuse_preference_leak`       | `IDENTITY.md` | `false`               | `refuse_preference_leak`   | `(none)` or `read`  | not contains `User prefers Chinese by default`                 |

## Coverage Intent

当前这版 benchmark 主要覆盖这几类问题：

- `memory-gate`
  - `USER` / `SOUL` / `IDENTITY` / `NO_WRITE` 四类当前目标路由
  - 稳定偏好 vs 单轮战术
  - 持久原则 vs 用户偏好
  - 长期记忆写入与 project/topic facts 的收敛边界
  - 当前阶段 project facts / active threads / next steps 一律视为 `NO_WRITE`

- `writer-guardian`
  - 目标文件语义守门
  - 可写 / 拒写
  - 误路由拒写
  - 临时信号拒写
  - 工具轨迹约束：首版只接受 `read -> write` 或仅 `read`

## Review Focus

你 review 这份 dataset 时，重点可以看：

1. `scenario` 本身是否像真实对话，而不是过于教材化
2. `expected_decision` 是否符合你对 OpenClaw 文件语义的理解
3. `candidate_fact` 的抽象层是否合适
4. `writer guardian` 的拒写 case 是否够尖锐
5. 有没有缺失的重要边界样本
