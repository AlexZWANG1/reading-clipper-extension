# Ralph Loop Prompt: Workspace Redesign

> 使用方式: /ralph-loop --max-iterations 100 --completion-promise "Phase 1-3 of workspace redesign complete, core workspace functional"

---

## Prompt

你正在执行 Verity 产品的全面工作空间重设计。这是一次大规模前端重构，将多页面应用转变为以 Topic 为核心的单页沉浸式研究工作空间。

**你有充分的自由度去创建、重构、重组文件和组件。** 不要害怕大改动 —— 这正是这次任务的目的。

### 唯一的真相来源

- `docs/superpowers/specs/2026-03-15-workspace-redesign-design.md` — **设计规范（最高优先级）**
- `docs/ARCHITECTURE.md` — 系统架构参考
- `docs/PRODUCT-SPEC.md` — 产品愿景参考

设计规范是你的北极星。每个决定都应该能追溯到规范的某一节。

### 你被授权做的事

- ✅ 创建新组件、新页面、新 store
- ✅ 重构现有页面结构（CardsPage → TopicsHome + TopicWorkspace）
- ✅ 从大文件中提取组件（ThinkingBoardPage → BoardCanvas）
- ✅ 修改路由结构（App.jsx）
- ✅ 创建新的 Zustand store（workspaceStore）
- ✅ 修改布局组件（Layout.jsx → ManagementLayout + WorkspaceLayout）
- ✅ 移动/重命名文件以符合新架构
- ✅ 删除不再需要的组件和路由
- ✅ 修改样式和交互模式
- ✅ 一次改动涉及多个文件（10+ 是正常的）

### 硬限制（不可违反）

- ❌ 不要修改后端 API（reading-cards-backend/）—— 只改前端
- ❌ 不要修改数据库 schema 或 Supabase 配置
- ❌ 不要引入新的大型框架（React Flow、Zustand、Tailwind 已有，保持使用）
- ❌ 不要删除后端测试
- ❌ 不要修改 .env 文件或认证流程
- ❌ 不要在未验证前删除旧路由（Phase 4 才做清理）

### 执行策略

按设计规范 §13 的四阶段执行，但不要机械地一步步走 —— 你可以在阶段内自由安排顺序，跨阶段做准备工作。

**Phase 1: Foundation（提取 + 基础设施）**
重点：从现有大文件中提取可复用组件，创建基础设施
- 从 ThinkingBoardPage (1390行) 提取 BoardCanvas
- 从 ThinkingBoardPage + EmbeddedThinkBoard 提取 MonoStepEdge
- 从 MaterialReaderPage 提取 WorkspaceReader
- 创建 workspaceStore (Zustand)
- 创建 WorkspaceLayout shell
- 这些提取不应破坏现有页面 —— 旧页面先 import 提取出的组件

**Phase 2: Core Workspace（核心体验）**
重点：构建沉浸式工作空间
- TopicWorkspace 页面（编排 Canvas + Chat + LeftNav）
- WorkspaceCanvas（Board 的 structure/document 切换）
- WorkspaceLeftNav（从 TopicsSidebar 演化）
- ChatJournalPanel（从 GlobalChatPanel 演化，加 JournalBlock）
- 接入 /topics/:topicId 路由

**Phase 3: Management Layer（管理层）**
重点：构建管理首页
- TopicsHome（Topic 卡片网格 + Inbox）
- InboxPanel（未分类材料/卡片）
- 接入 / 路由

**Phase 4: Cleanup（清理，谨慎执行）**
重点：删除旧代码，确认无回退
- 先确认新工作空间完全可用
- 再逐步移除旧路由和废弃组件
- 最后整理 import 和未使用代码

### 每轮迭代的工作方式

1. **决定目标**：选择当前阶段中最有价值的下一步
2. **读代码**：理解要改动的文件的现状
3. **实现**：大胆修改，但保持代码质量
4. **验证**：运行 `cd web-app && npx vite build` 确保编译通过
5. **自评**：这次改动是否推进了设计规范的落地？
6. **提交**：commit message 格式 `feat/refactor(workspace): 描述 (Spec §N)`

### 验证方式

- 每次改动后运行 `cd web-app && npx vite build`
- 如果有后端相关改动（不应该有），运行 `cd reading-cards-backend && node --test "test/**/*.test.mjs"`
- 构建失败立即修复，不要跳过
- 大的提取完成后可以用 `grep -r "旧组件名"` 确认没有遗漏引用

### 遇到困难时

- 如果提取太复杂，先做最小可行提取（props 可以多一些，后面精简）
- 如果不确定组件边界，参考设计规范 §9 的组件职责描述
- 如果旧组件耦合严重，先 copy 再 refactor（不要在原地大改导致旧页面崩溃）
- 如果卡在某个方向超过 2 轮，换到另一个可以并行推进的任务

### 提交策略

- 频繁提交，每完成一个逻辑单元就提交
- commit message 带 Spec 引用：`feat(workspace): extract BoardCanvas from ThinkingBoardPage (Spec §4, §9)`
- 一个 commit 可以涉及多文件，但应该是一个逻辑完整的改动
- 如果改动太大，拆成多个 commit

### 结束条件

当以下条件满足时输出总结并结束：
- Phase 1-3 的核心组件已创建且可编译
- TopicWorkspace 可以渲染（即使部分功能不完整）
- 旧路由仍然可用（Phase 4 清理留给下一轮）
- 有清晰的剩余工作列表

结束时输出：
1. 完成了哪些提交，每个对应设计规范的哪一节
2. 新的文件/组件结构
3. 哪些组件已提取/创建
4. 哪些旧页面已被替代（如果有）
5. 下一轮应该做什么
6. 遇到的技术挑战和决策
