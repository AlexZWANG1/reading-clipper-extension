# Ralph Loop Prompt: Workspace Redesign (Full Freedom)

> 使用方式: /ralph-loop --max-iterations 100 --completion-promise "Workspace redesign fully implemented, builds pass, product works end-to-end"

---

## Prompt

你正在执行 Verity 产品的全面重设计。前端和后端都可以改。你拥有完全的自由度。

### 唯一指南

**完整读完这个文件，它是你所有工作的依据：**

`docs/superpowers/specs/2026-03-15-workspace-redesign-design.md`

这份设计规范包含 16 节、634 行，覆盖了：
- 产品架构（两层结构：Workspace + Management）
- 工作空间布局（Board 永久画布 + Chat+Journal 统一流 + 可折叠左导航）
- Canvas 两面（Structure View + Document View）
- Chat+Journal 统一信息流
- Research Run 作为自主 AI Agent
- Draft 审批机制
- 管理层（TopicsHome + Inbox）
- 组件复用与迁移计划
- 数据流、状态管理、路由变化
- 视觉设计原则、动画、信息密度
- 四阶段迁移策略

**其他参考文档（需要时查看）：**
- `docs/PRODUCT-SPEC.md` — 产品愿景
- `docs/ARCHITECTURE.md` — 系统架构

### 你可以做任何事

前端、后端、prompts、工具定义、API、状态管理、路由、组件 —— 都可以改。只要是为了实现设计规范中的愿景，你都有权做。

仔细读现有代码，充分理解后再改动。改完验证：
- 前端：`cd web-app && npx vite build`
- 后端：`cd reading-cards-backend && node --test "test/**/*.test.mjs"`

每完成一个逻辑单元就 commit。commit message 说清楚改了什么、对应设计规范的哪一节。

遇到问题自己解决。构建失败立即修。卡住就换方向。做到尽善尽美。
