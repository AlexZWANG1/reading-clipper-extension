# Verity (求真) 技术学习指南

> 本指南结合本项目的实际代码，讲解每个技术概念的原理和最佳实践。
> 每个章节都会引用具体的文件和行号，帮助你在代码中找到对应的实现。
> 最后更新：2026-03-14

---

## 目录

1. [Express 中间件链和路由设计模式](#1-express-中间件链和路由设计模式)
2. [React 组件设计原则](#2-react-组件设计原则)
3. [Zustand 状态管理模式](#3-zustand-状态管理模式)
4. [Supabase RLS 安全模型](#4-supabase-rls-安全模型)
5. [REST API 设计最佳实践](#5-rest-api-设计最佳实践)
6. [AI Agent 编排模式](#6-ai-agent-编排模式)
7. [RSS 订阅系统设计](#7-rss-订阅系统设计)
8. [前端性能优化](#8-前端性能优化)
9. [测试策略和金字塔](#9-测试策略和金字塔)
10. [Git 工作流最佳实践](#10-git-工作流最佳实践)

---

## 1. Express 中间件链和路由设计模式

### 1.1 什么是中间件？

Express 中间件是一个函数，它可以访问请求对象 (req)、响应对象 (res) 和下一个中间件 (next)。中间件形成一个链条，请求从上到下经过每个中间件。

### 1.2 本项目的中间件链

打开 `reading-cards-backend/src/server.mjs`，你可以看到完整的中间件链：

```
请求到达
  ↓
cors()                          # 第 101 行：CORS 跨域控制
  ↓
express.json({ limit: '50mb' }) # 第 102 行：JSON 请求体解析
  ↓
express.urlencoded(...)         # 第 103 行：URL 编码请求体解析
  ↓
路由匹配 (app.use('/api/...')) # 第 118-135 行
  ↓
requireAuth (路由级中间件)      # 在每个路由模块内部使用
  ↓
路由处理函数
  ↓
错误处理中间件                  # 第 138-145 行
```

### 1.3 认证中间件详解

打开 `reading-cards-backend/src/middleware/auth.mjs`，这是本项目最重要的中间件：

```javascript
// 第 11 行
export async function requireAuth(req, res, next) {
  // 1. 提取 Token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const token = authHeader.substring(7);

  // 2. 验证 Token
  const user = await verifyToken(token);
  if (!user) {
    return res.status(401).json({ error: "invalid_token" });
  }

  // 3. 增强请求对象（这是关键的设计模式）
  req.user = user;                            // 附加用户信息
  req.supabase = createSupabaseClient(token); // 附加数据库客户端
  req.accessToken = token;                    // 附加原始 token

  // 4. 交给下一个处理函数
  next();
}
```

**为什么这样设计？** 这叫做**请求上下文增强** (Request Context Enrichment)。通过在中间件中验证身份并创建上下文，后续的路由处理函数不需要关心认证逻辑，直接使用 `req.user` 和 `req.supabase`。

### 1.4 两种中间件的使用方式

**全局中间件**（所有请求都经过）：
```javascript
// server.mjs 第 101 行
app.use(cors(corsOptions));
```

**路由级中间件**（仅特定路由经过）：
```javascript
// routes/v2/cards.mjs 第 21 行
const router = express.Router();
router.use(requireAuth);  // 这个路由模块下的所有请求都需要认证
```

### 1.5 学习建议

还注意看 `optionalAuth` 中间件（`auth.mjs` 第 65 行），它展示了另一种模式：认证失败不阻止请求，而是让后续代码根据 `req.user` 是否存在来决定行为。这种模式用于支持匿名访问但登录用户有额外功能的场景。

**进阶学习**：了解 `app.use()` 的路径前缀匹配机制。`app.use('/api/v2/cards', cardsRouter)` 会将 `/api/v2/cards` 前缀剥离，路由模块内部只需要处理相对路径（如 `/capture`、`/:id`）。

---

## 2. React 组件设计原则

### 2.1 组件层次结构

本项目的 React 组件采用三层结构：

```
App.jsx (路由定义)
  └── Layout.jsx (布局框架：侧边栏 + 内容区)
       └── Pages/*.jsx (页面组件：业务逻辑)
            └── Components/*.jsx (UI 组件：展示逻辑)
```

### 2.2 路由保护模式

打开 `web-app/src/App.jsx`，第 29-49 行展示了路由保护的标准模式：

```javascript
function ProtectedRoute({ children }) {
  const { session, loading } = useAuthStore();

  if (loading) {
    return <LoadingSpinner />;  // 加载中显示 spinner
  }
  if (!session) {
    return <Navigate to="/login" replace />; // 未登录重定向
  }
  return children;  // 已登录显示子组件
}
```

**为什么要处理 loading 状态？** 因为 `useAuthStore.init()` 是异步的（需要从 localStorage 恢复 session 并验证）。如果不处理 loading，组件会先渲染"未登录"状态，然后一闪变成"已登录"状态，造成闪烁。

### 2.3 受控表单模式

打开 `src/App.jsx`（浏览器扩展弹窗），第 21-30 行展示了 React 受控组件的标准模式：

```javascript
const [mode, setMode] = useState("free");
const [selectedTopic, setSelectedTopic] = useState("");
const [newTopic, setNewTopic] = useState("");
```

每个表单输入对应一个 state，用户交互触发 setState，组件重新渲染。这确保了 React 对所有 UI 状态的完全控制。

### 2.4 副作用管理

`src/App.jsx` 第 33-74 行展示了多个 `useEffect` 的使用模式：

```javascript
// Effect 1: 初始化认证状态（组件挂载时执行一次）
useEffect(() => {
  async function checkAuth() { /* ... */ }
  checkAuth();
}, []); // 空依赖数组 → 只在挂载时执行

// Effect 2: 认证通过后加载 topics（依赖 authenticated 变化）
useEffect(() => {
  if (!authenticated) return; // 条件守卫
  async function load() { /* ... */ }
  load();
}, [authenticated]); // authenticated 变化时重新执行
```

**设计原则**：每个 `useEffect` 只做一件事。如果需要多个异步操作，拆成多个 `useEffect`，通过依赖数组控制执行时机。

### 2.5 Lazy Loading

打开 `web-app/src/App.jsx` 第 22 行：

```javascript
const ThinkingBoardPage = lazy(() => import('./pages/ThinkingBoardPage'));
```

**为什么只对 ThinkingBoardPage 做懒加载？** 因为它依赖了 React Flow + dagre 这两个较大的库（合计约 200KB）。如果用户从不访问思维画板页面，就不需要下载这些代码。其他页面体积较小，懒加载的收益不大。

### 2.6 组合 vs 继承

本项目完全使用组合模式，没有使用类组件或继承。所有组件都是函数组件 + Hooks。这是 React 官方推荐的现代模式。

---

## 3. Zustand 状态管理模式

### 3.1 为什么选择 Zustand 而非 Redux？

Zustand 相比 Redux 的优势：
- **零样板代码**：不需要 action type、action creator、reducer
- **按需订阅**：组件只订阅需要的字段，自动优化渲染
- **支持异步**：action 可以直接是 async 函数

### 3.2 Store 的基本结构

打开 `web-app/src/lib/store.js`，看 `useCardsStore`（第 61-118 行）：

```javascript
export const useCardsStore = create((set, get) => ({
  // ── 状态 ──
  cards: [],
  loading: false,
  error: null,

  // ── 异步 Action ──
  fetchCards: async (params = {}) => {
    set({ loading: true, error: null });         // 开始加载
    try {
      const { cards } = await cardsApi.list(params);
      set({ cards, loading: false });            // 成功
    } catch (error) {
      set({ error: error.message, loading: false }); // 失败
      throw error;                                // 重新抛出让调用者处理
    }
  },

  // ── 乐观更新 Action ──
  addCard: async (cardData) => {
    const { card } = await cardsApi.capture(cardData);
    set((state) => ({ cards: [card, ...state.cards] })); // 添加到列表头部
    return card;
  },
}));
```

### 3.3 三种 set() 用法

```javascript
// 1. 直接设置值
set({ loading: true });

// 2. 基于前一个状态计算（像 Redux reducer）
set((state) => ({
  cards: state.cards.filter((c) => c.id !== id),
}));

// 3. 使用 get() 读取当前状态
const { conversationId } = get();
```

### 3.4 跨 Store 通信

打开 `store.js` 第 621-622 行，`useChatStore.sendMessage()` 中：

```javascript
const { touchConversation } = useConversationsStore.getState();
touchConversation(newConvId, { title: result.reply?.slice(0, 30) });
```

**为什么用 `getState()` 而非 `useConversationsStore()`？**

`useConversationsStore()` 是 React Hook，只能在组件中使用。在 store 的 action 内部（非组件环境），需要用 `getState()` 获取其他 store 的状态和方法。

### 3.5 乐观更新模式

打开 `store.js` 第 577-633 行，`useChatStore.sendMessage()` 展示了经典的乐观更新：

```javascript
sendMessage: async (text) => {
  set({ sending: true });

  // 1. 乐观添加用户消息（即时反馈）
  const tempUserMsg = { id: `temp-${Date.now()}`, role: 'user', content: text };
  set((state) => ({ messages: [...state.messages, tempUserMsg] }));

  try {
    const result = await chatApi.sendMessage(conversationId, text);
    // 2. 成功：添加 AI 回复
    set((state) => ({ messages: [...state.messages, assistantMsg] }));
  } catch (error) {
    // 3. 失败：移除乐观添加的消息
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== tempUserMsg.id),
      sending: false,
    }));
    throw error;
  }
},
```

**为什么要乐观更新？** AI 回复可能需要 5-30 秒。如果等 API 返回后才显示用户消息，用户会以为界面没有响应。乐观更新让用户消息立即出现，提升感知性能。

### 3.6 轮询模式

`store.js` 第 679-706 行展示了前端轮询的标准模式：

```javascript
pollForProgress: () => {
  const poll = setInterval(async () => {
    const { messages } = await conversationsApi.get(conversationId);
    if (messages.length > currentMsgs.length) {
      set({ messages });
      if (hasComplete) {
        clearInterval(poll);  // 任务完成，停止轮询
        set({ executing: false });
      }
    }
  }, 3000); // 每 3 秒轮询

  // 安全阀：10 分钟后强制停止
  setTimeout(() => {
    clearInterval(poll);
    set({ executing: false });
  }, 600000);
},
```

**设计要点**：
1. 有明确的退出条件（任务完成）
2. 有超时保护（10 分钟）
3. 轮询频率不宜太高（3 秒是合理的折中）

---

## 4. Supabase RLS 安全模型

### 4.1 什么是 RLS？

Row Level Security (RLS) 是 PostgreSQL 的行级安全策略。它在数据库层面控制每个用户能看到和修改哪些行。即使应用代码有 bug，RLS 也能防止数据泄露。

### 4.2 本项目中的 RLS 应用

打开 `reading-cards-backend/src/config/supabase.mjs`：

```javascript
// 第 24 行 — Admin 客户端（绕过 RLS）
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 第 35 行 — User 客户端（遵循 RLS）
export function createSupabaseClient(accessToken) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`, // JWT 携带用户身份
      },
    },
  });
}
```

### 4.3 两种客户端的使用场景

**User-scoped 客户端**（`req.supabase`）— 绝大多数场景：
```javascript
// routes/v2/cards.mjs 第 186 行
const cards = await listCards(req.supabase, req.user.id, {...});
```
RLS 策略会自动过滤，确保只返回当前用户的卡片。

**Admin 客户端**（`supabaseAdmin`）— 后台系统操作：
```javascript
// chat/orchestrator.mjs 第 541 行
const adminSb = supabaseAdmin;
const conv = await createConversation(adminSb, userId);
```
Task Executor 和 RSS Scheduler 没有用户请求上下文，需要 Admin 客户端。

### 4.4 RLS 的局限性

本项目中有一个微妙的安全考虑：`cards.mjs` 第 65 行的 `findCardById()` 只按 `card_id` 查询，不附加 `user_id` 过滤。如果 RLS 策略配置正确（`user_id = auth.uid()`），这是安全的。但如果使用 Admin 客户端调用此函数，就可能返回其他用户的卡片。

**最佳实践**：即使有 RLS，服务层代码也应该显式传递 `user_id` 作为额外的安全层。

### 4.5 RPC 函数

本项目使用了两个 PostgreSQL 自定义函数（通过 Supabase RPC 调用）：

1. `get_or_create_topic` — 幂等地创建或获取主题
2. `search_chunks_hybrid` — 混合搜索（向量 + 全文）

参见 `services/supabase/cards.mjs` 第 34 行和 `services/searchService.mjs` 第 50 行。

---

## 5. REST API 设计最佳实践

### 5.1 本项目的 API 设计

API 路径遵循 REST 命名约定：

```
GET    /api/v2/cards          → 列表
POST   /api/v2/cards/capture  → 创建（非标准，但语义更明确）
GET    /api/v2/cards/:id      → 详情
PATCH  /api/v2/cards/:id      → 部分更新
DELETE /api/v2/cards/:id      → 删除
POST   /api/v2/cards/search   → 搜索（POST 因为请求体复杂）
```

### 5.2 统一响应格式

本项目所有 API 返回统一格式：

```javascript
// 成功
{ ok: true, cards: [...] }
{ ok: true, card: {...} }

// 失败
{ ok: false, error: "error_code", message: "人类可读的错误描述" }
```

**为什么需要 `ok` 字段？** HTTP 状态码已经表示成功/失败，但前端可能不方便检查状态码。`ok` 字段让前端可以简单地检查 `data.ok`。

### 5.3 版本化 API

路径中的 `/v2/` 是 API 版本号。项目目前只有 V2（V1 已废弃），但保留版本号前缀的好处是：
- 可以在不破坏现有客户端的情况下发布新版 API
- 浏览器扩展和 Web App 可以使用不同版本的 API

### 5.4 错误处理模式

打开 `reading-cards-backend/src/routes/v2/cards.mjs` 第 82-179 行（`/capture`），注意错误处理的层次：

```javascript
router.post("/capture", async (req, res) => {
  try {
    // 1. 输入验证
    if (!hasSnippet && !imageData) {
      return res.status(400).json({ ok: false, error: "snippet_or_image_required" });
    }
    // 2. 业务逻辑
    const agentResult = await runAgent1({...});
    const card = await addCard(req.supabase, req.user.id, {...});
    // 3. 成功响应
    res.json({ ok: true, card });
  } catch (error) {
    // 4. 兜底错误处理
    console.error("capture card error:", error);
    res.status(500).json({ ok: false, error: "capture_error" });
  }
});
```

**模式**：每个路由都有自己的 try-catch，加上全局错误处理中间件（`server.mjs` 第 138 行）作为最后防线。

### 5.5 API 客户端封装

打开 `web-app/src/lib/api.js`，看前端如何封装 API 调用：

```javascript
// 第 27-55 行 — 通用请求函数
async function request(endpoint, options = {}) {
  const token = getAccessToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(data.message || '请求失败', response.status, data);
  }
  return data;
}
```

所有 API 调用都通过这个函数，它自动处理：
- Token 注入
- JSON 解析
- 错误封装

然后每个模块的 API 就可以简洁地定义：

```javascript
export const cardsApi = {
  list: (params) => request(`/v2/cards?${new URLSearchParams(params)}`),
  get: (id) => request(`/v2/cards/${id}`),
  capture: (data) => request('/v2/cards/capture', { method: 'POST', body: JSON.stringify(data) }),
};
```

---

## 6. AI Agent 编排模式

### 6.1 核心架构：Orchestrator-Planner-Executor

这是本项目最有学习价值的设计。三个组件各有明确职责：

```
Orchestrator (编排器) — chat/orchestrator.mjs
├── 管理对话循环
├── 决定是否需要用户确认
├── 管理对话持久化
└── 协调 Planner 和 Executor

Planner (计划器) — chat/planner.mjs
├── 将用户意图转化为结构化计划
├── 生成机器可执行的 plan_spec
└── 生成人类可读的 plan_display

Executor (执行器) — chat/executor.mjs
├── 按步骤顺序执行计划
├── 每步调用工具并记录结果
├── 生成步骤注释和最终总结
└── 管理执行锁和取消
```

### 6.2 Tool Calling 模式

这是 OpenAI Function Calling 的标准用法。关键在于如何定义工具。

打开 `chat/tools.mjs`，每个工具有三部分：

1. **OpenAI 格式的函数签名**（给 AI 模型看的）：
```javascript
{
  type: "function",
  function: {
    name: "search_cards",
    description: "Search the user's reading cards by keyword...",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search keyword" },
        topic_id: { type: "string", description: "Optional topic filter" },
      },
      required: ["query"],
    },
  },
}
```

2. **副作用标记**（给 orchestrator 看的）：
```javascript
side_effect: "read_only",   // 自动执行
side_effect: "write",       // 需要确认
side_effect: "destructive", // 需要确认 + 警告
```

3. **任务元数据**（给 executor 看的）：
```javascript
task_auto: true,            // 是否允许自动化执行
task_phases: ["collect"],   // 适用的任务阶段
task_capability: "content_fetch",
```

### 6.3 对话循环的实现

打开 `chat/orchestrator.mjs` 第 190-293 行的 `chat()` 函数：

```
while (rounds < MAX_TOOL_ROUNDS) {
    1. 调用 AI API（带工具定义）
    2. AI 返回结果
    3. 如果没有 tool_calls → 返回文本回复（退出循环）
    4. 如果有 tool_calls：
       a. 检查是否有 write/destructive 工具
       b. 如果有 → 暂停，返回 pendingActions（退出循环）
       c. 如果全是 read_only → 执行工具 → 结果送回 AI → 继续循环
}
```

**MAX_TOOL_ROUNDS = 6** — 防止无限循环。如果 AI 持续调用工具 6 轮还没完成，强制结束。

### 6.4 Plan Request 机制

这是一个优雅的设计：AI 通过在回复中嵌入特殊 JSON 来"请求"生成计划。

```javascript
// orchestrator.mjs 第 462-475 行
function extractPlanRequest(content) {
  const jsonMatch = content.match(/```json\s*(\{[\s\S]*?\})\s*```/);
  const parsed = JSON.parse(jsonMatch[1]);
  if (parsed._plan_request && parsed.intent) {
    return { intent: parsed.intent };
  }
  return null;
}
```

**为什么不用专门的工具来生成计划？** 因为计划生成需要的上下文（用户 topics、可用工具、plan 模板）和普通工具调用不同。通过 `_plan_request` 信号，orchestrator 可以切换到 planner 模式，使用不同的 system prompt 和 AI 配置。

### 6.5 学习建议

理解这个 Agent 系统的最好方式是跟踪一个完整的请求：

1. 用户发送 "帮我从 Hacker News 收集 AI 安全相关文章"
2. `chatWithConversation()` 创建对话，存储消息
3. `chat()` 调用 AI，AI 识别这是复杂任务，返回 `_plan_request`
4. `extractPlanRequest()` 提取意图
5. `generatePlan()` 调用 AI 生成 plan_spec（包含 fetch_rss → filter → create_card 步骤）
6. 返回前端展示计划
7. 用户确认 → `confirmAndExecutePlan()`
8. `executePlan()` 按步骤执行，每步调用工具并写入对话消息

---

## 7. RSS 订阅系统设计

### 7.1 数据模型

```
rss_subscriptions        # 订阅记录
├── feed_url             # RSS 源 URL
├── title                # 订阅标题
├── status               # active | paused | error
├── poll_interval_minutes # 轮询间隔
└── last_synced_at       # 上次同步时间

rss_subscription_sync_states  # 同步状态
├── subscription_id      # 关联订阅
├── last_etag           # 上次响应的 ETag
├── last_modified       # 上次响应的 Last-Modified
├── consecutive_failures # 连续失败次数
└── next_scheduled_at   # 下次计划同步时间

rss_items                # 文章条目
├── subscription_id
├── guid                 # 唯一标识（RSS 原始 guid 或 URL hash）
├── title
├── url
├── summary
└── content_html
```

### 7.2 条件请求 (Conditional Request)

打开 `reading-cards-backend/src/services/rss/sync.mjs` 第 85-99 行：

```javascript
async function loadFeedWithHttp(feedUrl, syncState) {
  const headers = { 'User-Agent': 'Verity/1.0 RSS Sync' };

  // 条件请求头 — 告诉服务器"如果内容没变，不要发送完整响应"
  if (syncState?.last_etag) headers['If-None-Match'] = syncState.last_etag;
  if (syncState?.last_modified) headers['If-Modified-Since'] = syncState.last_modified;

  const response = await fetch(feedUrl, { headers, signal: AbortSignal.timeout(20000) });
  return response;
}
```

**为什么要用条件请求？** RSS 同步是定时执行的，大多数时候 Feed 没有更新。条件请求让服务器返回 304 Not Modified（几乎零流量），而非完整的 XML 内容（可能几百 KB）。

### 7.3 失败退避策略

打开 `reading-cards-backend/src/services/rss/utils.mjs`（通过测试文件 `test/rss-utils.test.mjs` 第 34-48 行可以看到行为）：

```
正常情况: 下次同步 = now + pollInterval (如 30 分钟)
1 次失败: 下次同步 = now + 30 * 2^1 = 60 分钟
2 次失败: 下次同步 = now + 30 * 2^2 = 120 分钟
3 次失败: 下次同步 = now + 30 * 2^3 = 240 分钟
...
上限: 最多退避到 24 小时
```

**为什么要指数退避？** 如果一个 Feed 暂时不可用（如服务器维护），持续高频重试只会浪费资源。指数退避给服务器恢复的时间，同时保证最终还是会重试。

### 7.4 去重机制

打开 `sync.mjs` 第 73-83 行：

```javascript
async function insertRssItem(supabase, payload) {
  const { error } = await supabase.from('rss_items').insert(payload);
  if (error) {
    if (error.code === '23505') return { inserted: false, duplicate: true };
    throw new Error(`Failed to insert: ${error.message}`);
  }
  return { inserted: true, duplicate: false };
}
```

`23505` 是 PostgreSQL 唯一约束违反错误码。通过在 `guid` 字段上设置唯一索引，数据库自动处理去重，代码不需要先查询后插入（避免竞态条件）。

---

## 8. 前端性能优化

### 8.1 代码分割 (Code Splitting)

打开 `web-app/src/App.jsx` 第 22 行：

```javascript
const ThinkingBoardPage = lazy(() => import('./pages/ThinkingBoardPage'));
```

配合 `Suspense` 使用（第 119 行）：

```javascript
<Suspense fallback={<Spinner />}>
  <ThinkingBoardPage />
</Suspense>
```

**原理**：Vite 在构建时会将 `ThinkingBoardPage` 及其依赖（React Flow、dagre）打包成一个独立的 chunk。只有用户访问画板页面时才下载。

### 8.2 选择性订阅 (Selective Subscription)

Zustand 的一大优势是自动的选择性订阅：

```javascript
// 只订阅 cards 和 loading，不关心 error
const { cards, loading } = useCardsStore();
```

当 `error` 变化时，这个组件不会重新渲染。这是 Zustand 内部使用 `useSyncExternalStore` 实现的。

### 8.3 内容安全的 HTML 渲染

阅读器需要渲染从网页提取的 HTML 内容。本项目在两个层面防止 XSS：

1. **提取时清洗** (content-fetch-service)：
   ```javascript
   // urlExtractor.mjs 第 245-257 行
   let articleHtml = DOMPurify.sanitize(article.content, {
     ALLOWED_TAGS: ['p', 'br', 'strong', 'h1', 'a', 'img', ...],
     ALLOWED_ATTR: ['href', 'src', 'alt', 'title', ...],
   });
   ```

2. **前端渲染时清洗** (web-app)：使用 `dompurify` 库再次清洗。

### 8.4 图片懒加载

`urlExtractor.mjs` 第 337-339 行，提取内容时自动给图片添加 `loading="lazy"`：

```javascript
if (!img.getAttribute('loading')) {
  img.setAttribute('loading', 'lazy');
}
```

### 8.5 需要改进的地方

1. **缺少虚拟滚动**：当卡片数量很多时，CardsPage 会一次渲染所有卡片。应使用 `react-window` 或 `react-virtuoso` 实现虚拟滚动。

2. **缺少请求缓存**：每次切换页面都重新请求数据。可以使用 `stale-while-revalidate` 策略或引入 `TanStack Query`。

3. **缺少防抖搜索**：搜索输入应该加防抖（debounce），避免每次按键都发送 API 请求。

---

## 9. 测试策略和金字塔

### 9.1 测试金字塔

```
      /\
     /  \
    / E2E \        ← 少量：关键用户流程
   /--------\
  /  集成测试  \     ← 中等：API 端点 + 服务集成
 /--------------\
/    单元测试     \   ← 大量：纯函数 + 工具函数
------------------
```

### 9.2 本项目的测试现状

项目只有 3 个测试文件，全部是 RSS 工具函数的单元测试：

```
reading-cards-backend/test/
├── rss-utils.test.mjs      ← 纯函数测试（最佳示范）
├── rss-discovery.test.mjs
└── rss-opml.test.mjs
```

打开 `test/rss-utils.test.mjs`，这是一个良好的单元测试示范：

```javascript
import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeUrl, computeNextScheduledAt } from '../src/services/rss/utils.mjs';

// 1. 每个测试只验证一个行为
test('normalizeUrl normalizes protocol/host and strips hash', () => {
  const normalized = normalizeUrl('Example.com/path/#section');
  assert.equal(normalized, 'https://example.com/path');
});

// 2. 测试边界情况
test('clampInt applies boundaries and fallback', () => {
  assert.equal(clampInt('120', { min: 5, max: 1440, fallback: 60 }), 120);  // 正常
  assert.equal(clampInt('2', { min: 5, max: 1440, fallback: 60 }), 5);      // 低于最小值
  assert.equal(clampInt('5000', { min: 5, max: 1440, fallback: 60 }), 1440); // 高于最大值
  assert.equal(clampInt('abc', { min: 5, max: 1440, fallback: 60 }), 60);    // 无效输入
});
```

### 9.3 应该测试什么（优先级排序）

基于本项目的具体情况，以下是测试优先级：

#### 优先级 1：纯函数单元测试

这些函数没有外部依赖，最容易测试：
- `chat/tools.mjs` — `getToolSideEffect()`, `buildConfirmMessage()`
- `chat/planner.mjs` — `classifyIntent()`（虽然已废弃但可以作为测试练习）
- `chat/orchestrator.mjs` — `extractPlanRequest()`, `summarizeToolResult()`
- `services/rss/utils.mjs` — 已有测试，可作为模板
- `services/supabase/cards.mjs` — `buildTitle()`, `buildSummary()`, `normalizeFactOrView()`

#### 优先级 2：API 集成测试

使用 Node.js test runner + supertest 测试 API 端点：
```javascript
test('POST /api/v2/cards/capture returns 401 without token', async () => {
  const res = await request(app).post('/api/v2/cards/capture').send({});
  assert.equal(res.status, 401);
});
```

#### 优先级 3：E2E 测试

项目已安装 Playwright（`package.json` devDependencies）。应测试：
- 登录 → 创建卡片 → 搜索卡片
- 添加 RSS 订阅 → 同步 → 查看文章
- AI 对话 → 确认工具调用

### 9.4 测试运行方式

项目使用 Node.js 原生 test runner（无需额外测试框架）：

```bash
cd reading-cards-backend
node --test "test/**/*.test.mjs"
```

### 9.5 Mock 策略

对于依赖外部服务（Supabase、AI API）的测试，建议使用以下 mock 策略：

```javascript
// 使用 Node.js test runner 的 mock 功能
import { mock } from 'node:test';

test('chat returns reply', async (t) => {
  // Mock AI API 调用
  const mockCallChatAPI = t.mock.fn(async () => ({
    choices: [{ message: { content: 'Hello!', role: 'assistant' } }],
  }));
  // 注入 mock
  // ...
});
```

---

## 10. Git 工作流最佳实践

### 10.1 本项目的 Commit 风格

查看最近的 commit 历史：

```
cbfbf70 fix(security): remove hardcoded credentials, consolidate Supabase clients, fix silent errors
ee88b4d feat: add conversation planning and upgrade chat/rss flow
2e3a993 feat: add built-in rss subscriptions and reader inbox
caeffbd chore: checkpoint before built-in RSS implementation
```

项目使用 **Conventional Commits** 格式：`type(scope): description`

- `fix` — 修复 bug
- `feat` — 新功能
- `chore` — 杂项（不影响用户的改动）
- `docs` — 文档
- `refactor` — 重构（不改变行为）
- `perf` — 性能优化
- `test` — 测试

### 10.2 推荐的 Git 工作流

对于本项目（1-3 人团队），推荐 **GitHub Flow**：

```
main (生产分支)
  ├── feat/rss-scheduler-improvement    (功能分支)
  ├── fix/cors-extension-matching       (修复分支)
  └── docs/architecture-guide           (文档分支)
```

**规则**：
1. `main` 始终保持可部署状态
2. 每个功能/修复创建独立分支
3. 完成后通过 Pull Request 合并
4. 合并前需要代码审查

### 10.3 Commit 的最佳大小

观察 `cbfbf70` 的变更：修复硬编码凭据 + 统一 Supabase 客户端 + 修复静默错误 — 这三个改动被合在一个 commit 中。

**更好的做法**是拆成 3 个 commit：
```
fix(security): remove hardcoded credentials from supabase config
refactor(supabase): consolidate Supabase client instances
fix(error): ensure errors are properly logged instead of silently caught
```

**为什么要小 commit？** 每个 commit 做一件事，方便：
- `git blame` 追踪变更原因
- `git bisect` 定位引入 bug 的 commit
- `git revert` 精确回退单个改动

### 10.4 .gitignore 策略

本项目的 `.gitignore` 应该包含（部分可能已经配置）：

```
# 环境配置
.env
.env.local

# 依赖
node_modules/

# 构建产物
dist/

# 日志
logs/
*.log

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db
```

**关键规则**：`.env` 文件永远不要提交到仓库。使用 `.env.example` 记录所需的环境变量名（不包含实际值）。

### 10.5 敏感信息处理

如果不小心将敏感信息提交到了 Git 历史中（如 `cbfbf70` 之前的硬编码凭据），仅仅删除文件是不够的 — 历史记录中仍然存在。

**正确的处理方式**：
1. 立即轮换泄露的凭据（生成新的 API Key）
2. 使用 `git filter-branch` 或 `BFG Repo Cleaner` 从历史中删除
3. 添加 pre-commit hook 检测敏感信息（如 `gitleaks`）

---

## 附录：推荐学习资源

### Express.js
- [Express 官方指南 - 中间件](https://expressjs.com/en/guide/writing-middleware.html)
- [Express 最佳实践](https://expressjs.com/en/advanced/best-practice-security.html)

### React
- [React 官方文档 - Thinking in React](https://react.dev/learn/thinking-in-react)
- [React 渲染行为完整指南](https://blog.isquaredsoftware.com/2020/05/blogged-answers-a-mostly-complete-guide-to-react-rendering-behavior/)

### Zustand
- [Zustand GitHub](https://github.com/pmndrs/zustand)
- [Zustand 与 Redux 的对比](https://docs.pmnd.rs/zustand/getting-started/comparison)

### Supabase
- [Supabase RLS 指南](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Auth 架构](https://supabase.com/docs/guides/auth/architecture)

### AI Agent 模式
- [OpenAI Function Calling 指南](https://platform.openai.com/docs/guides/function-calling)
- [Building AI Agents with Tool Use](https://docs.anthropic.com/en/docs/agents-and-tools)

### 测试
- [Node.js Test Runner 文档](https://nodejs.org/api/test.html)
- [Testing Trophy (Kent C. Dodds)](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications)

### Git
- [Conventional Commits 规范](https://www.conventionalcommits.org/)
- [GitHub Flow](https://docs.github.com/en/get-started/using-github/github-flow)
