# Code Review Findings Log

> 由定时 code review 自动维护。简单问题自动修复并记录，需要用户判断的记录在"待讨论"区。

## 自动修复记录

| 时间 | 文件 | 修复内容 | 类型 |
|------|------|----------|------|
| 2026-03-14 | `routes/v2/cards.mjs:192` | `String(error)` → `error.message` 防止栈信息泄露到客户端 | 安全 |
| 2026-03-14 | `routes/v2/cards.mjs:205` | `GET /cards?limit=abc` 现在返回 400 而非传入 NaN | 输入验证 |

## 已审查模块

- [x] 后端路由: cards (2026-03-14)

## 待讨论事项（需要用户判断）

### 架构 / 重构类

- **cards.mjs: user_id 传递不一致** — `updateCard` 传 `req.user.id`，但 `findCardById` 和 `softDeleteCard` 不传，完全依赖 Supabase RLS。建议统一：要么全传（双重保护），要么全不传（信任 RLS）。

### 功能改变类

(暂无)

### 安全 / 性能类

- **P0: API Key 加密** — `aiClient.mjs:81` 和 `settings.mjs:139` 中 TODO 标记的加密逻辑未实现，当前用 Base64（等于明文）。需要决定：用 AES-256-GCM 还是 Supabase Vault？
- **P0: CORS 过于宽松** — `server.mjs` 中 `chrome-extension://` 前缀匹配允许任何扩展访问 API。需要限定为具体扩展 ID。
- **P1: 启动调试日志** — `server.mjs:18-28` 每次启动打印环境变量状态，建议用 LOG_LEVEL 控制。
- **P2: cards search 全量加载** — `POST /cards/search` 先 `listCards` 加载用户全部卡片再过滤。用户卡片多时性能差。建议：关键词搜索走数据库 `ilike`/全文搜索，AI 搜索可加 `limit` 或分批。
