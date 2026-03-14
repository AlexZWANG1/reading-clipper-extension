# Ralph Loop Prompt: Spec-Driven Exploration

> 这个 prompt 用于 Ralph Loop 执行。
> 使用方式: /ralph-loop --max-iterations 50 --completion-promise "All high-priority spec gaps have been addressed and committed"

---

## Prompt

在 reading-clipper-extension 工作区，围绕最新的产品定义文档执行探索式开发。

严格遵守"Spec-first、small-batch、可回退、可验证"原则。

### 约束来源（必须先读完）

- docs/PRODUCT-SPEC.md — 产品合约（最高优先级）
- docs/ARCHITECTURE.md — 系统架构约束
- docs/LEARNING-GUIDE.md — 开发哲学

### 每轮迭代必须做的事

1. 如果是第一轮：读完三个文档，总结产品是什么、核心 loop 是什么、什么叫好的 AI 行为，检查 git 状态，创建安全基线提交
2. 如果不是第一轮：检查 git log 看上一轮做了什么，决定下一个最有价值的小步改进
3. 选一个最小但有价值的改进，明确它对应 Spec 的哪一部分
4. 读相关代码，设计最小方案，修改少量文件
5. 运行测试（cd reading-cards-backend && node --test "test/**/*.test.mjs"）
6. 自评：这次改动是否更符合 Spec？是否增加了不必要复杂度？
7. 满足条件就 commit（小步提交，commit message 说明改了什么、为什么、对应哪条 Spec）
8. 如果卡住或改动变大，缩小范围或跳到下一个目标

### 优先级（P0 最高）

P0: 明显违背 Spec 的地方 — AI 行为冲突、权限/确认/可追溯性不符、Chat 没扮演 orchestration layer、Surface 不符合 contract

P1: 高杠杆核心体验增强 — Reader/Board/Chat/Memo 更符合 surface contract、研究推进感更可见、AI draft/write/destructive 边界更清楚

P2: 可信度和可控性增强 — AI draft vs committed 区分更明确、confirmation 机制更清晰、traceability 展示更好

P3: 开发质量增强 — 补测试、补状态保护、降低脆弱逻辑

### 重点探索方向

1. promptBuilder 是否真正遵循 AI Behavior Contract（Spec Section 10）
2. toolGroups 是否正确实现 AI Restriction Matrix（Spec Section 11）
3. orchestrator 的 confirmation gate 是否完整实现 bounded autonomy
4. 现有测试是否覆盖信任不变量（confirmation gate、tool group scoping、board hierarchy validation）
5. Chat 体验是否像 orchestration layer 而不是独立聊天 app
6. Reader 是否回答"这篇文章说了什么"这个核心问题
7. Board health 是否让用户一眼看到研究状态
8. Cold start / empty state 的最小改善

### 硬限制

每轮改动：
- 尽量 ≤5 个文件
- 尽量不跨太多模块
- 不引入新框架或大型依赖
- 不做数据库迁移（除非极小且必要）
- 不大规模重写 UI
- 不删除核心 feature
- 不扩大 AI 自治权限
- 不把系统简化成普通 chat app

### 禁止

- 大规模重写页面结构
- 全局替换状态管理
- 重构大量 API 只为"更干净"
- 为自动化牺牲可审阅性
- 把 open-ended thinking 变成僵硬表单

### 结束条件

当以下任一成立时输出总结并结束：
- 已完成多个高质量小步改进且系统稳定
- 只剩大改才有收益
- 测试/构建风险上升
- 有清晰的 follow-up list

结束时输出：今晚做了哪些提交、每个改善了什么、哪些更符合 Spec、下一轮做什么、哪些想法被放弃。
