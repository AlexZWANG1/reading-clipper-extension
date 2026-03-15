# Ralph Loop Prompt: Workspace Redesign

> 使用方式: /ralph-loop --max-iterations 100 --completion-promise "Phase 1-4 workspace redesign complete, all builds pass, old routes cleaned up"

---

## Prompt

你正在执行 Verity 产品的全面工作空间重设计。这是一次大规模前端重构，将 15 路由多页面应用转变为以 Topic 为核心的单页沉浸式研究工作空间。

**你有充分的自由度去创建、重构、重组文件和组件。** 不要害怕大改动 —— 这正是这次任务的目的。

### 真相来源（必须先读完再动手）

1. **`docs/superpowers/specs/2026-03-15-workspace-redesign-design.md`** — 设计规范（最高优先级，16 节，634 行）
2. **`docs/PRODUCT-SPEC.md`** — 产品愿景参考
3. **`docs/ARCHITECTURE.md`** — 系统架构参考

设计规范是你的北极星。每个决定都应该能追溯到规范的某一节。第一轮必须完整读完设计规范。

### 当前前端架构摘要（节省你探索时间）

**页面（15 个路由，在 App.jsx 中）：**
- `/` → CardsPage.jsx (1064行) — 当前主工作台，三面板布局，三个 tab
- `/topics/:topicId` → ThinkingBoardPage.jsx (1390行，lazy loaded) — 全屏 React Flow 画板
- `/materials/:id` → MaterialReaderPage.jsx (~350行) — 全屏阅读器
- `/chat` → ChatPage.jsx — 独立聊天页
- `/topics` → TopicsPage.jsx — Topic 列表页
- 其他：MaterialsPage, RssPage, SourcesPage, AISettingsPage, TasksPage, TaskDetailView, DownloadPage, LoginPage, RegisterPage

**关键组件：**
- `Layout.jsx` — 全局导航栏 + Outlet，有全屏检测逻辑
- `GlobalChatPanel.jsx` (526行) — 浮动聊天面板，fixed bottom-6 right-6 z-50
- `TopicsSidebar.jsx` (542行) — 两种模式：Topic 列表浏览 + 证据池卡片列表
- `EmbeddedThinkBoard.jsx` — CardsPage 中的嵌入式 Board（将被替代）
- `BoardChatPanel.jsx` — Board 专用聊天（将被 ChatJournalPanel 吸收）
- `CanvasPlaceholder.jsx` — CardsPage 右面板包装器（将被替代）
- `DraftCommitBar.jsx` / `DraftNode.jsx` — 草稿审批系统（保留复用）
- `HealthSidebar.jsx` — Board 健康度面板（重定位为 Board 叠加层）
- `components/board/` — QuestionNode, HypothesisNode, EvidenceNode（保留复用）
- `components/Reader/` — ReaderContent, SelectionPopover, CardsSidebar, AIPanel（保留复用）
- `components/workspace/` — **空目录，已创建，供你使用**

**Zustand Stores（10 个，在 lib/store.js）：**
- useAuthStore, useCardsStore, useTopicsStore, useDocumentsStore, useSourcesStore
- useTasksStore, useRssStore, useConversationsStore, useChatStore, useUIStore
- 需要创建第 11 个：**useWorkspaceStore**

**Hooks：**
- `hooks/useSurfaceContext.js` — 基于路由检测 surface（board/reader/cards/general），需要迁移到读 workspaceStore

**关键技术：**
- React 18 + React Router v6 + @xyflow/react (React Flow) + Zustand + Tailwind CSS
- dagre 自动布局 (rankdir TB, ranksep 120, nodesep 80)
- LOD 系统: zoom < 0.35 → mini, < 1.15 → normal, else full
- MonoStepEdge 自定义边：**在 ThinkingBoardPage (line 52) 和 EmbeddedThinkBoard (line 49) 中有两份冗余代码**
- CSS 变量系统：`--bg-0`, `--surface-0`, `--text-0`, `--accent-400`, `--stroke-0` 等

### 你被授权做的事

- ✅ 创建新组件、新页面、新 store、新 hooks
- ✅ 重构现有页面结构（CardsPage → TopicsHome + TopicWorkspace）
- ✅ 从大文件中提取组件（ThinkingBoardPage → BoardCanvas）
- ✅ 修改路由结构（App.jsx）
- ✅ 创建 useWorkspaceStore (Zustand) 在 lib/store.js 或单独文件
- ✅ 修改布局组件（Layout.jsx → ManagementLayout + WorkspaceLayout）
- ✅ 移动/重命名文件以符合新架构
- ✅ 删除不再需要的组件和路由（Phase 4）
- ✅ 修改样式和交互模式
- ✅ 一次改动涉及多个文件（10+ 是正常的）
- ✅ 在 `components/workspace/` 目录下创建新组件

### 硬限制（不可违反）

- ❌ 不要修改后端代码（reading-cards-backend/ 下的任何文件）
- ❌ 不要修改数据库 schema 或 Supabase 配置
- ❌ 不要引入新的大型框架（React Flow、Zustand、Tailwind 已有）
- ❌ 不要修改 .env 文件或认证流程
- ❌ 不要修改后端测试文件
- ❌ Phase 1-3 期间不要删除旧路由（保持旧页面可用作为回退）

### 执行策略

按设计规范 §13 的四阶段执行。你可以在阶段内自由安排顺序，跨阶段做准备。**每个阶段完成后做一次自评。**

---

**Phase 1: Foundation（提取 + 基础设施）**

目标：从现有大文件中提取可复用组件，创建基础设施。**这些提取不应破坏现有页面 —— 旧页面 import 提取出的组件即可。**

| 任务 | 源文件 | 目标 | Spec 引用 |
|------|--------|------|-----------|
| 提取 MonoStepEdge | ThinkingBoardPage L52 + EmbeddedThinkBoard L49 | `components/board/MonoStepEdge.jsx` | §4, §9 |
| 提取 BoardCanvas | ThinkingBoardPage (1390行) | `components/workspace/BoardCanvas.jsx` | §4, §9 |
| 提取 WorkspaceReader | MaterialReaderPage (~350行) | `components/workspace/WorkspaceReader.jsx` | §9 |
| 创建 workspaceStore | 新建 | `lib/store.js` 或 `lib/workspaceStore.js` | §10 |
| 创建 WorkspaceLayout | 新建 | `components/workspace/WorkspaceLayout.jsx` | §12 |

**BoardCanvas 提取策略（最高风险）：**
- 吸收：ReactFlow setup, node/edge rendering, dagre layout, LOD, selection/focus, draft display, DraftCommitBar, node CRUD, drag-and-drop, edge connection
- 不吸收：页面 chrome（返回按钮、标题）, 证据池侧边栏（→ WorkspaceLeftNav）, 全屏布局（→ workspace 编排）
- Props: `topicId`, `boardId`, `onBoardMutated`, `boardRefreshToken`
- **关键**：BoardCanvas 在视图切换时不能 unmount（用 CSS hidden，不用条件渲染）

**WorkspaceReader 提取策略：**
- 吸收：material fetch, chunk loading, highlight, selection state, card creation
- 复用子组件：ReaderContent, SelectionPopover, CardsSidebar, AIPanel（直接 import）
- 新增 `isEmbedded` 模式（不用 h-screen, 不用 fixed modals）
- Props: `materialId`, `onClose`, `onCardCreated`

---

**Phase 2: Core Workspace（核心体验）**

目标：构建沉浸式工作空间，接入路由。

| 任务 | 描述 | Spec 引用 |
|------|------|-----------|
| TopicWorkspace | 编排 Canvas + Chat + LeftNav + Reader split | §3, §2 |
| WorkspaceCanvas | Board structure/document 切换，BoardCanvas 不 unmount | §4 |
| DocumentView | 从 Q→H→E 数据生成结构化报告（Stage 1: 只读） | §4, §14 |
| WorkspaceLeftNav | 从 TopicsSidebar 演化，Materials + Cards 列表，可折叠 | §3, §9 |
| ChatJournalPanel | 从 GlobalChatPanel 演化，加 JournalBlock，固定右栏 | §5, §9 |
| JournalBlock | AI reasoning entry 组件，可折叠 | §5 |
| 路由接入 | `/topics/:topicId` → WorkspaceLayout > TopicWorkspace | §12 |
| useSurfaceContext 迁移 | workspace 内读 workspaceStore 而非 route | §10 |

**TopicWorkspace 布局要求（Spec §3）：**
```
┌──┬────────────────────────────┬──────────────────┐
│📁│  Board Canvas (60-70%)     │ Chat+Journal     │
│  │  [Structure] [Document]   │ (30-40%)         │
│  │                            │                  │
└──┴────────────────────────────┴──────────────────┘
```
- 左边：可折叠 nav（collapsed = icon only）
- 中间：Board Canvas（永远存在，structure/document 切换）
- 右边：ChatJournalPanel（固定列，不是浮动覆盖）
- Reader 打开时：在 Board 和 LeftNav 之间插入 split panel

---

**Phase 3: Management Layer（管理层）**

| 任务 | 描述 | Spec 引用 |
|------|------|-----------|
| TopicsHome | Topic 卡片网格 + Inbox | §8 |
| InboxPanel | 未分类材料/卡片的可展开面板 | §8 |
| ManagementLayout | 复用现有 Layout.jsx + 更新导航项 | §12 |
| 路由重构 | `/` → ManagementLayout > TopicsHome | §9, §12 |

**TopicsHome 要求（Spec §8）：**
- Topic 卡片网格，每张卡片显示材料/卡片数量
- 点击 Topic → 进入 TopicWorkspace
- Inbox 在下方，单行显示计数，点击展开
- Inbox 为空时隐藏

---

**Phase 4: Cleanup（清理）**

在确认新工作空间完全可用后：
- 移除旧路由：`/chat`, `/topics` (list), `/rss`, `/sources`, `/ai-settings`, `/download`, `/materials/:id`
- 退役组件：BoardChatPanel, EmbeddedThinkBoard, CanvasPlaceholder
- 更新 ThinkingBoardPage 改为使用 BoardCanvas（如果还没替换）
- 整理未使用的 import
- 确保所有导航指向正确位置

### 每轮迭代的工作方式

1. **决定目标**：选择当前阶段中最有价值的下一步
2. **读代码**：仔细理解要改动的文件现状，**不要凭记忆假设代码内容**
3. **思考**：这个改动的边界在哪？会影响哪些文件？有没有更简单的方式？
4. **实现**：大胆修改，但保持代码质量，遵循现有的 CSS 变量系统和代码风格
5. **验证**：`cd web-app && npx vite build` — 构建必须通过
6. **自评**：这次改动推进了设计规范的哪一部分？有没有引入不必要的复杂度？
7. **提交**：`feat/refactor(workspace): 描述 (Spec §N)`

### 验证方式

- **每次改动后**运行 `cd web-app && npx vite build`
- 构建失败 → 立即修复，不跳过，不跳到下一个任务
- 大提取完成后检查旧页面是否还能正常工作（import 路径正确）
- Phase 4 清理后做一次完整构建验证

### 代码质量要求

- 使用现有的 CSS 变量系统（`--bg-0`, `--surface-0`, `--text-0` 等），不要硬编码颜色
- 使用 Tailwind 的 utility class 风格，与现有代码一致
- 组件 props 使用解构，不要 `props.xxx`
- 用 `useCallback` 和 `useMemo` 优化渲染，与现有代码一致
- 新组件文件名用 PascalCase，放在 `components/workspace/` 下
- 新页面放在 `pages/` 下

### 遇到困难时

- 提取太复杂 → 先做最小可行提取（props 多一些没关系）
- 不确定边界 → 参考设计规范 §9 的组件职责
- 旧组件耦合严重 → 先 copy 到新位置再 refactor（不要在原地大改）
- 卡住超过 2 轮 → 换到另一个可并行的任务
- 构建失败 → 回溯检查 import 路径和 export

### 提交策略

- 每完成一个逻辑单元就提交
- commit message 带 Spec 引用：`feat(workspace): extract BoardCanvas from ThinkingBoardPage (Spec §4, §9)`
- 可以多文件一个 commit，但必须是一个逻辑完整的改动
- 大改动拆成多个 commit

### 结束条件

当以下全部满足时输出总结并结束：
- Phase 1-4 的核心工作已完成
- `npx vite build` 通过
- 新的 TopicWorkspace 可以渲染并包含 Board + Chat + LeftNav
- TopicsHome 管理首页可以渲染
- 旧的废弃路由和组件已清理
- 有清晰的后续打磨列表

结束时输出：
1. 完成了哪些提交，每个对应设计规范的哪一节
2. 新的文件/组件结构
3. 哪些组件已提取/创建/退役
4. 路由变化前后对比
5. 下一轮应该做什么（交互打磨、动画、Research Run 集成等）
6. 遇到的技术挑战和关键决策
