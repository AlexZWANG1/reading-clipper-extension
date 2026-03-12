你正在对 Reading Clipper Extension 项目进行通宵代码审查和质量优化循环。

## 绝对安全规则
1. 绝对不要删除任何文件，除非你 100% 确认是孤立的调试/临时文件（如 test_agent1.mjs）
2. 绝对不要修改 .env、supabase/migrations/、AGENTS.md
3. 绝对不要改变 API 路由路径、端口号、导出函数签名
4. 绝对不要添加新的 npm 依赖
5. 每次改动后必须运行验证：后端 cd reading-cards-backend && npm test，前端 cd web-app && npx vite build
6. 验证失败立即 git checkout -- . 回滚，换个方式
7. 每个逻辑改动完成后 git commit，消息前缀用 fix/refactor/test/docs
8. 不确定就跳过，宁可保守

## 每次迭代开始时
更新 docs/ralph-loop-progress.md 记录：当前迭代号、当前阶段、本次计划、历史摘要、遇到的问题

## Phase 1: 安全与关键 Bug（迭代 1-4）
- 移除 routes/v2/search.mjs 和 materials.mjs 中硬编码的 rc-sidecar-2026 fallback
- 统一 Supabase client：search.mjs、materials.mjs、highlights.mjs 用共享的 supabaseAdmin 替代内联 createClient
- 修复 orchestrator.mjs 中 .catch(() => {}) 静默吞错，改为 console.error
- 修复 ingestion.mjs fire-and-forget promise 加错误日志
- 修复 middleware/auth.mjs optionalAuth 静默吞错

## Phase 2: 后端代码质量（迭代 5-8）
- 统一所有 routes/v2/ 的错误响应格式为 { ok: boolean, data?, error? }，先检查 web-app/src/lib/api.js 确保不破坏前端
- 给 cards.mjs updateCard、topics.mjs、sources.mjs、chat.mjs 加基础输入验证（inline，不加依赖）
- 替换 aiClient.mjs 过多的 console.log 为条件 debug 日志
- 修复 rss/scheduler.mjs 的 runTick 竞态条件

## Phase 3: 前端代码质量（迭代 9-12）
- 搜索所有 .jsx 中 useEffect 缺少 cleanup 的地方，补上 clearTimeout/removeEventListener/AbortController
- 创建 ErrorBoundary.jsx 组件，包裹 App.jsx 中的主要路由
- 统一颜色系统：把 TopicsPage.jsx 的 TOPIC_COLORS 移到 ui-utils.js，所有消费者用共享定义
- api.js 加 30s 超时，修复 .json().catch(() => ({})) 静默吞错

## Phase 4: 测试补充（迭代 13-16）
- 用 node:test + node:assert 写后端测试（不加新依赖）
- test/routes-cards.test.mjs：输入验证测试（无效输入返回 400）
- test/routes-chat.test.mjs：消息处理基本逻辑
- test/services-rss-sync.test.mjs：去重逻辑
- 确保所有现有测试 + 新测试通过

## Phase 5: 架构文档与总结（迭代 17-20）— 这是最重要的阶段

### 5.1 创建 docs/ARCHITECTURE.md — 面向开发者的技术架构教学文档
用中文写，内容必须包括：
- 系统全景图（文字版架构图）：浏览器扩展 → Web App → Backend API → Supabase → AI Services
- 每个模块的职责说明：reading-cards-backend（API层、Chat系统、RSS系统、Task系统）、web-app（页面、组件、状态管理）、browser-extension
- 数据流详解：用户从浏览器剪藏 → 后端处理 → 存储 → 前端展示的完整链路
- 技术栈清单和版本：Express、React、Vite、Supabase、OpenAI、Zustand 等
- 目录结构注释说明每个文件夹的用途
- 认证流程：Supabase Auth → JWT → middleware → RLS
- 外部服务集成：OpenAI（chat）、Jina Reader（URL提取）、RSS feeds
- AI Chat 系统架构：orchestrator → planner → executor → tools 的调用链
- 状态管理架构：Zustand store 的设计和数据流
- 关键设计决策和 tradeoff 说明

### 5.2 创建 docs/CODE-REVIEW-REPORT.md — 完整的代码审查报告
用中文写，内容必须包括：
- 项目健康度评分（满分10分，各维度打分：安全性、可维护性、测试覆盖、代码质量、架构设计）
- 本次循环修复的所有问题清单（标注 Phase 和 commit）
- 发现但未修复的问题（附原因和建议修复方案）
- 安全审计结论
- 性能瓶颈分析
- 技术债务地图：按严重程度排列的待办事项
- 与行业最佳实践的差距分析
- 下一步改进路线图（短期1周、中期1月、长期3月）
- 对项目负责人的建议：哪些技术领域值得深入学习

### 5.3 创建 docs/LEARNING-GUIDE.md — 基于本项目的技术学习指南
用中文写，帮助项目负责人理解自己项目中用到的每个技术概念：
- Express 中间件链和路由设计模式（结合本项目的 auth middleware 和 route 组织方式讲解）
- React 组件设计原则（结合本项目的组件拆分问题讲解）
- Zustand 状态管理模式（结合 store.js 讲解）
- Supabase RLS 安全模型（结合本项目的 auth 流程讲解）
- REST API 设计最佳实践（结合本项目的 routes/v2 讲解）
- AI Agent 编排模式（结合 orchestrator/planner/executor 讲解）
- RSS 订阅系统设计（结合 services/rss 讲解）
- 前端性能优化（结合本项目的大组件问题讲解）
- 测试策略和金字塔（结合本项目的测试缺口讲解）
- Git 工作流最佳实践

完成所有 Phase 且所有测试通过后，输出 <promise>OVERNIGHT_REVIEW_DONE</promise>
