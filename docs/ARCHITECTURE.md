# Verity (求真) 技术架构教学文档

> 本文档面向开发者和技术负责人，全面介绍 Reading Clipper / Verity 项目的技术架构、设计决策和实现细节。
> 最后更新：2026-03-14

---

## 目录

1. [系统全景图](#1-系统全景图)
2. [目录结构总览](#2-目录结构总览)
3. [技术栈清单](#3-技术栈清单)
4. [模块职责说明](#4-模块职责说明)
5. [数据流详解](#5-数据流详解)
6. [认证流程](#6-认证流程)
7. [AI Chat 系统架构](#7-ai-chat-系统架构)
8. [Task 系统架构](#8-task-系统架构)
9. [RSS 订阅系统](#9-rss-订阅系统)
10. [状态管理架构](#10-状态管理架构)
11. [外部服务集成](#11-外部服务集成)
12. [关键设计决策与 Tradeoff](#12-关键设计决策与-tradeoff)

---

## 1. 系统全景图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        用户触达层                                    │
│                                                                     │
│  ┌──────────────────┐    ┌──────────────────────────────────────┐   │
│  │  浏览器扩展       │    │  Web App (React SPA)                 │   │
│  │  (Chrome Extension)│    │  - 知识卡片管理                      │   │
│  │  - 右键剪藏       │    │  - 思维论证画板                      │   │
│  │  - 导入页面到阅读器│    │  - AI 对话 / 研究任务                │   │
│  │  - 登录 / 设置    │    │  - RSS 订阅阅读                     │   │
│  └──────┬───────────┘    │  - 材料阅读器                        │   │
│         │                └──────────────┬───────────────────────┘   │
│         │                               │                           │
└─────────┼───────────────────────────────┼───────────────────────────┘
          │ REST API                      │ REST API
          │ (Bearer JWT)                  │ (Bearer JWT)
          ▼                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     后端 API 层 (Express.js)                        │
│                     reading-cards-backend :3000                      │
│                                                                     │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────────┐ │
│  │ Cards API  │  │ Chat API   │  │ RSS API    │  │ Tasks API    │ │
│  │ Topics API │  │ Boards API │  │ Sources API│  │ Materials API│ │
│  │ Docs API   │  │ Search API │  │ Settings   │  │ Highlights   │ │
│  └─────┬──────┘  └──────┬─────┘  └─────┬──────┘  └──────┬───────┘ │
│        │                │               │                │         │
│  ┌─────┴────────────────┴───────────────┴────────────────┴───────┐ │
│  │                   服务层 (Services)                            │ │
│  │  aiClient.mjs │ agents.mjs │ ingestion.mjs │ searchService    │ │
│  │  chat/orchestrator │ chat/planner │ chat/executor              │ │
│  │  rss/sync │ rss/scheduler │ rss/discovery                     │ │
│  │  tasks/runner │ tasks/contextBuilder                           │ │
│  └─────┬────────────────┬───────────────┬────────────────────────┘ │
└────────┼────────────────┼───────────────┼────────────────────────────┘
         │                │               │
         ▼                ▼               ▼
┌────────────────┐ ┌──────────────┐ ┌──────────────────────────────────┐
│  Supabase      │ │  AI Services │ │  Content Fetch Service :8200     │
│  (PostgreSQL)  │ │  OpenAI API  │ │  - URL 内容提取 (Readability)    │
│  - Auth (JWT)  │ │  Anthropic   │ │  - Puppeteer (JS渲染页面)        │
│  - RLS 策略    │ │  Custom Proxy│ │  - HTML 解析 / 元数据提取        │
│  - Storage     │ ├──────────────┤ └──────────────────────────────────┘
│  - Realtime    │ │  Ingestion   │
└────────────────┘ │  Sidecar     │ ← Python 服务 :8100
                   │  :8100       │   (chunking + embedding)
                   │  - 文本分块  │
                   │  - 向量嵌入  │
                   └──────────────┘
```

### 架构说明

系统由四大部分组成：

1. **客户端层**：浏览器扩展 + React Web App，通过 REST API 与后端通信
2. **API 网关层**：Express.js 后端，负责路由、认证、业务逻辑编排
3. **服务层**：AI 调用、RSS 同步、内容摄入、搜索等核心服务
4. **基础设施层**：Supabase（数据库 + 认证）、AI API、内容提取微服务、向量嵌入 sidecar

---

## 2. 目录结构总览

```
reading-clipper-extension/
│
├── reading-cards-backend/          # 后端主服务 (Node.js + Express)
│   ├── src/
│   │   ├── server.mjs              # Express 入口，路由注册，CORS 配置
│   │   ├── config/
│   │   │   ├── supabase.mjs        # Supabase 客户端（Admin + User-scoped）
│   │   │   ├── models.config.json  # AI 模型列表配置
│   │   │   └── prompts.config.json # AI Prompt 模板配置
│   │   ├── middleware/
│   │   │   └── auth.mjs            # JWT 认证中间件（requireAuth / optionalAuth）
│   │   ├── routes/
│   │   │   ├── auth.mjs            # 登录/注册/刷新令牌
│   │   │   └── v2/                 # V2 版 API 路由
│   │   │       ├── cards.mjs       # 卡片 CRUD + AI 生成
│   │   │       ├── topics.mjs      # 主题管理
│   │   │       ├── boards.mjs      # 思维论证画板（节点 + 边）
│   │   │       ├── chat.mjs        # AI 对话入口
│   │   │       ├── conversations.mjs # 对话历史管理
│   │   │       ├── documents.mjs   # 文档（故事线）
│   │   │       ├── materials.mjs   # 材料摄入 + 阅读器
│   │   │       ├── search.mjs      # 语义搜索
│   │   │       ├── highlights.mjs  # 阅读高亮
│   │   │       ├── rss.mjs         # RSS 订阅管理
│   │   │       ├── tasks.mjs       # 研究任务管理
│   │   │       ├── sources.mjs     # 信息源
│   │   │       ├── settings.mjs    # 用户设置（AI 配置）
│   │   │       ├── invites.mjs     # 邀请码
│   │   │       ├── hypotheses.mjs  # 假设建议/验证
│   │   │       ├── prompts.mjs     # Prompt 模板管理
│   │   │       └── ai_boards.mjs   # AI 辅助画板分析
│   │   ├── chat/                   # AI Chat 编排系统
│   │   │   ├── orchestrator.mjs    # 主编排器（对话循环 + 工具调用）
│   │   │   ├── planner.mjs         # 计划生成器（意图 → 执行计划）
│   │   │   ├── executor.mjs        # 计划执行器（步骤顺序执行）
│   │   │   ├── tools.mjs           # 工具定义（函数签名 + 副作用标记）
│   │   │   └── toolExecutor.mjs    # 工具调度器（工具名 → 服务层函数）
│   │   ├── services/
│   │   │   ├── aiClient.mjs        # AI 客户端工厂（多供应商统一接口）
│   │   │   ├── aiRuntime.mjs       # AI 运行时配置（代理/直连模式）
│   │   │   ├── agents.mjs          # AI Agent 服务（卡片生成/搜索/文档分析）
│   │   │   ├── ingestion.mjs       # 内容摄入服务（URL → Material → Sidecar）
│   │   │   ├── searchService.mjs   # 语义搜索服务（embedding → RPC）
│   │   │   ├── boardAgents.mjs     # 画板 AI 分析
│   │   │   ├── sourceMatcher.mjs   # 信息源匹配
│   │   │   ├── vectorStoresV2.mjs  # 向量存储
│   │   │   ├── rss/                # RSS 子系统
│   │   │   │   ├── sync.mjs        # 订阅同步（HTTP 抓取 + 解析 + 存储）
│   │   │   │   ├── scheduler.mjs   # 定时调度器（setInterval）
│   │   │   │   ├── discovery.mjs   # Feed 发现
│   │   │   │   ├── opml.mjs        # OPML 导入/导出
│   │   │   │   └── utils.mjs       # 工具函数（URL 规范化、GUID 等）
│   │   │   └── supabase/           # 数据访问层（DAL）
│   │   │       ├── cards.mjs       # 卡片 DAO
│   │   │       ├── topics.mjs      # 主题 DAO
│   │   │       ├── boards.mjs      # 画板 DAO
│   │   │       ├── documents.mjs   # 文档 DAO
│   │   │       ├── conversations.mjs # 对话 DAO
│   │   │       ├── tasks.mjs       # 任务 DAO
│   │   │       ├── rss.mjs         # RSS 订阅 DAO
│   │   │       └── sources.mjs     # 信息源 DAO
│   │   └── tasks/                  # 研究任务执行引擎
│   │       ├── runner.mjs          # 任务运行器（collect → filter → materialize → cardify）
│   │       ├── compiler.mjs        # 任务规格编译
│   │       ├── contextBuilder.mjs  # 运行上下文构建
│   │       ├── proposalEngine.mjs  # 提案引擎
│   │       └── fetchers/
│   │           └── rss.mjs         # RSS 数据抓取器
│   └── test/                       # 单元测试（Node.js test runner）
│       ├── rss-utils.test.mjs
│       ├── rss-discovery.test.mjs
│       └── rss-opml.test.mjs
│
├── web-app/                        # Web App 前端 (React + Vite)
│   ├── src/
│   │   ├── App.jsx                 # 路由定义（ProtectedRoute / PublicRoute）
│   │   ├── main.jsx                # React 入口
│   │   ├── lib/
│   │   │   ├── store.js            # Zustand 全局状态（8 个 store）
│   │   │   ├── api.js              # API 客户端（fetch 封装 + 各模块 API）
│   │   │   └── ui-utils.js         # UI 工具函数
│   │   ├── pages/                  # 页面组件
│   │   │   ├── CardsPage.jsx       # 知识卡片页（首页 / 工作台）
│   │   │   ├── TopicsPage.jsx      # 主题列表页
│   │   │   ├── ThinkingBoardPage.jsx # 思维论证画板（React Flow）
│   │   │   ├── ChatPage.jsx        # AI 对话页
│   │   │   ├── TasksPage.jsx       # 研究任务列表
│   │   │   ├── TaskDetailView.jsx  # 任务详情 + 运行记录
│   │   │   ├── MaterialsPage.jsx   # 材料库
│   │   │   ├── MaterialReaderPage.jsx # 材料阅读器
│   │   │   ├── RssPage.jsx         # RSS 订阅管理
│   │   │   ├── RssSubscriptionDetailPage.jsx # RSS 订阅详情
│   │   │   ├── SourcesPage.jsx     # 信息源管理
│   │   │   ├── AISettingsPage.jsx  # AI 设置（模型/API Key）
│   │   │   ├── LoginPage.jsx       # 登录页
│   │   │   ├── RegisterPage.jsx    # 注册页
│   │   │   └── DownloadPage.jsx    # 扩展下载页
│   │   └── components/             # UI 组件
│   │       ├── Layout.jsx          # 主布局（侧边栏 + 内容区）
│   │       ├── TopicsSidebar.jsx   # 主题侧边栏
│   │       ├── ConversationSidebar.jsx # 对话列表侧边栏
│   │       ├── BoardChatPanel.jsx  # 画板 AI 对话面板
│   │       ├── BoardDocPanel.jsx   # 画板文档面板
│   │       ├── EmbeddedThinkBoard.jsx # 嵌入式思维画板
│   │       ├── Reader/             # 阅读器组件
│   │       │   ├── ReaderContent.jsx
│   │       │   ├── CardsSidebar.jsx
│   │       │   └── SelectionPopover.jsx
│   │       └── board/              # 画板节点组件
│   │           ├── QuestionNode.jsx
│   │           ├── HypothesisNode.jsx
│   │           └── EvidenceNode.jsx
│   └── package.json
│
├── content-fetch-service/          # 内容提取微服务
│   ├── src/
│   │   ├── server.mjs              # Express 入口 :8200
│   │   └── extractors/
│   │       ├── urlExtractor.mjs    # URL 内容提取（Readability + Puppeteer）
│   │       └── docExtractor.mjs    # 文档内容提取
│   └── package.json
│
├── ingestion-sidecar/              # Python 摄入 sidecar（分块 + 嵌入）
│
├── src/                            # 浏览器扩展 popup UI
│   ├── App.jsx                     # 扩展弹窗主组件
│   ├── main.jsx                    # React 入口
│   ├── api/                        # 扩展 API 通信
│   │   ├── index.js
│   │   └── auth.js
│   ├── components/                 # 扩展 UI 组件
│   └── hooks/
│       └── use-storage.js          # Chrome Storage Hook
│
├── public/
│   └── background.js               # Chrome 扩展 service worker
│
├── browser-extension/              # 扩展相关资源
├── design-system/                  # 设计系统文件
├── dist/                           # 构建产物
└── docs/                           # 文档
```

---

## 3. 技术栈清单

### 后端 (reading-cards-backend)

| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | >= 18 | 运行时 |
| Express.js | 4.18.x | HTTP 框架 |
| @supabase/supabase-js | 2.45.x | 数据库客户端 + Auth |
| openai | 6.10.x | OpenAI SDK（仅用于 Responses API） |
| rss-parser | 3.13.x | RSS/Atom feed 解析 |
| fast-xml-parser | 5.3.x | OPML XML 解析 |
| multer | 2.0.x | 文件上传中间件 |
| dotenv | 16.3.x | 环境变量管理 |
| cors | 2.8.x | 跨域支持 |

### 前端 Web App (web-app)

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.3.x | UI 框架 |
| React Router DOM | 6.28.x | 客户端路由 |
| Zustand | 5.0.x | 状态管理 |
| @xyflow/react | 12.10.x | 思维画板可视化（React Flow） |
| dagre / @dagrejs/dagre | 0.8.x / 2.0.x | 画板节点自动布局 |
| lucide-react | 0.460.x | 图标库 |
| DOMPurify | 3.3.x | HTML 清洗 |
| TailwindCSS | 3.4.x | 样式框架 |
| Vite | 5.4.x | 构建工具 |

### 内容提取服务 (content-fetch-service)

| 技术 | 版本 | 用途 |
|------|------|------|
| @mozilla/readability | 0.5.x | 网页正文提取 |
| Puppeteer | 22.x | 无头浏览器（JS 渲染页面） |
| puppeteer-extra-plugin-stealth | 2.11.x | 反检测 |
| jsdom | 24.x | DOM 解析 |
| isomorphic-dompurify | 2.9.x | HTML 清洗 |
| metascraper | 5.45.x | 元数据提取 |
| sharp | 0.33.x | 图片处理 |

### 浏览器扩展 (src/ + public/)

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.2.x | 弹窗 UI |
| Vite | 5.x | 构建 |
| Chrome Extension Manifest V3 | - | 扩展框架 |

---

## 4. 模块职责说明

### 4.1 reading-cards-backend — API 层

后端是系统的核心，采用**分层架构**：

```
Routes (路由层)
  ↓ 参数校验 + 请求分发
Services (服务层)
  ↓ 业务逻辑编排
Supabase DAL (数据访问层)
  ↓ SQL 查询封装
PostgreSQL (Supabase)
```

**为什么不直接让前端访问 Supabase？**

虽然 Supabase 支持客户端直连，但本项目选择通过后端代理所有请求，原因是：
- AI Agent 需要在后端编排多步工具调用，不能在前端执行
- 卡片创建需要先调用 AI 生成摘要，然后存入数据库 — 这是一个服务端编排过程
- 后端可以使用 `service_role` 客户端绕过 RLS 执行管理操作
- 集中化的错误处理和日志

### 4.2 Chat 系统

AI Chat 是本项目最复杂的子系统，采用 **Orchestrator-Planner-Executor** 三层架构。详见[第 7 节](#7-ai-chat-系统架构)。

### 4.3 RSS 系统

完整的 RSS 订阅阅读器：Feed 发现、订阅管理、定时同步、文章列表、OPML 导入/导出。详见[第 9 节](#9-rss-订阅系统)。

### 4.4 Task 系统

研究任务引擎，支持从 AI 对话中生成执行计划，按步骤自动执行 collect → filter → materialize → cardify 流水线。详见[第 8 节](#8-task-系统架构)。

### 4.5 Web App — 前端

React SPA，主要页面：

- **工作台 (CardsPage)**：知识卡片的 CRUD 和浏览
- **思维论证画板 (ThinkingBoardPage)**：基于 React Flow 的可视化论证板，支持 Question → Hypothesis → Evidence 树形结构
- **AI 对话 (ChatPage)**：与 AI 助手的对话界面，支持计划提案和确认执行
- **RSS 订阅 (RssPage)**：订阅管理和文章阅读
- **材料库 (MaterialsPage)**：导入的 URL/文档管理
- **阅读器 (MaterialReaderPage)**：网页文章阅读 + 高亮批注 + 侧边栏卡片

### 4.6 浏览器扩展

Chrome Extension Manifest V3：
- **background.js**：Service Worker，处理右键菜单、页面导入、Token 刷新
- **popup (src/App.jsx)**：弹窗 UI，设置阅读模式（自由/聚焦）和 Topic
- 功能：右键选中文本 → 保存为知识卡片，右键页面 → 导入到材料阅读器

### 4.7 content-fetch-service — 内容提取微服务

独立部署的内容提取服务，支持：
- **URL 提取**：先尝试普通 fetch，如果页面需要 JS 渲染则回退到 Puppeteer
- **HTML 提取**：浏览器扩展已获取渲染后的 DOM，直接传入解析
- **文档提取**：PDF/DOCX 文档内容提取
- **批量提取**：并发处理最多 10 个 URL

---

## 5. 数据流详解

### 5.1 用户从浏览器剪藏的完整链路

```
用户在网页上选中文字
    ↓ 右键 → "保存为阅读卡片"
Chrome Extension background.js
    ↓ 获取选中文本 + 页面标题 + URL
    ↓ 检查阅读模式（free/focus + topicTitle）
    ↓ 获取存储的 session.access_token
POST /api/v2/cards/capture
    ↓ requireAuth 中间件验证 JWT
    ↓ 调用 runAgent1() — AI 生成摘要 + 要点
    ↓ 调用 addCard() — 存入 Supabase
    ↓ addCard 内部通过 RPC get_or_create_topic 自动创建主题
返回 { ok: true, card }
    ↓
background.js 显示 toast "卡片保存成功"
```

参见：
- `public/background.js` 第 114-172 行：`captureCard()` 函数
- `reading-cards-backend/src/routes/v2/cards.mjs` 第 82-179 行：`/capture` 路由
- `reading-cards-backend/src/services/agents.mjs`：`runAgent1()` AI 处理

### 5.2 页面导入到阅读器的完整链路

```
用户点击扩展弹窗 "导入此页面到阅读器"
    ↓
background.js → importToReader()
    ↓ chrome.scripting.executeScript 提取当前页面 DOM HTML
    ↓ 如果 DOM 提取成功: source_type = "html"
    ↓ 如果失败: source_type = "url" (回退到服务端抓取)
POST /api/v2/materials/ingest
    ↓ 如果 source_type = "url":
    │   → content-fetch-service /extract/url
    │       → 尝试 fetch HTML
    │       → 检测是否需要 JS 渲染 → Puppeteer
    │       → Readability 提取正文
    │       → DOMPurify 清洗 HTML
    │       → metascraper 提取元数据
    ↓ 如果 source_type = "html":
    │   → content-fetch-service /extract/html
    │       → Readability + DOMPurify (跳过 fetch)
    ↓ 创建 material 记录到 Supabase
    ↓ 触发 ingestion-sidecar（异步）
    │   → 文本分块 (chunking)
    │   → 向量嵌入 (embedding)
    │   → 存入 chunks 表
返回 { material_id, status: "pending" }
```

参见：
- `public/background.js` 第 174-241 行：`importToReader()`
- `reading-cards-backend/src/services/ingestion.mjs`：`ingestUrl()` 全流程
- `content-fetch-service/src/extractors/urlExtractor.mjs`：内容提取策略

### 5.3 AI 对话的完整链路

```
用户在 ChatPage 输入消息
    ↓ useChatStore.sendMessage(text)
    ↓ 乐观更新：立即显示用户消息
POST /api/v2/chat { conversation_id, user_message }
    ↓ requireAuth 中间件
    ↓ chatWithConversation()
    │   ↓ 创建/获取 conversation
    │   ↓ 持久化用户消息到 conversation_messages 表
    │   ↓ 加载历史消息（最近 50 条）
    │   ↓ chat() — 主对话循环
    │       ↓ 构建 system prompt + 历史消息
    │       ↓ callWithTools() — 调用 AI API（带工具定义）
    │       ↓ AI 返回 tool_calls?
    │       │   ├── 是 read_only 工具 → 立即执行 → 结果送回 AI → 继续循环
    │       │   ├── 是 write/destructive 工具 → 返回 pendingActions 给前端确认
    │       │   └── 无 tool_calls → 返回文本回复
    │       ↓ AI 返回 _plan_request?
    │           → generatePlan() → 返回 plan_proposal 给前端
    │
    ↓ 持久化 tool_call_log + assistant reply
    ↓ 异步生成对话标题（新对话时）
返回 { conversation_id, reply, plan?, pendingActions? }
    ↓
前端更新 messages 和 activePlan 状态
```

---

## 6. 认证流程

### 6.1 整体流程

```
Supabase Auth (托管认证)
    ↓ 用户注册/登录
    ↓ 返回 JWT access_token + refresh_token
    ↓ 前端存入 localStorage (web) 或 chrome.storage.sync (扩展)
    ↓
每次 API 请求:
    Authorization: Bearer <access_token>
    ↓
requireAuth 中间件 (middleware/auth.mjs 第 11-58 行)
    ↓ 提取 Bearer token
    ↓ verifyToken(token) — 调用 supabaseAdmin.auth.getUser(token)
    ↓ 验证通过:
    │   req.user = user (用户信息)
    │   req.supabase = createSupabaseClient(token) (带用户上下文的客户端)
    │   req.accessToken = token
    ↓ 验证失败:
        返回 401 { error: "invalid_token" }
```

### 6.2 两种 Supabase 客户端

这是一个**关键设计决策**，定义在 `config/supabase.mjs`：

1. **supabaseAdmin** (Service Role Key)：
   - 绕过所有 RLS 策略
   - 仅用于后端管理操作（如 Task Executor 写入系统级数据）
   - 绝不暴露给前端

2. **createSupabaseClient(accessToken)** (Anon Key + User JWT)：
   - 遵循 RLS 策略，只能访问当前用户的数据
   - 由 `requireAuth` 中间件创建并附加到 `req.supabase`
   - 每次请求创建新实例，生命周期等于请求

**为什么需要两种客户端？**

RLS (Row Level Security) 是 Supabase 的核心安全机制。在 PostgreSQL 层面，每行数据都有 `user_id` 字段，RLS 策略确保用户只能访问自己的数据。用户级客户端自动携带 JWT，PostgreSQL 会根据 `auth.uid()` 过滤数据。但某些场景（如后台任务执行、RSS 调度器）没有用户上下文，需要 Service Role 客户端。

### 6.3 Token 刷新

浏览器扩展通过 `setInterval` 每小时检查 token 过期时间，提前 10 分钟刷新：

```javascript
// public/background.js 第 346-376 行
setInterval(async () => {
  const { session } = await getSession();
  const expiresAt = session.expires_at * 1000;
  if (expiresAt - Date.now() >= 10 * 60 * 1000) return; // 还未到期
  // 调用 /api/auth/refresh
}, 60 * 60 * 1000);
```

---

## 7. AI Chat 系统架构

### 7.1 调用链

```
chatRouter.post("/")                    # routes/v2/chat.mjs
    ↓
chatWithConversation()                  # chat/orchestrator.mjs 第 540 行
    ↓ 管理对话生命周期
chat()                                  # chat/orchestrator.mjs 第 190 行
    ↓ 核心对话循环（最多 6 轮工具调用）
    ├── callWithTools()                 # 调用 AI API + 工具定义
    │   ↓ callChatAPI()                # services/aiClient.mjs 第 183 行
    │       ↓ buildEndpoint()          # services/aiRuntime.mjs
    │       ↓ 选择 代理/直连 模式
    │       ↓ fetch() → OpenAI/Anthropic/Custom API
    ├── extractPlanRequest()            # 检测 AI 是否请求生成计划
    │   ↓ generatePlan()               # chat/planner.mjs 第 103 行
    └── executeTool()                   # chat/toolExecutor.mjs 第 25 行
        ↓ switch(name) → 分发到服务层
        ↓ searchCards / listTopics / createCard / fetchRss / ...
```

### 7.2 AI-First 架构

这是本项目最重要的设计决策之一（参见 `orchestrator.mjs` 第 2-4 行注释）：

> AI-first architecture: ALL user input goes to AI, AI decides everything.
> No keyword heuristics — AI understands intent, picks tools, generates plans.

**所有用户输入**都直接发给 AI 模型，由 AI 自主决定：
- 直接回答问题
- 调用工具查询数据
- 请求生成执行计划

这避免了传统的关键词匹配 / 意图分类硬编码逻辑，让系统更灵活。但代价是每次交互都需要一次 AI 调用，即使是简单操作。

### 7.3 工具系统

工具定义在 `chat/tools.mjs` 中，每个工具有三个关键属性：

- **side_effect**：`read_only` | `write` | `destructive`
  - `read_only`：自动执行，不需要用户确认
  - `write`：需要用户确认后才执行（如创建卡片）
  - `destructive`：需要用户确认 + 警告（如删除节点）

- **task_auto**：是否允许在自动化任务中使用
- **task_phases**：适用于哪些任务阶段（collect / filter / materialize / cardify）

**确认门 (Confirmation Gate)**：当 AI 返回的工具调用包含 write/destructive 工具时，orchestrator 会暂停执行，将 `pendingActions` 返回前端。用户确认后，前端调用 `/chat/confirm` 继续执行。

### 7.4 Plan 系统

当用户的请求足够复杂（如"跟踪 AI 安全领域最新进展"），AI 可以通过在回复中嵌入 `_plan_request` JSON 来请求生成计划：

```json
{"_plan_request": true, "intent": "跟踪AI安全领域最新技术进展"}
```

Planner 收到 intent 后：
1. 获取用户现有 Topics 作为上下文
2. 调用 AI 生成结构化计划（plan_spec + plan_display）
3. 返回给前端展示
4. 用户确认后，Executor 按步骤执行

---

## 8. Task 系统架构

### 8.1 概念模型

```
Task (研究任务)
├── title: "AI安全趋势追踪"
├── task_spec: { steps: [...], scope: {...}, source_config: {...} }
├── status: active | paused | completed
├── schedule: { type: manual | ... }
└── Runs (执行记录)
    ├── Run #1
    │   ├── Steps
    │   │   ├── step_1: collect (fetch_rss) → completed
    │   │   ├── step_2: filter → completed
    │   │   ├── step_3: materialize (ingest_url) → completed
    │   │   └── step_4: cardify (create_card) → completed
    │   └── results: { items_fetched: 15, cards_created: 5 }
    └── Run #2 ...
```

### 8.2 两套执行引擎

项目中有两套任务执行逻辑，服务于不同场景：

1. **tasks/runner.mjs**：原始任务运行器，硬编码 4 阶段流水线 (collect → filter → materialize → cardify)
2. **chat/executor.mjs**：计划执行器，从 AI 生成的 planSpec 动态执行步骤

两者共享 `toolExecutor.mjs` 和 `services/supabase/tasks.mjs` 数据层。

### 8.3 并发控制

通过任务锁（`acquireTaskLock` / `releaseTaskLock`）确保同一任务不会并发运行。锁实现基于 Supabase 数据库字段的 CAS (Compare-And-Swap)。

参见 `reading-cards-backend/src/tasks/runner.mjs` 第 29-38 行和 `chat/executor.mjs` 第 39-47 行。

---

## 9. RSS 订阅系统

### 9.1 核心组件

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ rss/         │     │ rss/         │     │ rss/         │
│ discovery.mjs│     │ sync.mjs     │     │ scheduler.mjs│
│ Feed 发现    │     │ 订阅同步     │     │ 定时调度     │
└──────────────┘     └──────────────┘     └──────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌──────────────────────────────────────────────────────┐
│ supabase/rss.mjs — 数据访问层                        │
│ rss_subscriptions | rss_subscription_sync_states     │
│ rss_items                                            │
└──────────────────────────────────────────────────────┘
```

### 9.2 同步机制

`sync.mjs` 是 RSS 系统的核心，实现了生产级的 Feed 同步：

1. **锁机制**：使用内存级 `Set` 防止同一订阅并发同步
2. **条件请求**：支持 `If-None-Match` (ETag) 和 `If-Modified-Since`，减少无效请求
3. **304 处理**：服务器返回未修改时，直接更新调度时间，不解析内容
4. **失败退避**：连续失败时，通过 `computeNextScheduledAt` 指数退避
5. **去重**：基于 `guid` 或 `url_hash` 唯一约束（数据库层 `23505` 错误码处理）
6. **元数据自动补全**：首次同步时自动从 Feed 获取 title、description、site_url

### 9.3 调度器

`scheduler.mjs` 使用简单的 `setInterval` 实现定时轮询：

- 默认每 60 秒检查一次（可通过 `RSS_SCHEDULER_INTERVAL_MS` 配置）
- 每次最多处理 10 个到期订阅（可通过 `RSS_SCHEDULER_BATCH_SIZE` 配置）
- 启动后 2 秒执行一次热身轮询
- 可通过 `RSS_SCHEDULER_ENABLED=false` 完全禁用

---

## 10. 状态管理架构

### 10.1 Zustand Store 设计

前端使用 Zustand 管理全局状态，定义在 `web-app/src/lib/store.js`。设计了 **8 个独立 store**：

| Store | 职责 | 主要状态 |
|-------|------|----------|
| `useAuthStore` | 认证状态 | user, session, loading |
| `useCardsStore` | 知识卡片 | cards[], loading, error |
| `useTopicsStore` | 主题 | topics[], loading, error |
| `useDocumentsStore` | 文档 | documents[], currentDocument |
| `useSourcesStore` | 信息源 | sources[] |
| `useTasksStore` | 研究任务 | tasks[], currentTask, runs[], proposals[] |
| `useRssStore` | RSS 订阅 | subscriptions[], items[], currentSubscription |
| `useChatStore` | AI 对话 | messages[], activePlan, sending, executing |
| `useConversationsStore` | 对话列表 | conversations[] |
| `useUIStore` | UI 状态 | sidebarOpen, toast |

### 10.2 设计原则

**为什么选择多 store 而非单一 store？**

1. **关注点分离**：每个 store 只管理一个领域的状态，降低复杂度
2. **按需渲染**：组件只订阅需要的 store，避免不必要的重渲染
3. **独立生命周期**：每个 store 有自己的 `clear()` 方法，登出时可以选择性清理

**数据流模式**：

```
组件 → store.action() → api.request() → 后端 API → 数据库
                ↓
       set({ data }) → 组件自动重渲染
```

每个 store 的 action 方法内部调用 API 客户端（`lib/api.js`），获得响应后通过 Zustand 的 `set()` 更新状态。组件通过 `const { cards, loading } = useCardsStore()` 订阅状态变更。

### 10.3 乐观更新

`useChatStore.sendMessage()` 展示了乐观更新模式：先在本地添加临时用户消息，如果 API 调用失败再移除。这让用户体验更流畅。

参见 `web-app/src/lib/store.js` 第 577-633 行。

---

## 11. 外部服务集成

### 11.1 AI 服务 (OpenAI / Anthropic / Custom)

AI 调用通过三层抽象实现：

```
aiRuntime.mjs — 运行时模式选择（代理 vs 直连）
    ↓
aiClient.mjs — 客户端工厂（配置构建 + API 调用）
    ↓
agents.mjs — 业务 Agent（卡片生成、搜索、文档分析）
```

**代理模式 vs 直连模式**：

- **代理模式** (`AI_PROXY_ENDPOINT` + `AI_PROXY_API_KEY`)：所有请求走统一代理，代理负责转发到对应 AI 供应商。适用于需要统一管控 API Key 或做请求日志的场景。
- **直连模式**：每个供应商独立配置 API Key，直接调用官方 API。

参见 `reading-cards-backend/src/services/aiRuntime.mjs` 全文。

### 11.2 Supabase

Supabase 承担三个角色：

1. **PostgreSQL 数据库**：所有业务数据的主存储
2. **Auth 服务**：用户认证（注册、登录、JWT 签发、Token 刷新）
3. **RPC 函数**：`search_chunks_hybrid`（混合搜索）、`get_or_create_topic`（幂等创建主题）

### 11.3 Ingestion Sidecar (Python)

Python 侧车服务（:8100），负责文档的分块和向量嵌入。后端通过 HTTP 触发（fire-and-forget 模式）：

```javascript
// services/ingestion.mjs 第 84-101 行
fetch(`${SIDECAR_URL}/ingest`, {
  method: 'POST',
  headers: { 'X-Sidecar-Key': SIDECAR_API_KEY },
  body: JSON.stringify(sidecarPayload),
}).catch(/* 异步错误处理 */);
```

### 11.4 Content Fetch Service

独立 Express 微服务（:8200），内容提取策略采用分层回退：

```
fetch() — 普通 HTTP 请求
  ↓ 检测是否需要 JS 渲染
Puppeteer — 无头浏览器
  ↓
Readability — 正文提取
  ↓ 失败时
extractBasic() — 基本提取回退
```

参见 `content-fetch-service/src/extractors/urlExtractor.mjs` 第 29-107 行。

---

## 12. 关键设计决策与 Tradeoff

### 12.1 AI-First 对话架构

**决策**：所有用户输入都发给 AI，由 AI 决定行动。

**优点**：
- 极高的灵活性，无需维护关键词分类规则
- AI 可以理解模糊意图
- 新增工具只需定义 schema，无需修改路由逻辑

**代价**：
- 每次交互至少一次 AI API 调用，增加延迟和成本
- AI 可能误判意图（如将简单问题当作需要计划的任务）
- 调试困难 — AI 的决策是黑盒

### 12.2 确认门 (Confirmation Gate)

**决策**：write/destructive 工具需要用户确认才执行。

**优点**：安全 — 用户始终掌控数据变更。

**代价**：交互增加一个来回 — 用户体验上多了一步确认。自动化任务中的工具需要标记 `task_auto: true` 来跳过确认。

### 12.3 后端代理 vs 前端直连 Supabase

**决策**：前端不直连 Supabase，所有请求走后端。

**优点**：后端可以编排复杂逻辑（AI + 数据库）、集中安全控制。

**代价**：增加了一跳网络延迟、后端成为单点瓶颈。

### 12.4 单进程 RSS 调度器

**决策**：使用 `setInterval` 而非外部调度系统（如 cron、BullMQ）。

**优点**：零依赖、部署简单、适合单实例场景。

**代价**：不支持多实例部署（会重复执行）、进程崩溃时调度停止、无法精确控制并发。

### 12.5 fire-and-forget 模式的摄入

**决策**：`ingestUrl()` 触发 sidecar 后立即返回，不等待分块和嵌入完成。

**优点**：API 响应快（用户不用等），分块和嵌入可能耗时较长。

**代价**：用户导入文章后不能立即使用语义搜索（需要等 sidecar 完成）；如果 sidecar 失败，只能通过检查 `ingestion_status` 字段发现。

### 12.6 多 Zustand Store 模式

**决策**：8 个独立 store 而非一个全局 store。

**优点**：按领域隔离、组件按需订阅、代码组织清晰。

**代价**：跨 store 通信需要手动协调（如 `useChatStore` 需要调用 `useConversationsStore.getState()`）。
