# Verity Harness V2 改造指令（完整版）

## 你的角色

你是 Verity 研究工作台的 AI agent 核心架构改造工程师。你需要把当前的 10 文件 ~3,500 行的 harness 改造为符合以下最佳实践的极简架构。

---

## 三个参考来源的核心思想（你必须内化）

### OpenAI《A Practical Guide to Building Agents》
- Agent = Model + Tools + Instructions，不需要更多
- 单 agent 做到极限再拆分。不要预设多 agent 或预规划系统
- 工具的清晰度比数量重要。15+ 个描述清晰的工具比 10 个模糊工具好
- Guardrail 是代码层面的分层防御，不是 prompt 里的禁令
- 用 prompt 模板（一个基础 prompt + 变量注入），不要维护几十种条件变体

### pi-momo（OpenClaw 内核）
- Agent 只需要 LLM + 工具 + 循环三件事做得干净、可观测、可中断
- 循环是内核，策略是插件。循环里只做：调 AI → 执行工具 → 塞回结果 → 继续
- 双层闸门：Transform（裁切上下文）和 Convert（转换格式）各司其职，不混在一起
- 错误返回是最好的教学材料。AI 通过"尝试→失败→读错误→重试"学习规则
- 砍掉 90% 不必要的复杂度，只保留真正必要的

### learn-claude-code（12 session 渐进式构建）
- 核心 pattern 只有 20 行：while → call_llm → tool_use? → execute → loop back
- s03: "An agent without a plan drifts" — 但计划在 AI 的文字思考里，不是代码生成的 JSON
- s05: "Load knowledge when you need it, not upfront" — 上下文通过 tool_result 按需注入，不塞进 system prompt
- s06: "Context will fill up; you need a way to make room" — 三层压缩策略管理无限会话

### Context 管理的业界实践（pi-momo + Factory.ai + Manus）
- **pi-momo compaction**：context 接近上限时用独立 AI 调用总结老消息，保留最近 keepRecentTokens 的原文。永不在 turn 中间切割（turn = user → assistant + tool results）。摘要注入为 user 消息。被动兜底：API 返回 context overflow 时压缩重试。
- **Factory.ai 结构化摘要**：摘要不是自由格式文字，而是固定分区（session intent / file modifications / decisions made / next steps）。结构强制保留信息——每个区必须填写或显式留空，防止自由格式总结悄悄丢掉关键细节。
- **Manus 三层优先级**：优先保留原文(raw) > 可逆压缩(compaction，删除环境中可恢复的信息) > 不可逆摘要(summarization)。核心思想：你无法预测哪条信息在 10 步后变关键，所以压缩必须尽可能可逆。

---

## 当前代码库

10 个文件：orchestrator.mjs (979行), promptBuilder.mjs (228行), toolGroups.mjs (110行), tools.mjs (635行), toolExecutor.mjs (470行), contextBudget.mjs (73行), researchContext.mjs (213行), draftEngine.mjs (229行), planner.mjs (241行), executor.mjs (288行)

---

## 已确认的全部问题（17 个，一个不能漏）

### 🔴 严重（必须修）

1. **raw_snippet 验证可绕过**：create_card 只在 `args.raw_snippet && args.source_url` 时触发 verifyRawSnippet，source_url 不是必填参数，不传就跳过。位置：toolExecutor.mjs#L143。
   - 修法：不再依赖 source_url。直接在 chunks 表搜 raw_snippet 前 80 字符（ilike），未命中则 fallback 到 materials.excerpt 搜。两个都没命中 → 拒绝并返回可纠错格式的错误。

2. **commitDraft 无层级校验**：commitDraft 逐条创建节点，不检查 Q→H→E 层级。$temp_id 引用在 propose_board_changes 的校验中被跳过，commit 时也不校验。位置：draftEngine.mjs#L62-L157。
   - 修法：抽出共享的 validateNodeHierarchy 函数（新文件 validation.mjs），commitDraft 创建每个 hypothesis/evidence 节点前调用它查 DB 验证 parent type。校验失败时 console.warn 并跳过该节点（不中断整个 commit），继续处理其他 changes。同时维护 skippedSet——被跳过的 temp_id 加入集合，后续 changes 如果引用被跳过的 temp_id 也自动跳过。最终结果里告知前端"以下 N 个 changes 因层级违规被跳过"。

3. **混合 read+write tool calls 消息结构损坏**：chat() 第 120 行 push 完整 assistantMsg（含所有 tool_calls），第 216 行又 push 一条只含 auto tools 的 assistantMsg。第一条里的 write tool_call 没有对应的 tool result → API 格式错误。位置：orchestrator.mjs#L112-L221。
   - 修法：不在第 120 行 push 完整的 assistantMsg。改为：如果全是 auto → push assistantMsg + 所有 results；如果有 pending → 只 push 一条只含 auto tool_calls 的 assistantMsg + auto results，pending 的 tool_calls 在 chatConfirm 时再 push。

4. **conversation_summary 取样方向反了**：history 是 newest-first（listMessages 按 created_at DESC），slice(-20) 取数组末尾 = 最旧的 20 条。位置：orchestrator.mjs#L842-L846。
   - 修法：第 1 阶段改成 .slice(0, 20)。第 2 阶段引入 contextManager 后，此函数被 generateStructuredSummary 替代，问题自然消失。

5. **$ref 解析替换整个对象**：executor.mjs deepResolveRefs 把 `$ref:step_1` 替换为 step_1 的完整输出对象，而目标工具期望的是字符串或特定字段。位置：executor.mjs#L207-L228。
   - 修法：随 planner/executor 删除而消失。如果暂留后台任务入口，必须修——支持路径表达式 `$ref:step_1.items[0].url` 或在 executor 加适配器层。

6. **tool loop 无 token 消耗追踪**：chat() 循环中不断往 currentMessages 追加数据，但不检查累积 token 是否超过 context window。位置：orchestrator.mjs#L112-L258。
   - 修法：循环顶部加 roughTokenEstimate 检查，超过 contextWindow * 0.8 时注入终止指令做最后一次无工具调用。额外加被动兜底：catch API 的 context overflow 错误，砍掉前半段历史重试。

7. **会话锁是进程内 Map，多实例失效**：conversationLocks 是 JS 内存 Map，多实例部署时各实例看不到对方的锁。位置：orchestrator.mjs#L24。
   - 修法：当前单实例不修。未来多实例时改用 Postgres advisory lock（`SELECT pg_advisory_xact_lock(hashtext(convId))`）或 Redis SETNX。在代码里留 TODO 注释标记。

### 🟡 中等

8. **methodology guard 两处重复实现**：create_board_node（toolExecutor.mjs#L266-L302）和 propose_board_changes（toolExecutor.mjs#L370-L398）各有一套独立的层级校验代码。
   - 修法：抽到 validation.mjs 的 validateNodeHierarchy。两处都调它。

9. **12 轮硬限制太死板**：MAX_TOOL_ROUNDS = 12 硬编码。位置：orchestrator.mjs#L21。
   - 修法：删除硬编码轮次。改为 token 消耗的软限制（80% context window）。

10. **chatConfirm 可能无限乒乓弹确认**：用户确认一个操作后 AI 又要 confirm → 又暂停 → 又确认……无最大轮次。位置：orchestrator.mjs#L313-L460。
    - 修法：在 chatConfirm 或 executeToolCalls 中加 maxConfirmRounds = 3 硬兜底。超过 3 轮连续 pending 后，注入"请基于已有结果回复用户"终止。

11. **prompt 条件分支几十种变体**：TOOL_GROUP_INSTRUCTIONS × MODE_INSTRUCTIONS × describeSurface × methodology × researchState 排列组合无法穷举测试。位置：promptBuilder.mjs 全文。
    - 修法：砍到 3 块固定结构（role + context + rules），~400 tokens。领域知识搬到工具 description。

12. **chat + explore 指令重复浪费 50 tokens**：mode=chat 时 toolGroup 强制为 explore，两套指令说同一件事。位置：promptBuilder.mjs#L29-L33、#L10-L11。
    - 修法：随 toolGroups 和 MODE_INSTRUCTIONS 删除而消失。

13. **"提取"触发 create_card 跳过确认**：create_card 是 LOW_RISK_WRITE 自动执行，但用户说"提取关键发现"可能只想看文字回复不想创建卡片。
    - 修法：create_card 的 risk_level 设为 auto（保持现有行为），但改进 description 让 AI 更准确判断意图——description 明确列出"用户说总结/分析/解释 → 用文字回复，不创建卡片"。

14. **get_board_health 无 topicId 时返回空对象**：AI 不理解为什么拿到空结果。位置：toolExecutor.mjs#L418-L425。
    - 修法：topicId 为空时返回明确错误：`{ error: "no_topic", message: "需要在某个研究主题下才能查看论证健康状态。", suggestion: "调用 list_topics 查看可用主题，或确认当前是否在某个主题内。" }`

15. **raw_snippet 验证的分块时序竞态**：用户刚 ingest_url，分块是异步的，chunks 表可能还没数据。改造后验证去查 chunks 会误拒合法的 raw_snippet。
    - 修法：验证时先查 chunks，未命中则 fallback 查 materials.excerpt。两个都未命中时，检查是否有"最近 5 分钟内摄入的 material"（status=processing），如果有 → 返回软警告而非硬拒绝：`{ warning: "raw_snippet 未在已完成分块中找到匹配，可能是因为材料仍在处理中。卡片已创建，但建议稍后验证。" }`。

16. **两处相同 write-intent 日志**：chatWithConversation#L674 和 chat#L89 都打 "Write-intent detected in chat mode"。
    - 修法：随 orchestrator 简化和 toolGroups 删除一起消失。

17. **orchestrator 同时做六种职责**：prompt 拼装、工具组推断、plan 检测、确认分流、结果压缩、输出清理混在 979 行里。
    - 修法：确认分流和结果压缩下沉到 executeToolCalls；prompt 拼装在极简版 promptBuilder；plan 逻辑随 planner 删除；工具组推断随 toolGroups 删除；context 裁剪在新的 contextManager。orchestrator 只剩循环 + 会话管理 + 持久化。

---

## 改造目标架构

### 文件结构

```
改造后保留/新增：
  orchestrator.mjs    (~300行)  — 循环内核 + 会话管理 + 持久化
  tools.mjs           (~550行)  — 23 个工具定义（-request_plan, +get_methodology），元数据只保留 risk_level
  toolExecutor.mjs    (~500行)  — 工具分发 + context auto-injection + 校验 + executeToolCalls + compressResult
  contextManager.mjs  (~150行)  — 历史裁剪 + 结构化摘要 + 溢出兜底（新增）
  draftEngine.mjs     (~260行)  — 草稿系统（保留）+ commitDraft 层级校验 + skippedSet
  researchContext.mjs  (~130行)  — computeResearchState + getResearchState
  validation.mjs       (~60行)  — 共享校验函数（新增）
  promptBuilder.mjs    (~50行)  — 极简 3 块模板

删除：
  toolGroups.mjs      — AI 看全部工具，执行层控制权限
  contextBudget.mjs   — 被 contextManager.mjs 替代
  planner.mjs         — 复杂任务让 AI 在循环中自行迭代
  executor.mjs        — 同上

删除的数据库表（标记 deprecated，不急着 drop）：
  tasks, task_runs, task_steps

删除的工具：
  request_plan

新增的工具：
  get_methodology — AI 按需获取用户研究方法论
```

### 循环内核设计（orchestrator.mjs chat 函数）

```
chat():
  while true:
    // 安全阀：roughTokenEstimate > 80% context window → 注入终止指令，最后一次无工具调用
    // 被动兜底：catch context overflow → 砍掉前半段历史重试
    response = callLLM(currentMessages, ALL_TOOLS)
    if no tool_calls → return reply (经 sanitizeReply 清理)
    { results, pendingActions } = executeToolCalls(toolCalls, ctx)
    if pendingActions.length > 0 → return { pendingActions } (循环暂停)
    currentMessages.push(assistantMsg, ...results)  // 继续循环
```

循环里只有这四步。没有 side_effect 分类、没有 planRequest 检测、没有 toolGroup 推断、没有 MAX_TOOL_ROUNDS。

### Context 管理三层架构（contextManager.mjs）

```
消息从 DB 加载
      ↓
  ┌─────────────────────┐
  │ 第 1 层：工具结果压缩     │  ← 每轮循环内实时做（compressResult in toolExecutor）
  └────────┬────────────┘
           ↓
  ┌─────────────────────┐
  │ 第 2 层：历史裁剪+结构化摘要 │  ← 每次请求开始时做（contextManager.buildContextMessages）
  └────────┬────────────┘
           ↓
  ┌─────────────────────┐
  │ 第 3 层：溢出兜底         │  ← 循环内 token 软限制 + API 错误 catch 重试
  └─────────────────────┘
```

三层各管一件事，互不依赖。

**第 1 层（已有，搬到 toolExecutor）：** compressResult 按工具类型裁剪返回值——semantic_search 结果裁到 200 字，get_board 只保留核心字段。防止单次工具调用撑爆 context。

**第 2 层（新增，contextManager.mjs 核心）：**

```js
// 配置常量
RECENT_MESSAGES_TO_KEEP = 40    // 保留最近 40 条消息原文
COMPACTION_TRIGGER = 60          // 超过 60 条文本消息时触发摘要
COMPACTION_COOLDOWN_MS = 10min   // 冷却期

// 核心函数
buildContextMessages(history, existingSummary):
  chatMessages = history 过滤 user/assistant，工具调用消息压缩为摘要格式
  if chatMessages.length <= 40 → 全部保留，翻转为 oldest-first 返回
  else:
    recentMessages = chatMessages.slice(0, 40)  // newest-first 的前 40 条 = 最新 40 条
    cutIndex = findTurnBoundary(recentMessages)  // 找 turn 边界，不在 assistant+tool 中间切
    keptMessages = recentMessages.slice(0, cutIndex).reverse()
    if existingSummary → 前置为 system 消息
    return [summary?, ...keptMessages]

shouldCompact(history, existingSummary, lastCompactionTime):
  textCount > 60 且冷却期外 且(无摘要 或 摘要后累积了 20+ 条新消息) → true

generateStructuredSummary(messagesToSummarize, previousSummary, aiConfig):
  用独立 AI 调用生成 5 分区结构化摘要（研究主题/关键发现/用户判断/已执行操作/当前状态）
  增量合并：previousSummary 作为上下文传入，要求合并更新而非覆盖
```

**结构化摘要的 5 个分区（参考 Factory.ai，适配 Verity 研究场景）：**

```
## 研究主题
当前在研究什么课题

## 关键发现
讨论中提到的重要事实、数据、结论

## 用户判断
用户对假说/证据/方向做出的判断和偏好
（这些信息只存在于对话中，丢失不可恢复——必须优先保留）

## 已执行操作
创建了哪些卡片、操作了哪些画板节点、摄入了哪些材料

## 当前状态
对话结束时的研究进展和下一步方向
```

每个分区要么有内容要么写"无"，不能省略。这是 Factory.ai 的核心洞见：结构强制保留信息，防止自由格式总结悄悄丢掉关键细节。

**为什么"用户判断"分区是 Verity 特有的：** 编程 agent（pi-momo）压缩后丢掉的信息可以从文件系统恢复（重新读文件）。Verity 的卡片、画板节点、材料也可以从 DB 恢复（重新调工具查询）。但"用户说'我觉得这个假说有问题'"这种判断不在任何数据库里——只存在于对话历史中。如果摘要丢了这句话，AI 后续可能继续沿着用户已经否定的方向工作。

**工具结果的可逆压缩（参考 Manus）：** 历史中的 tool_calls 类型消息只保留摘要格式 `[semantic_search] → 找到 5 条相关内容`，丢弃完整结果。这是可逆的——如果 AI 需要详细结果，它可以重新调 semantic_search，数据在 DB 里不会变。

**turn 边界切割规则（参考 pi-momo）：** findTurnBoundary 从目标切割点往前找最近的 user 消息位置。保证不在 assistant 的 tool_calls 和对应的 tool results 之间切——否则 API 会因为 tool_call 没有配对的 tool_result 而报错。

**第 3 层（循环内兜底）：**

```js
// 主动安全阀（在循环顶部）
if roughTokenEstimate(currentMessages) > contextWindow * 0.8:
  注入 "上下文接近上限，请基于已有信息直接回复用户"
  最后一次无工具调用
  return

// 被动兜底（catch API 错误）
try:
  response = callLLM(currentMessages, tools)
catch err:
  if isContextOverflowError(err):
    systemMsgs = currentMessages.filter(system)
    otherMsgs = currentMessages.filter(!system)
    currentMessages = [...systemMsgs, ...otherMsgs.slice(otherMsgs.length / 2)]
    response = callLLM(currentMessages, tools)  // 重试
  else: throw
```

### executeToolCalls 设计（toolExecutor.mjs）

```
executeToolCalls(toolCalls, ctx):
  for each toolCall:
    tool = TOOL_MAP[name]
    riskLevel = tool.risk_level  // "auto" | "confirm" | "confirm_warn"

    // 模式拦截：chat 模式下非 auto 工具 + 画板草稿工具都拦截
    if ctx.mode === 'chat' && (riskLevel !== 'auto' || isWriteCapableTool(name)):
      → push error result "请切换到代理模式"
      continue

    if riskLevel === 'auto':
      → executeTool → compressResult → push result
    else:
      → push to pendingActions

  return { results, pendingActions, toolCallLog }
```

**chat 模式下 propose_board_changes 的处理（明确的产品决策）：**

propose_board_changes 的 risk_level 是 auto（因为它只创建草稿预览不创建真实数据）。但 chat 模式的语义是"纯聊天，不产生任何写入"。需要明确决策：

- 方案 A（推荐）：chat 模式下额外拦截 propose_board_changes。用 isWriteCapableTool 函数维护一个列表：`['propose_board_changes', 'create_card', 'ingest_url']`。这些工具虽然 risk_level=auto，但在 chat 模式下应该被拦截。
- 方案 B：chat 模式下允许 propose_board_changes（因为只是草稿）。用户需要在画板上审批才会真正创建数据。

选择哪个方案取决于产品对"聊天模式"的定义。在代码中用配置常量 `CHAT_MODE_BLOCKED_TOOLS` 控制，方便后续调整。

### 工具元数据设计（tools.mjs）

每个工具只保留一个策略字段 risk_level：
- `"auto"` — 所有 read_only + create_card + ingest_url + propose_board_changes + get_methodology + fetch_rss
- `"confirm"` — create_board_node, update_board_node, create_board_edge
- `"confirm_warn"` — delete_board_node, delete_board_edge

删除 side_effect, plan_allowed, task_auto, task_phases, task_capability, confirm_template 字段。
删除 LOW_RISK_WRITES 常量。
删除 getToolSideEffect 函数，改为 getToolRiskLevel。

### System Prompt 设计（promptBuilder.mjs）

```
<role>
你是 Verity（求真）的研究助手——一个证据驱动的研究工作台。
你通过工具搜索知识库、操作思维画板、摄入外部内容来推进用户的研究。
用用户的语言回复。简洁、行动导向。展示数据时用标题不用 ID。
</role>

<context>
${topicTitle ? `用户正在研究「${topicTitle}」。` : ''}
topic_id、board_id、material_id 已自动注入到相关工具参数，你不需要手动填写。
</context>

<rules>
- 不编造数据——必须通过工具获取真实信息
- 不主动创建卡片——除非用户明确说了"保存""提取""摘录""创建卡片"
- 区分证据（来自材料的原文）和你的分析（你的推断），引用来源时使用原文
- 操作画板时先调用 get_board 了解当前结构，再提议更改
- 执行复杂的多步骤任务前，先用文字描述你的计划和步骤，等用户确认后再开始调用工具
- 描述操作时用产品语义（"搜索了你的文档""读取了画板"），不暴露工具名和内部 ID
- 工具返回错误时，阅读错误信息和 suggestion 字段，自行修正后重试
</rules>
```

~400 tokens。固定结构，没有条件分支。

注意第 5 条规则是新增的——弥补删除 planner 后"用户失去预览计划机会"的问题。AI 先用文字描述打算怎么做，用户说"好的"后再开始调工具。这是 learn-claude-code s03 的做法：计划在 AI 的文字回复里，不是代码生成的 JSON。

### 错误返回的标准格式

所有校验失败和工具错误必须返回这个结构（可纠错格式）：

```json
{
  "error": "错误类型标识",
  "message": "发生了什么错误（中文，具体指出哪个参数/值有问题）",
  "current_state": { /* 可选：当前相关的数据状态 */ },
  "available_options": [ /* 可选：AI 可以选择的合法选项 */ ],
  "suggestion": "具体的下一步操作建议（告诉 AI 调什么工具、传什么参数）",
  "hint": "可选的额外提示（比如什么情况下不应该调这个工具）"
}
```

目标：AI 看到一次错误返回就能在下一轮成功纠正，不需要额外调工具获取信息。

### 工具 description 的改造标准

每个工具的 description 应该包含四个部分：
1. **做什么**：一句话描述功能
2. **什么时候该用**：明确的触发场景
3. **什么时候不该用**：避免 AI 误调用
4. **参数规则**：关键参数的约束和违反后果

对于有领域规则的工具（create_card, propose_board_changes, create_board_node），把原来在 system prompt 里的规则搬到 description 里。

### validation.mjs 的设计

三个纯函数，不调 DB，不 import 外部依赖：
- `validateNodeHierarchy(nodeType, parentId, parentNodeType)` → error object | null
- `validateCardData(args)` → error object | null（检查 raw_snippet 非空且 ≥10 字符、summary ≠ raw_snippet、topic_title 非空）
- `validateEdgeRelation(relationType)` → error object | null

toolExecutor 和 draftEngine 都 import 这个文件。

### 工具可见性行为变化一览（删掉 toolGroups 后的影响）

改造后所有工具对 AI 可见。以下是和现状的差异，执行者必须知道：

| 场景 | 现在 AI 能看到 | 改造后 AI 能看到 | 风险 |
|------|---------------|----------------|------|
| chat 模式，画板页面 | explore 组 10 个只读 | 全部 23 个（但非 auto 被执行层拦截） | AI 可能尝试调 confirm 工具然后收到模式错误。可接受——AI 会转为文字回复。 |
| agent 模式，画板页面 | board 组 11 个（含 propose，不含 create_card） | 全部 23 个 | AI 可能在用户要求"加到画板"时误用 create_card 而非 propose。需监测。工具 description 已引导优先用 propose。 |
| agent 模式，通用界面 | explore 组 10 个只读 | 全部 23 个 | AI 可能在通用界面主动调写入工具。可接受——confirm 工具会暂停等用户确认。 |
| agent 模式，阅读器 | explore 或 cards 组 | 全部 23 个 | AI 可能在阅读器里调画板工具。可接受——context auto-injection 会注入正确的 IDs。 |

---

## 落地顺序

### 第 1 阶段：打补丁不动架构（修问题 1,2,3,4,8,14,15）

不删文件、不改接口、不改 DB schema。每个修改可独立 commit 和验证。

- 创建 validation.mjs，实现 validateNodeHierarchy、validateCardData、validateEdgeRelation
- toolExecutor.mjs：改 create_card 校验（不依赖 source_url，chunks + excerpt 双查，时序竞态软警告）
- toolExecutor.mjs：create_board_node 和 propose_board_changes 的层级校验改为调用 validation.mjs
- toolExecutor.mjs：get_board_health 加 topicId 空值检查
- toolExecutor.mjs：所有校验失败返回可纠错格式（加 current_state / available_options / suggestion）
- draftEngine.mjs：commitDraft 循环内加 validateNodeHierarchy 调用 + skippedSet 级联跳过
- orchestrator.mjs：修混合 tool calls 消息结构（不 push 完整 assistantMsg，分开处理）
- orchestrator.mjs：修 conversation_summary slice 方向（.slice(0, 20)）
- 在 conversationLocks 处加 TODO 注释标记多实例风险

### 第 2 阶段：抽 executeToolCalls + 循环瘦身 + Context 管理（修问题 6,9,10,17）

- **新增 contextManager.mjs**：实现 buildContextMessages、shouldCompact、generateStructuredSummary、findTurnBoundary
- toolExecutor.mjs：新增 executeToolCalls 函数，吸收 orchestrator 里的 side_effect 分类 + LOW_RISK_WRITES + mode 检查 + chat 模式额外拦截列表
- toolExecutor.mjs：compressToolResult 从 orchestrator 搬过来
- orchestrator.mjs：chat() 改为极简循环（while + callLLM + executeToolCalls + pendingActions 检查 + 溢出兜底）
- orchestrator.mjs：删除 MAX_TOOL_ROUNDS，循环顶部加 roughTokenEstimate + 80% context window 软限制
- orchestrator.mjs：chatConfirm 加 maxConfirmRounds = 3 硬兜底
- orchestrator.mjs：chatWithConversation 改为调 contextManager.buildContextMessages 构建消息数组，异步调 shouldCompact + generateStructuredSummary 更新摘要
- orchestrator.mjs：删除 generateConversationSummary（被 contextManager.generateStructuredSummary 替代）
- 同时做 prompt 减脂（改的是不同文件不冲突）：
  - promptBuilder.mjs 重写为极简 3 块模板（含新增的"复杂任务先描述计划"规则）
  - tools.mjs 里关键工具的 description 加入领域规则

### 第 3 阶段：特性开关渐进切换（修问题 11,12,16,18）

引入特性开关 `HARNESS_V2 = process.env.HARNESS_V2 === 'true'`

- 当 HARNESS_V2=true 时：
  - 跳过 toolGroups 推断，直接把所有 TOOL_DEFINITIONS 传给 AI
  - 使用新的极简 promptBuilder
  - 不加载 methodology/researchState 到 prompt（AI 按需调 get_methodology / get_board_health）
  - 不走 planner 路径（request_plan 工具不在列表里）
  - 使用 contextManager 管理历史（而非 contextBudget）
- 当 HARNESS_V2=false（默认）时：
  - 保持现有行为（向后兼容）
- tools.mjs：risk_level 字段和原有 side_effect 字段共存，executeToolCalls 优先读 risk_level，fallback 到 side_effect
- tools.mjs：新增 get_methodology 工具定义
- researchContext.mjs：删除 formatResearchStateForPrompt（HARNESS_V2=true 时不再需要）
- 监测指标：
  - AI 工具误选率（特别是 agent 模式画板页面 create_card vs propose 的选择）
  - confirm 被拦截次数（chat 模式下 AI 尝试调非 auto 工具的频率）
  - 循环平均轮次和 token 消耗
  - 结构化摘要的信息保留质量（抽查摘要是否丢失了用户判断）
  - 用户满意度

### 第 4 阶段：下线旧代码

在 HARNESS_V2 灰度验证通过后（建议至少跑 2 周）：

- 删除 toolGroups.mjs
- 删除 contextBudget.mjs
- 删除 planner.mjs 和 executor.mjs
- 从 tools.mjs 删除 request_plan 工具定义
- 从 tools.mjs 删除旧的元数据字段（side_effect, plan_allowed, task_auto, task_phases, task_capability）
- 删除 LOW_RISK_WRITES 常量
- 从 orchestrator.mjs 删除所有 HARNESS_V2 分支（只保留 V2 路径）
- generateConversationTitle 从 planner.mjs 搬到 orchestrator 内部（如果第 2 步没搬的话）
- 从 researchContext.mjs 删除 loadUserMethodology 和 formatResearchStateForPrompt
- 标记 tasks/task_runs/task_steps 表为 deprecated
- 前端删除 plan 相关 UI（plan_proposal 渲染、确认执行按钮、任务进度条）
- 前端删除 confirmAndExecutePlan / cancelPlan 的 API 调用

---

## 验收标准

### 每个阶段的验收

**第 1 阶段验收：**
- [ ] AI 调 create_card 不传 source_url，raw_snippet 不在知识库中 → 返回可纠错错误 → AI 调 semantic_search → 重新传入原文 → 成功创建
- [ ] AI 调 create_card，raw_snippet 来自刚摄入但未完成分块的材料 → 返回软警告 → 卡片创建成功
- [ ] commitDraft 包含 evidence 挂在 question 下的 change → 该 change 被跳过 → 后续引用该 temp_id 的 change 也被跳过 → 其他正常创建 → 返回结果包含 skipped 信息
- [ ] AI 同时调 semantic_search + create_board_node → 消息结构正确，API 不报错
- [ ] conversation_summary 取的是最近 20 条消息的内容
- [ ] get_board_health 不在 topic 下调用 → 返回明确错误信息
- [ ] create_board_node 传错 parent_id → 错误返回里包含 available_parents 列表

**第 2 阶段验收：**
- [ ] orchestrator.mjs 行数 < 350
- [ ] chat() 函数行数 < 60（循环本身）
- [ ] 长对话（100 条消息） → buildContextMessages 返回摘要 + 最近 40 条，不超 context window
- [ ] 对话超过 60 条文本消息 → 自动触发结构化摘要生成 → 摘要包含 5 个分区且每个分区非空
- [ ] 结构化摘要保留了"用户判断"信息（抽查验证）
- [ ] chatConfirm 连续 4 次 pending → 第 4 次自动终止
- [ ] system prompt < 500 tokens
- [ ] 关键工具 description 包含领域规则
- [ ] API 返回 context overflow → catch 住，砍掉前半段历史重试 → 成功

**第 3 阶段验收：**
- [ ] HARNESS_V2=true 时全部 23 个工具对 AI 可见
- [ ] chat 模式下 AI 选了 confirm 工具 → 收到"请切换代理模式"错误
- [ ] chat 模式下 AI 选了 propose_board_changes → 行为符合产品决策（被拦截或允许）
- [ ] AI 按需调 get_methodology → 拿到方法论文档
- [ ] AI 按需调 get_board_health → 拿到研究状态
- [ ] 不需要 planner，AI 在循环内完成多步骤任务（fetch_rss → ingest → search → create_card）
- [ ] 复杂任务时 AI 先用文字描述计划 → 用户确认 → AI 开始调工具执行

**第 4 阶段验收：**
- [ ] 代码库只剩 8 个文件（orchestrator, tools, toolExecutor, contextManager, draftEngine, researchContext, validation, promptBuilder）
- [ ] 没有任何引用 toolGroups / contextBudget / planner / executor 的 import
- [ ] 前端无 plan 相关 UI

---

## 始终保持的不变量

改造过程中，以下设计无论如何不能破坏：

1. **Context Auto-Injection 必须工作**：surfaceContext 里的 topicId/boardId/materialId 自动注入到工具参数。AI 不碰 UUID。新增工具时必须检查是否需要加入 CONTEXT_DEFAULTS 的 tools 列表。
2. **草稿系统必须完整**：propose_board_changes → board_drafts 表 → 前端预览 → commitDraft 创建真实节点。$temp_id 解析正常。commitDraft 新增的层级校验只跳过违规节点，不中断整个 commit。
3. **sanitizeReply 必须保留**：回复中的 UUID 和工具名被清理。
4. **Q→H→E 层级在代码层面强制**：create_board_node、propose_board_changes、commitDraft 三个入口都校验。校验逻辑统一在 validation.mjs。
5. **raw_snippet 在代码层面强制是原文**：不依赖 source_url，不依赖 prompt 禁令。支持时序竞态的软警告。
6. **会话消息顺序正确**：串行锁保证同一会话不并发处理。消息结构不出现无配对的 tool_call。
7. **结构化摘要保留用户判断**：摘要的"用户判断"分区不能被省略。丢失用户对假说/方向的判断比丢失工具调用结果更严重——后者可以重新调工具恢复，前者不可恢复。
