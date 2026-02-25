# 自然语言交互窗口 — 实现计划

## 概述

在 web-app 中添加一个全局可用的 AI 聊天窗口（浮动面板），用户可以用自然语言操作系统的所有功能。核心场景：在 ThinkingBoard 页面中，AI 能基于用户的问题和假说，自动生成子问题、假说，并做支持/不支持的判断。

## 架构设计

### 核心原则
- **模型无关性（三层解耦）**：Canonical Action Protocol + Model Adapter + Tool Spec Compiler
- **写操作确认门**：所有 write/destructive 操作必须经用户确认才执行
- **流式响应**：SSE 实现打字机效果

### 三层解耦架构

```
┌─────────────────────────────────────────────────────┐
│  Layer 1: Tool Spec (Canonical Schema)              │
│  tools/*.json — 单一来源，模型无关的工具定义         │
│  包含: name, description, input_schema,              │
│        side_effect, examples                         │
└──────────────┬──────────────────────────────────────┘
               │ 编译
┌──────────────▼──────────────────────────────────────┐
│  Layer 2: Model Adapters                             │
│  adapters/openai.mjs  — 编译 tools → OpenAI format   │
│  adapters/anthropic.mjs — 编译 tools → Claude format  │
│  adapters/base.mjs — 公共接口定义                     │
│  职责: 发请求 + 解析响应 → Canonical Action           │
└──────────────┬──────────────────────────────────────┘
               │ Canonical Actions
┌──────────────▼──────────────────────────────────────┐
│  Layer 3: Orchestrator (chatEngine.mjs)              │
│  只认 Canonical Action，不认厂商格式                  │
│  职责: 确认门 → 执行 tool → 组装结果                  │
└─────────────────────────────────────────────────────┘
```

### Canonical Action 协议

所有模型的 tool call 输出统一转换为：
```json
{
  "type": "tool_call",
  "id": "call_xxx",
  "name": "create_board_node",
  "arguments": { "board_id": "...", "node_type": "hypothesis", "claim": "..." }
}
```

所有模型的文本输出统一转换为：
```json
{
  "type": "text",
  "content": "根据你的卡片，我建议..."
}
```

Adapter 负责：厂商格式 ↔ Canonical 的双向转换。换模型只换 adapter，业务层零改动。

### 确认门机制

Tool Spec 中每个工具标记 `side_effect`:
- `read_only` — 直接执行，无需确认（get_board, list_cards, search_cards）
- `write` — 需要确认（create_board_node, update_board_node, create_card）
- `destructive` — 强制确认 + 警告（delete_board_node）

编排流程：
```
LLM 返回 tool_call
  → side_effect == read_only? → 直接执行
  → side_effect == write|destructive?
    → SSE 发送 "pending_actions" 事件（含操作摘要）
    → 等待前端用户点击"确认执行" / "取消"
    → 确认 → 执行 → 结果回传 LLM 继续
    → 取消 → 告知 LLM "用户取消了该操作"
```

### 数据流

```
用户输入 → POST /api/v2/chat → Orchestrator
  → 构建 system prompt（注入画板状态）
  → Model Adapter 调用 LLM（tools 由 Spec Compiler 编译）
  → Adapter 解析响应 → Canonical Actions
  → Orchestrator: read_only → 直接执行 / write → 发确认请求
  → 用户确认 → 执行 tool → 结果回传 LLM
  → LLM 生成最终回复 → SSE 流式返回前端
```

## 实现步骤

### 第一步：Tool Spec — 单一来源工具定义

**新建文件**: `reading-cards-backend/src/chat/tools/board_tools.json`

Canonical schema 格式，每个工具包含：
```json
{
  "name": "create_board_node",
  "description": "在思维画板上创建一个新节点（问题、假说或证据）",
  "side_effect": "write",
  "input_schema": {
    "type": "object",
    "properties": {
      "board_id": { "type": "string", "description": "画板 ID" },
      "node_type": { "type": "string", "enum": ["question", "hypothesis", "evidence"] },
      "parent_id": { "type": "string", "description": "父节点 ID（可选）" },
      "text": { "type": "string", "description": "节点内容" }
    },
    "required": ["board_id", "node_type", "text"]
  },
  "confirm_message_template": "将在画板上创建{node_type}节点: \"{text}\"",
  "examples": [
    {
      "user": "帮我添加一个假说：社交媒体加剧了信息茧房",
      "arguments": { "board_id": "{{board_id}}", "node_type": "hypothesis", "text": "社交媒体加剧了信息茧房" }
    }
  ]
}
```

工具清单：

| 工具名 | side_effect | 说明 |
|--------|-------------|------|
| `get_board` | read_only | 获取画板完整数据 |
| `list_cards` | read_only | 列出 topic 下的卡片 |
| `search_cards` | read_only | 语义搜索卡片 |
| `list_topics` | read_only | 列出所有主题 |
| `create_board_node` | write | 创建节点 |
| `update_board_node` | write | 更新节点 |
| `delete_board_node` | destructive | 删除节点 |
| `create_board_edge` | write | 创建边 |
| `suggest_hypotheses` | read_only | AI 建议假说（只返回建议，不写入） |
| `evaluate_hypothesis` | read_only | 评估假说支持/不支持 |
| `create_card` | write | 创建新卡片 |

### 第二步：Model Adapters — 厂商格式转换

**新建文件**: `reading-cards-backend/src/chat/adapters/base.mjs`

定义 adapter 接口：
```javascript
class BaseAdapter {
  // 将 canonical tool specs 编译为厂商格式
  compileTools(canonicalTools) { throw new Error('not implemented'); }
  // 调用 LLM，返回 Canonical Actions 数组
  async chat(messages, tools, options) { throw new Error('not implemented'); }
  // 解析厂商响应为 Canonical Actions
  parseResponse(raw) { throw new Error('not implemented'); }
  // 将 tool 执行结果编码为厂商格式的 message
  encodeToolResult(callId, result) { throw new Error('not implemented'); }
}
```

**新建文件**: `reading-cards-backend/src/chat/adapters/openai.mjs`
- `compileTools`: canonical schema → OpenAI `{ type: "function", function: { name, description, parameters } }`
- `parseResponse`: OpenAI `tool_calls` → `{ type: "tool_call", id, name, arguments }`
- `chat`: 调用 OpenAI Chat Completions API（使用已有的 aiClient 配置）

**新建文件**: `reading-cards-backend/src/chat/adapters/anthropic.mjs`
- `compileTools`: canonical schema → Anthropic `{ name, description, input_schema }`
- `parseResponse`: Anthropic `tool_use` content blocks → Canonical Actions
- `chat`: 调用 Anthropic Messages API

**新建文件**: `reading-cards-backend/src/chat/adapters/index.mjs`
- `getAdapter(provider)` — 根据用户设置的 provider 返回对应 adapter

### 第三步：Orchestrator — 编排引擎

**新建文件**: `reading-cards-backend/src/chat/orchestrator.mjs`

核心职责：
1. 加载 tool specs，通过 adapter 编译为厂商格式
2. 构建 system prompt（注入画板/topic 上下文）
3. 调用 adapter.chat()，获取 Canonical Actions
4. 对每个 action：
   - `type: "text"` → SSE 推送文本
   - `type: "tool_call"` + `read_only` → 直接执行，结果回传 LLM
   - `type: "tool_call"` + `write|destructive` → SSE 推送 `pending_action` 事件，等待确认
5. 多轮 tool call 循环直到 LLM 返回纯文本

**新建文件**: `reading-cards-backend/src/chat/toolExecutor.mjs`

- `executeTool(name, args, userContext)` — 分发到已有 service 层
- 内部直接调用 `boardsService`, `cardsService` 等，不走 HTTP

### 第四步：后端路由

**新建文件**: `reading-cards-backend/src/routes/v2/chat.mjs`

两个端点：
- `POST /api/v2/chat` — 发送消息，SSE 流式响应
  - 请求体：`{ messages: [{role, content}], context?: { board_id, topic_id } }`
  - SSE 事件类型：
    - `delta` — 文本片段（打字机）
    - `tool_start` — 开始执行工具（read_only）
    - `tool_result` — 工具执行结果
    - `pending_actions` — 需要确认的写操作列表
    - `done` — 完成
    - `error` — 错误

- `POST /api/v2/chat/confirm` — 确认/取消待执行操作
  - 请求体：`{ session_id: string, confirmed: boolean }`
  - 确认后继续执行 → 结果回传 LLM → 继续 SSE 流

**修改文件**: `reading-cards-backend/src/server.mjs` — 注册路由

### 第五步：前端 — ChatPanel 组件

**新建文件**: `web-app/src/components/ChatPanel.jsx`

浮动聊天面板，固定在右下角：
- 可折叠/展开（默认折叠为一个圆形按钮）
- 消息列表：
  - 用户消息（右对齐）
  - AI 文本回复（左对齐，流式渲染）
  - 工具执行状态（小卡片：工具名 + 状态图标）
  - **确认卡片**：write/destructive 操作显示操作摘要 + "确认" / "取消" 按钮
- 输入框 + 发送按钮
- 快捷指令提示（如 "帮我分析这个问题"、"生成假说"）

UI 风格：沿用 glass-surface + CSS 变量。

### 第六步：前端 — Chat Store + API

**修改文件**: `web-app/src/lib/api.js` — 添加 `chatApi`

```javascript
export const chatApi = {
  // 发送消息，返回 fetch Response（用于读取 SSE 流）
  send: (messages, context) => { /* fetch with text/event-stream */ },
  // 确认/取消待执行操作
  confirm: (sessionId, confirmed) => { /* POST /api/v2/chat/confirm */ },
};
```

**修改文件**: `web-app/src/lib/store.js` — 添加 `useChatStore`

```
useChatStore:
  - messages: [] — 聊天历史（含 tool 执行记录）
  - isOpen: false — 面板开关
  - loading: false — AI 是否在回复
  - pendingActions: [] — 待确认的操作
  - context: { board_id, topic_id } — 当前上下文
  - sessionId: null — 当前会话 ID（用于确认流程）
  - sendMessage(content) — 发送消息，解析 SSE 流
  - confirmActions(confirmed) — 确认/取消待执行操作
  - setContext(ctx) — 设置上下文
  - clearMessages() — 清空历史
  - onBoardMutated: null — 回调：画板数据变更时通知外部刷新
```

### 第七步：集成

**修改文件**: `web-app/src/pages/ThinkingBoardPage.jsx`
- 引入 ChatPanel
- 设置 chat context（board_id, topic_id）
- 注册 `onBoardMutated` 回调 → 重新加载画板数据

**修改文件**: `web-app/src/components/Layout.jsx`
- 全局挂载 ChatPanel（非 ThinkingBoard 页面也可用，但功能受限于 context）

## 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `reading-cards-backend/src/chat/tools/board_tools.json` | Canonical tool specs |
| 新建 | `reading-cards-backend/src/chat/adapters/base.mjs` | Adapter 基类 |
| 新建 | `reading-cards-backend/src/chat/adapters/openai.mjs` | OpenAI adapter |
| 新建 | `reading-cards-backend/src/chat/adapters/anthropic.mjs` | Anthropic adapter |
| 新建 | `reading-cards-backend/src/chat/adapters/index.mjs` | Adapter 工厂 |
| 新建 | `reading-cards-backend/src/chat/orchestrator.mjs` | 编排引擎 |
| 新建 | `reading-cards-backend/src/chat/toolExecutor.mjs` | Tool 执行器 |
| 新建 | `reading-cards-backend/src/routes/v2/chat.mjs` | Chat SSE 路由 |
| 新建 | `web-app/src/components/ChatPanel.jsx` | 聊天面板 UI |
| 修改 | `reading-cards-backend/src/server.mjs` | 注册 chat 路由 |
| 修改 | `web-app/src/lib/api.js` | 添加 chatApi |
| 修改 | `web-app/src/lib/store.js` | 添加 useChatStore |
| 修改 | `web-app/src/pages/ThinkingBoardPage.jsx` | 集成 ChatPanel + 画板刷新 |
| 修改 | `web-app/src/components/Layout.jsx` | 全局挂载 ChatPanel |

## 关键设计决策

1. **Canonical Action Protocol** — 所有模型输出统一转为内部协议，业务层零厂商依赖
2. **Tool Spec Compiler** — 工具定义单一来源（JSON），运行时编译为厂商格式，避免重复维护
3. **确认门** — write/destructive 操作强制用户确认，不依赖模型"自觉"
4. **SSE 而非 WebSocket** — 单向流足够，实现简单，天然支持确认流程的暂停/恢复
5. **Adapter 模式** — 换模型只换 adapter 文件，orchestrator 和 toolExecutor 完全不动
6. **上下文注入** — system prompt 动态注入画板状态，AI 能感知当前环境
7. **画板变更回调** — AI 写操作执行后通知前端刷新，保持 UI 同步
