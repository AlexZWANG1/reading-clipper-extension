# NotebookLM 升级实施报告

## 执行摘要

已完成 Phase 1（Python Sidecar）和 Phase 2（Node.js 后端集成）的代码实现。系统已准备就绪，待数据库迁移完成后即可进行完整测试。

---

## ✅ 已完成工作

### Phase 1: Python Ingestion Sidecar

**状态：** 代码完成，功能验证通过（除数据库维度问题）

**已创建文件：**
- `ingestion-sidecar/src/ingestion/` — 完整的摄入管道
  - `api.py` — FastAPI 端点（/health, /ingest, /embed）
  - `pipeline.py` — 主管道编排
  - `embedder.py` — Ollama 本地 embedding
  - `db.py` — Supabase REST API 客户端
  - `chunker.py` — 文档分块
  - `extractors/` — URL/文档提取器

**技术栈：**
- Ollama nomic-embed-text（768 维）
- Supabase REST API（绕过 VPN/DNS 问题）
- FastAPI（端口 8100）

**测试结果：**
- ✅ Ollama embedding 正常（768 维向量）
- ✅ Sidecar 启动正常
- ✅ `/health` 端点正常
- ✅ `/embed` 端点正常
- ✅ 文本提取、分块、embedding 生成正常
- ❌ 数据库插入失败：**维度不匹配（768 vs 1536）**

---

### Phase 2: Node.js 后端集成

**状态：** 代码完成，待测试

**已创建文件：**

#### 1. `src/routes/v2/materials.mjs`
Materials API — 内容摄入管理

**端点：**
- `POST /api/v2/materials/ingest` — 触发内容摄入
  - 创建 material 记录
  - 异步调用 Python sidecar
  - 返回 material_id 和状态

- `GET /api/v2/materials/:id` — 获取 material 状态

- `GET /api/v2/materials` — 列出用户的 materials
  - 支持分页（limit, offset）
  - 支持过滤（topic_id, status）

- `DELETE /api/v2/materials/:id` — 删除 material（级联删除 chunks）

**特性：**
- 异步摄入（fire-and-forget）
- 错误处理和状态更新
- RLS 权限验证

#### 2. `src/routes/v2/search.mjs`
Search API — 语义搜索

**端点：**
- `POST /api/v2/search/semantic` — 语义搜索 chunks
  - 调用 sidecar 生成查询向量
  - 调用 Postgres RPC `search_chunks_hybrid`
  - 返回带 material 元数据的结果

- `POST /api/v2/search/cards` — 搜索 cards（向后兼容）
  - 调用 Postgres RPC `search_cards_by_embedding`

**特性：**
- 向量相似度搜索
- 混合搜索（向量 + 文本）
- 结果富化（material 元数据）
- 支持 topic 过滤

#### 3. `src/server.mjs`（已修改）
- 注册新路由：`/api/v2/materials`, `/api/v2/search`
- 导入新模块

#### 4. `.env`（已更新）
```bash
SIDECAR_URL=http://127.0.0.1:8100
SIDECAR_API_KEY=rc-sidecar-2026
```

---

## ⚠️ 阻塞问题：数据库维度不匹配

### 问题描述
- **当前状态：** `chunks.embedding` 列为 `vector(1536)`
- **需要状态：** `chunks.embedding` 列为 `vector(768)`
- **原因：** Migration 010 使用了 OpenAI ada-002 的维度（1536），但我们改用 Ollama nomic-embed-text（768）

### 解决方案：Migration 011

**已创建文件：** `supabase/migrations/011_fix_embedding_dimensions.sql`

**SQL 内容：**
```sql
-- Drop existing index
DROP INDEX IF EXISTS idx_chunks_embedding;

-- Alter embedding column to 768 dimensions
ALTER TABLE chunks ALTER COLUMN embedding TYPE vector(768);

-- Update default embedding model
ALTER TABLE chunks ALTER COLUMN embedding_model SET DEFAULT 'nomic-embed-text';

-- Recreate HNSW index
CREATE INDEX idx_chunks_embedding ON chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Also update cards table if it has embedding column
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'cards' AND column_name = 'embedding'
    ) THEN
        DROP INDEX IF EXISTS idx_cards_embedding;
        ALTER TABLE cards ALTER COLUMN embedding TYPE vector(768);
        ALTER TABLE cards ALTER COLUMN embedding_model SET DEFAULT 'nomic-embed-text';
        CREATE INDEX idx_cards_embedding ON cards
          USING hnsw (embedding vector_cosine_ops)
          WITH (m = 16, ef_construction = 64);
    END IF;
END $$;
```

### 执行步骤

**方式 1：Supabase SQL Editor（推荐）**
1. 访问：https://supabase.com/dashboard/project/eqvlgoiiumstaqywtpon/sql/new
2. 粘贴上述 SQL
3. 点击 Run

**方式 2：psql（如果可用）**
```bash
psql "postgresql://postgres:[PASSWORD]@db.eqvlgoiiumstaqywtpon.supabase.co:5432/postgres" \
  -f reading-cards-backend/supabase/migrations/011_fix_embedding_dimensions.sql
```

**验证：**
```sql
SELECT
    column_name,
    data_type,
    udt_name
FROM information_schema.columns
WHERE table_name = 'chunks' AND column_name = 'embedding';
-- 应显示：vector(768)
```

---

## 🧪 测试计划（Migration 011 完成后）

### 1. 端到端摄入测试

```bash
# 启动 sidecar（如果未运行）
cd ingestion-sidecar
python run.py

# 启动 Node.js 后端（新终端）
cd reading-cards-backend
npm start

# 测试摄入（新终端）
curl -X POST http://localhost:3000/api/v2/materials/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "source_type": "text",
    "title": "Test Document",
    "text": "This is a test document. It contains multiple sentences for testing the chunking and embedding pipeline."
  }'

# 预期响应：
# {
#   "ok": true,
#   "material_id": "UUID",
#   "status": "pending"
# }
```

### 2. 检查摄入状态

```bash
# 获取 material 状态
curl http://localhost:3000/api/v2/materials/MATERIAL_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 预期响应：
# {
#   "id": "UUID",
#   "title": "Test Document",
#   "ingestion_status": "completed",
#   "chunk_count": 1,
#   "word_count": 14,
#   ...
# }
```

### 3. 语义搜索测试

```bash
curl -X POST http://localhost:3000/api/v2/search/semantic \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "query": "test document",
    "limit": 5,
    "min_score": 0.3
  }'

# 预期响应：
# {
#   "results": [
#     {
#       "id": "UUID",
#       "content": "This is a test document...",
#       "similarity": 0.85,
#       "material": {
#         "id": "UUID",
#         "title": "Test Document",
#         "source_type": "text"
#       }
#     }
#   ],
#   "total": 1
# }
```

### 4. URL 摄入测试（可选）

```bash
curl -X POST http://localhost:3000/api/v2/materials/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "source_type": "url",
    "url": "https://example.com/article",
    "title": "Example Article"
  }'
```

---

## 📋 下一步工作

### Phase 3: Chat RAG 集成（待开始）

**目标：** 让 Chat 功能使用新的语义搜索

**需要修改的文件：**

1. **`src/chat/tools.mjs`** — 新增 `semantic_search` 工具
```javascript
{
    type: "function",
    function: {
        name: "semantic_search",
        description: "Semantic search across user's document chunks",
        parameters: {
            type: "object",
            properties: {
                query: { type: "string" },
                limit: { type: "number", default: 10 },
            },
            required: ["query"],
        },
    },
}
```

2. **`src/chat/toolExecutor.mjs`** — 实现 `semantic_search` 执行逻辑
```javascript
case "semantic_search":
    const response = await fetch(`${BACKEND_URL}/api/v2/search/semantic`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${userToken}`,
        },
        body: JSON.stringify({
            query: args.query,
            limit: args.limit || 10,
        }),
    });
    return await response.json();
```

3. **`src/chat/orchestrator.mjs`** — 更新 SYSTEM_PROMPT
```javascript
const SYSTEM_PROMPT = `
You are a research assistant with access to the user's document library.

Available tools:
- semantic_search: Search across all ingested documents using semantic similarity

When the user asks questions about their documents, use semantic_search to find relevant information.
`;
```

### Phase 4: 迁移与清理（待开始）

**目标：** 废弃 OpenAI Vector Store 依赖

**需要修改的文件：**

1. **`src/services/vectorStoresV2.mjs`** — 标记为 deprecated
2. **`src/services/agents.mjs`** — 更新 `hypothesis_evaluator` 和 `search_agent`
3. **`src/routes/v2/cards.mjs`** — 为现有 cards 批量生成 embedding

---

## 🔧 技术栈总结

| 组件 | 技术 | 端口/地址 |
|---|---|---|
| 数据库 | Supabase (Postgres + pgvector) | https://eqvlgoiiumstaqywtpon.supabase.co |
| Embedding | Ollama (nomic-embed-text, 768 维) | http://127.0.0.1:11434 |
| Sidecar | Python 3.14 + FastAPI | http://127.0.0.1:8100 |
| 后端 | Node.js (ESM) + Express | http://localhost:3000 |
| 前端 | React SPA | http://localhost:5173 |

---

## 📊 测试用户

- **User ID:** `34920265-2ca4-4ac7-b2e5-bf2caacedd8b`
- **Email:** `test@example.com`
- **Password:** `testpassword123`

---

## 📁 新增文件清单

### Python Sidecar
- `ingestion-sidecar/src/ingestion/api.py`
- `ingestion-sidecar/src/ingestion/pipeline.py`
- `ingestion-sidecar/src/ingestion/embedder.py`
- `ingestion-sidecar/src/ingestion/db.py`
- `ingestion-sidecar/src/ingestion/chunker.py`
- `ingestion-sidecar/src/ingestion/config.py`
- `ingestion-sidecar/src/ingestion/extractors/url_extractor.py`
- `ingestion-sidecar/src/ingestion/extractors/doc_extractor.py`
- `ingestion-sidecar/run.py`
- `ingestion-sidecar/requirements.txt`
- `ingestion-sidecar/pyproject.toml`
- `ingestion-sidecar/.env.example`

### Node.js Backend
- `reading-cards-backend/src/routes/v2/materials.mjs` ✨ 新增
- `reading-cards-backend/src/routes/v2/search.mjs` ✨ 新增
- `reading-cards-backend/src/server.mjs` 🔧 已修改
- `reading-cards-backend/.env` 🔧 已修改

### Database
- `reading-cards-backend/supabase/migrations/010_materials_and_chunks.sql` ✅ 已应用
- `reading-cards-backend/supabase/migrations/011_fix_embedding_dimensions.sql` ⏸️ 待应用

### Documentation
- `ingestion-sidecar/PHASE1_RESULTS.md`
- `ingestion-sidecar/TESTING.md`
- `ingestion-sidecar/MIGRATION.md`
- `ingestion-sidecar/test-embeddings.sh`
- `ingestion-sidecar/test-ingest.sh`

---

## 🎯 关键决策记录

1. **使用 Ollama 本地 embedding** — 避免 OpenAI API 额度限制和 proxy 不支持问题
2. **使用 Supabase REST API** — 绕过 Windows VPN/DNS 劫持导致的 asyncpg SSL 连接失败
3. **768 维向量** — nomic-embed-text 标准维度，性能与质量平衡
4. **异步摄入** — Node.js 立即返回，Python sidecar 后台处理
5. **保留 sources 表** — 作为"信息源通讯录"，与 materials 分离

---

## ✅ 下一步行动

1. **立即执行：** 在 Supabase SQL Editor 中运行 Migration 011
2. **验证：** 检查 `chunks.embedding` 列类型为 `vector(768)`
3. **测试：** 运行端到端摄入和搜索测试
4. **继续：** 实施 Phase 3（Chat RAG 集成）

---

**状态：** Phase 1 & 2 代码完成，等待 Migration 011 应用后进行完整测试。
