# Reading Clipper 架构升级计划（修订版）

> 修订日期：2026-03-04
> 基于：原始计划 + 修改建议反馈 + 代码库实际状态验证

---

## 一、修订摘要：与原计划的关键差异

| # | 原计划做法 | 修订做法 | 原因 |
|---|---|---|---|
| 1 | 在现有 `sources` 表上加 full_text/ingestion_status 等字段 | **新建 `materials` 表**，`sources` 表完全不动 | sources 是"信息源通讯录"（有 name/category/importance_level/region），前端 SourcesPage、chat list_sources 工具都在用它做分类过滤。混入素材语义会破坏现有逻辑 |
| 2 | chunks 只有 heading_trail + page_range | chunks 新增 **`locator JSONB`** + **`quote TEXT`** | Citations 定位必须有 page/bbox/char_offset/quote，否则无法做"点击跳转到原文" |
| 3 | embedding 列只有 vector(1536) | 新增 **`embedding_model TEXT`** 列 | 未来换模型（不同维度）需要标记，否则混合维度报错，无法渐进迁移 |
| 4 | RLS 用 `FOR ALL USING(...)` 单条策略 | 拆分 **4 条 policy**（SELECT/INSERT/UPDATE/DELETE），INSERT 用 WITH CHECK | 原写法 INSERT 不验证 user_id，存在安全漏洞 |
| 5 | search RPC 只做向量搜索 | **混合检索 FTS + 向量**，合并去重 | 纯向量对专名/数字/型号会漏 |
| 6 | full_text 存 TEXT 列 | MVP 阶段先存 TEXT + excerpt 摘要，**查询时永远不 SELECT full_text** | 兼顾开发速度和性能，后期可迁对象存储 |
| 7 | HNSW 索引硬编码 | 保留 HNSW，但 **migration 加版本检测注释** | Supabase 内置 pgvector ≥ 0.5 已支持 HNSW，但加 fallback 说明以防自建环境 |

---

## 二、现有代码库实际状态（验证结果）

### 2.1 两套 AI 调用路径

| 路径 | 使用方 | API 格式 | 经过 proxy？ |
|---|---|---|---|
| `agents.mjs` → `aiRuntime.mjs` | 卡片生成、搜索、假设评估 | OpenAI Responses API | 是 |
| `orchestrator.mjs` → `aiClient.mjs` → `aiRuntime.mjs` | Chat 对话 | OpenAI Chat Completions (tool_calls) | 是 |
| `vectorStoresV2.mjs` → `new OpenAI()` | 向量存储（file_search） | OpenAI beta SDK 直连 | **否！绕过 proxy** |

**关键发现**：`vectorStoresV2.mjs` 直接用 `process.env.OPENAI_API_KEY` 初始化 OpenAI SDK，完全绕过 `aiRuntime.mjs` 的 proxy 逻辑。如果环境只有 proxy，Vector Store 功能实际上是坏的。

### 2.2 现有 sources 表的实际用法

```
sources 表字段: id, user_id, name, category, importance_level(1/2/3), url, region, description, status
```

使用位置：
- `web-app/src/pages/SourcesPage.jsx` — 独立的信息源管理页面（列表/筛选/CRUD）
- `src/chat/tools.mjs` → `list_sources` 工具 — Chat AI 可查询信息源
- `src/chat/toolExecutor.mjs` → 调用 `listSources()` 服务
- `src/routes/v2/sources.mjs` — 完整 CRUD API（按 category/status/importance_level 过滤）

**结论**：sources 表是纯粹的"信息源通讯录"，与内容摄入完全无关。改造它会破坏现有 5 个以上文件。

### 2.3 现有 cards 搜索的瓶颈

`cards.mjs:POST /search` 的 `use_ai` 模式：
1. 先 `listCards()` 把该用户**全部卡片**加载到内存
2. 把全部卡片塞进 `runSearchAgent()` 的 LLM prompt
3. LLM 返回排序后的 card_id 列表

问题：卡片数量 > 100 就会超 context window，完全不可持续。

### 2.4 现有文件上传路径

`cards.mjs:POST /upload-file` 直接调 `https://api.openai.com/v1/files`（硬编码，不走 proxy）。
`cards.mjs:POST /generate-from-document` 调 `runFullDocumentCardGenerator({ fileId })` 用 Responses API 的 `input_file` 方式。

**结论**：文件处理完全绑定 OpenAI 生态，新架构需要替代这条路径。

### 2.5 Schema Drift

migration 001 定义的 cards 表**没有** `title` 和 `fact_or_view` 字段，但 `toolExecutor.mjs` 和 `vectorStoresV2.mjs` 都在使用它们。可能有未提交的 migration 或通过 Supabase Dashboard 手动加的列。需要在 Phase 0 migration 里确认并补齐。

---

## 三、修订后的数据模型

### 3.0 数据模型关系图

```
topics
  ├── materials (新表 — 内容容器：URL/PDF/文本素材)
  │     ├── source_type: url | file | text
  │     ├── title, url, mime_type, content_hash
  │     ├── excerpt (前500字), full_text (MVP 直存)
  │     ├── metadata JSONB, word_count, chunk_count
  │     ├── ingestion_status, ingestion_error
  │     └── embedding_model TEXT
  │           └── chunks[] (content + embedding + locator + quote + embedding_model)
  │
  ├── sources (不动 — 继续做"信息源通讯录")
  │
  ├── cards (+ embedding + material_id? + chunk_id? + embedding_model)
  │
  ├── documents (不动)
  │
  └── boards → nodes → edges (不动)

ingestion_jobs → materials (异步处理状态追踪)
```

### 3.1 新建 `materials` 表

```sql
CREATE TABLE materials (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES topics(id) ON DELETE SET NULL,

    -- 基本信息
    title TEXT NOT NULL,                          -- 素材标题（URL title / 文件名 / 用户输入）
    source_type TEXT NOT NULL DEFAULT 'url'
      CHECK (source_type IN ('url', 'file', 'text')),
    url TEXT,                                     -- 原始 URL（source_type='url' 时）
    file_path TEXT,                               -- 存储路径（source_type='file' 时）
    mime_type TEXT,                                -- MIME 类型

    -- 内容（MVP 阶段直存 TEXT，后期可迁对象存储）
    excerpt TEXT,                                 -- 前 500 字摘要（用于列表展示，避免 SELECT full_text）
    full_text TEXT,                               -- 提取的全文
    content_hash TEXT,                            -- SHA-256，用于去重

    -- 元数据
    metadata JSONB DEFAULT '{}'::jsonb,           -- { pages, language, author, publish_date, ... }
    word_count INTEGER,
    chunk_count INTEGER DEFAULT 0,

    -- 摄入状态
    ingestion_status TEXT DEFAULT 'pending'
      CHECK (ingestion_status IN ('pending', 'processing', 'completed', 'failed', 'retrying')),
    ingestion_error TEXT,

    -- Embedding 模型标记
    embedding_model TEXT,                         -- 用于 chunks 的 embedding 模型（如 'text-embedding-3-small'）

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_materials_user_id ON materials(user_id);
CREATE INDEX idx_materials_topic_id ON materials(topic_id);
CREATE INDEX idx_materials_status ON materials(ingestion_status);
CREATE UNIQUE INDEX idx_materials_content_hash ON materials(user_id, content_hash)
  WHERE content_hash IS NOT NULL;  -- 同一用户同一内容去重

-- updated_at 触发器
CREATE TRIGGER set_materials_updated_at
  BEFORE UPDATE ON materials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS（拆分 4 条 policy）
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "materials_select" ON materials FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "materials_insert" ON materials FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "materials_update" ON materials FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "materials_delete" ON materials FOR DELETE
  USING (auth.uid() = user_id);
```

### 3.2 新建 `chunks` 表

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE chunks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES topics(id) ON DELETE SET NULL,

    -- 内容
    content TEXT NOT NULL,                        -- chunk 文本
    chunk_index INTEGER NOT NULL,                 -- 在文档中的顺序
    heading_trail TEXT[],                         -- 层级标题路径 ['Ch1', 'Sec1.2']

    -- 定位信息（Citations 核心）
    locator JSONB DEFAULT '{}'::jsonb,            -- 结构化定位
    -- locator 结构示例:
    -- {
    --   "page": 3,                              -- 页码
    --   "page_end": 4,                          -- 结束页码（跨页时）
    --   "bbox": {"l": 72, "t": 340, "r": 540, "b": 420},  -- PDF 边界框
    --   "char_start": 1200,                     -- 在全文中的字符起始位置
    --   "char_end": 1850,                       -- 字符结束位置
    --   "selector": { ... }                     -- Web Annotation selector（可选）
    -- }
    quote TEXT,                                   -- 前 100 字预览文本（用于 UI 快速展示 citation）

    -- 向量
    embedding vector(1536),                       -- pgvector 向量
    embedding_model TEXT DEFAULT 'text-embedding-3-small',  -- 模型标记

    -- 元数据
    token_count INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 向量索引（HNSW）
-- 注意：需要 pgvector >= 0.5.0。Supabase 托管版已支持。
-- 如果自建环境 pgvector < 0.5，替换为:
--   CREATE INDEX idx_chunks_embedding ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_chunks_embedding ON chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 常规索引
CREATE INDEX idx_chunks_material_id ON chunks(material_id);
CREATE INDEX idx_chunks_user_id ON chunks(user_id);
CREATE INDEX idx_chunks_topic_id ON chunks(topic_id);
CREATE INDEX idx_chunks_index ON chunks(material_id, chunk_index);

-- 全文搜索（'simple' 配置同时支持中英文基础分词）
CREATE INDEX idx_chunks_fts ON chunks
  USING gin(to_tsvector('simple', content));

-- updated_at 触发器
CREATE TRIGGER set_chunks_updated_at
  BEFORE UPDATE ON chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS（拆分 4 条 policy）
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chunks_select" ON chunks FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "chunks_insert" ON chunks FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "chunks_update" ON chunks FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "chunks_delete" ON chunks FOR DELETE
  USING (auth.uid() = user_id);
```

### 3.3 `cards` 表新增字段

```sql
-- 向量字段
ALTER TABLE cards ADD COLUMN embedding vector(1536);
ALTER TABLE cards ADD COLUMN embedding_model TEXT DEFAULT 'text-embedding-3-small';

-- 关联到素材系统（可选，卡片可以独立于素材存在）
ALTER TABLE cards ADD COLUMN material_id UUID REFERENCES materials(id) ON DELETE SET NULL;
ALTER TABLE cards ADD COLUMN chunk_id UUID REFERENCES chunks(id) ON DELETE SET NULL;

-- 卡片向量索引
CREATE INDEX idx_cards_embedding ON cards
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

### 3.4 新建 `ingestion_jobs` 表

```sql
CREATE TABLE ingestion_jobs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,

    status TEXT DEFAULT 'queued'
      CHECK (status IN ('queued', 'extracting', 'chunking', 'embedding', 'completed', 'failed')),
    error_message TEXT,
    progress JSONB DEFAULT '{}'::jsonb,     -- { step: "chunking", percent: 45, detail: "处理第3页" }
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_ingestion_jobs_status ON ingestion_jobs(status);
CREATE INDEX idx_ingestion_jobs_user_id ON ingestion_jobs(user_id);
CREATE INDEX idx_ingestion_jobs_material_id ON ingestion_jobs(material_id);

CREATE TRIGGER set_ingestion_jobs_updated_at
  BEFORE UPDATE ON ingestion_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE ingestion_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ingestion_jobs_select" ON ingestion_jobs FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "ingestion_jobs_insert" ON ingestion_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ingestion_jobs_update" ON ingestion_jobs FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

### 3.5 Postgres RPC 函数（混合检索）

```sql
-- === 向量搜索 chunks ===
CREATE OR REPLACE FUNCTION search_chunks_hybrid(
    query_text TEXT,
    query_embedding vector(1536),
    match_count int DEFAULT 10,
    min_similarity float DEFAULT 0.3,
    p_user_id uuid DEFAULT NULL,
    p_topic_id uuid DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    material_id uuid,
    content text,
    heading_trail text[],
    locator jsonb,
    quote text,
    similarity float,
    match_type text       -- 'vector' | 'fts' | 'both'
) AS $$
BEGIN
    RETURN QUERY
    WITH
    -- 向量召回
    vec_results AS (
        SELECT c.id, c.material_id, c.content, c.heading_trail, c.locator, c.quote,
               (1 - (c.embedding <=> query_embedding))::float AS sim,
               'vector'::text AS mtype
        FROM chunks c
        WHERE (p_user_id IS NULL OR c.user_id = p_user_id)
          AND (p_topic_id IS NULL OR c.topic_id = p_topic_id)
          AND c.embedding IS NOT NULL
          AND (1 - (c.embedding <=> query_embedding)) > min_similarity
        ORDER BY c.embedding <=> query_embedding
        LIMIT match_count
    ),
    -- FTS 召回
    fts_results AS (
        SELECT c.id, c.material_id, c.content, c.heading_trail, c.locator, c.quote,
               ts_rank(to_tsvector('simple', c.content), plainto_tsquery('simple', query_text))::float AS sim,
               'fts'::text AS mtype
        FROM chunks c
        WHERE (p_user_id IS NULL OR c.user_id = p_user_id)
          AND (p_topic_id IS NULL OR c.topic_id = p_topic_id)
          AND to_tsvector('simple', c.content) @@ plainto_tsquery('simple', query_text)
        ORDER BY sim DESC
        LIMIT match_count
    ),
    -- 合并去重
    combined AS (
        SELECT DISTINCT ON (r.id) r.*
        FROM (
            SELECT * FROM vec_results
            UNION ALL
            SELECT * FROM fts_results
        ) r
        ORDER BY r.id, r.sim DESC
    )
    SELECT combined.id, combined.material_id, combined.content,
           combined.heading_trail, combined.locator, combined.quote,
           combined.sim AS similarity, combined.mtype AS match_type
    FROM combined
    ORDER BY combined.sim DESC
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- === 向量搜索 cards ===
CREATE OR REPLACE FUNCTION search_cards_by_embedding(
    query_embedding vector(1536),
    match_count int DEFAULT 10,
    min_similarity float DEFAULT 0.3,
    p_user_id uuid DEFAULT NULL,
    p_topic_id uuid DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    summary text,
    key_points jsonb,
    source_name text,
    source_url text,
    topic_id uuid,
    similarity float
) AS $$
BEGIN
    RETURN QUERY
    SELECT c.id, c.summary, c.key_points, c.source_name, c.source_url, c.topic_id,
           (1 - (c.embedding <=> query_embedding))::float AS similarity
    FROM cards c
    WHERE (p_user_id IS NULL OR c.user_id = p_user_id)
      AND (p_topic_id IS NULL OR c.topic_id = p_topic_id)
      AND c.embedding IS NOT NULL
      AND c.deleted = FALSE
      AND (1 - (c.embedding <=> query_embedding)) > min_similarity
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;
```

---

## 四、Phase 0 — 数据模型 Migration

### 产出文件

`reading-cards-backend/supabase/migrations/010_materials_and_chunks.sql`

包含以上所有 SQL（materials、chunks、cards ALTER、ingestion_jobs、RPC 函数）。

### 验证清单

- [ ] pgvector 扩展启用成功
- [ ] HNSW 索引创建成功（如果失败 → 换 ivfflat）
- [ ] materials 表 RLS 4 条 policy 均工作
- [ ] chunks 表 RLS 4 条 policy 均工作
- [ ] cards 表新增 embedding/material_id/chunk_id 列成功
- [ ] content_hash 唯一索引去重测试
- [ ] search_chunks_hybrid RPC 函数可正常调用
- [ ] search_cards_by_embedding RPC 函数可正常调用
- [ ] update_updated_at_column 触发器对新表生效

### 注意事项

1. **Schema Drift 问题**：需先确认 cards 表是否已有 `title` 和 `fact_or_view` 列。如果没有，在本次 migration 中一并补齐。
2. **Migration 编号**：跳过了 007，上一个是 009。用 010。
3. **回滚说明**：migration 文件顶部需加注释说明回滚步骤（DROP TABLE chunks, materials, ingestion_jobs; ALTER TABLE cards DROP COLUMN embedding...）。

---

## 五、Phase 1 — Python Ingestion Sidecar

### 5.1 目录结构

```
reading-clipper-extension/
  ingestion-sidecar/
    pyproject.toml
    requirements.txt
    Dockerfile
    src/
      ingestion/
        __init__.py
        api.py                  # FastAPI 入口
        pipeline.py             # 主管道编排
        extractors/
          __init__.py
          url_extractor.py      # content-core 封装（URL → 文本）
          doc_extractor.py      # content-core[docling] 封装（PDF/Word → 文本 + 结构）
        chunker.py              # Docling HierarchicalChunker 封装
        embedder.py             # Esperanto 多 provider embedding
        db.py                   # asyncpg → Postgres 写入
        config.py               # 配置（环境变量、默认值）
```

### 5.2 核心管道流程

```
POST /ingest
  { user_id, material_id, source_type, url?, file_path?, text?, topic_id?, options }
     │
     ▼
  1. 去重检查 (content_hash)
     └── SELECT id FROM materials WHERE user_id = ? AND content_hash = ?
     └── 如果存在 → 返回 { duplicate: true, existing_material_id }
     │
     ▼
  2. 内容提取 (Content Core)
     ├── URL  → content_core.extract(url)           # 引擎链: jina → beautifulsoup
     ├── PDF  → content_core.extract(file, engine='docling')  # OCR + 表格 + 公式
     ├── Word → content_core.extract(file, engine='docling')
     └── Text → passthrough (直接使用)
     │
     ▼
  3. 内容哈希 + 二次去重
     └── SHA-256(extracted_text)
     │
     ▼
  4. 文档分块 (Docling HierarchicalChunker / HybridChunker)
     └── 保留: chunk.text, chunk.meta.headings, chunk.meta.page, chunk.meta.doc_items[].prov[].bbox
     └── 构建 locator JSONB 和 quote 预览
     │
     ▼
  5. Embedding 生成 (Esperanto)
     └── AIFactory.create_embedding(provider, model_name)
     └── 批量 embed: embedder.embed(texts)
     │
     ▼
  6. 写入 Postgres (asyncpg 直连)
     ├── materials 表: full_text, excerpt, content_hash, metadata, word_count, chunk_count, ingestion_status='completed'
     ├── chunks 表: 批量 INSERT (content, embedding, locator, quote, heading_trail, embedding_model)
     └── ingestion_jobs 表: status='completed', completed_at=NOW()
```

### 5.3 关键依赖（已验证可行性）

```toml
[project]
name = "ingestion-sidecar"
requires-python = ">=3.10"
dependencies = [
    "fastapi>=0.115",
    "uvicorn>=0.34",
    "content-core[docling]",     # URL + PDF/Word 提取（v0.x, by lfnovo）
    "esperanto",                  # 多 provider embedding（by lfnovo）
    "asyncpg>=0.30",             # Postgres 异步驱动
    "pgvector>=0.3",             # pgvector Python 支持
    "python-dotenv>=1.0",
]
```

**依赖验证结果**：

| 库 | PyPI | GitHub Stars | 状态 | 风险 |
|---|---|---|---|---|
| content-core | 存在 | lfnovo/content-core | 活跃 | 小众但抽象层薄，替换成本低 |
| esperanto | 存在 | lfnovo/esperanto | 活跃，143 snippets | 同上 |
| docling | 存在 | docling-project/docling v2.75 | IBM 出品，活跃 | 低风险 |
| asyncpg | 存在 | 成熟库 | 稳定 | 无风险 |
| pgvector (Python) | 存在 | pgvector/pgvector-python | 稳定 | 无风险 |

**注意**：content-core 和 esperanto 都是同一作者 (lfnovo) 的项目。虽然活跃但相对小众。替换方案：
- content-core → 直接用 docling + httpx/beautifulsoup
- esperanto → 直接用 openai SDK 或 litellm

### 5.4 Esperanto Embedding 配置

```python
# config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Postgres
    DATABASE_URL: str

    # Embedding
    EMBEDDING_PROVIDER: str = "openai"           # openai / ollama / voyage / google
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_DIMENSIONS: int = 1536

    # Content extraction
    URL_ENGINE: str = "jina"                     # jina / beautifulsoup / firecrawl
    DOC_ENGINE: str = "docling"                  # docling / pymupdf

    # Sidecar 认证
    SIDECAR_API_KEY: str = ""                    # Node.js 后端调用时需携带

    # Proxy（如果 embedding 也需要走 proxy）
    AI_PROXY_ENDPOINT: str = ""
    AI_PROXY_API_KEY: str = ""

    class Config:
        env_file = ".env"
```

### 5.5 Locator 构建逻辑（从 Docling chunk 提取）

```python
# chunker.py
from docling.chunking import HierarchicalChunker
from docling.document_converter import DocumentConverter

def build_locator(chunk) -> dict:
    """从 Docling DocChunk 提取定位信息"""
    locator = {}

    # 页码
    if hasattr(chunk, 'meta') and chunk.meta.doc_items:
        first_item = chunk.meta.doc_items[0]
        if first_item.prov:
            prov = first_item.prov[0]
            locator["page"] = prov.page_no
            if hasattr(prov, 'bbox') and prov.bbox:
                locator["bbox"] = {
                    "l": int(prov.bbox.l),
                    "t": int(prov.bbox.t),
                    "r": int(prov.bbox.r),
                    "b": int(prov.bbox.b),
                }

        # 多 item 时取最后一个的页码作 page_end
        if len(chunk.meta.doc_items) > 1:
            last_item = chunk.meta.doc_items[-1]
            if last_item.prov:
                locator["page_end"] = last_item.prov[0].page_no

    return locator

def build_quote(chunk_text: str, max_len: int = 100) -> str:
    """前 N 字作为 quote 预览"""
    if len(chunk_text) <= max_len:
        return chunk_text
    return chunk_text[:max_len] + "..."
```

### 5.6 安全设计

1. **Sidecar 只监听 127.0.0.1:8100**（不暴露到外网）
2. **内部 API Key 认证**：Node.js 调用时携带 `X-Sidecar-Key` header，sidecar 验证
3. **user_id 由 Node.js 传入**（已通过 JWT 验证），sidecar 不做用户认证
4. **写入时用 service role**：sidecar 用 `DATABASE_URL`（带 service role）直连 Postgres，绕过 RLS

### 5.7 验证清单

- [ ] `POST /ingest` 提交 URL → sources + chunks 表写入正确
- [ ] `POST /ingest` 提交 PDF → 分块 + locator 包含 page/bbox
- [ ] 重复提交同一 URL → 去重返回 `duplicate: true`
- [ ] `POST /embed` 批量 embedding → 返回正确维度的向量
- [ ] Esperanto 切换 provider（openai → ollama）正常工作
- [ ] Sidecar API Key 验证：无 key 拒绝访问

---

## 六、Phase 2 — Node.js 后端集成

### 6.1 新增 API 端点

#### `POST /api/v2/materials/ingest` — 触发内容摄入

```javascript
// 新文件: src/routes/v2/materials.mjs
router.post('/ingest', requireAuth, async (req, res) => {
    const { source_type, url, title, topic_id, options } = req.body;
    const userId = req.user.id;

    // 1. 创建 material 记录
    const { data: material, error } = await supabaseAdmin
        .from('materials')
        .insert({
            user_id: userId,
            title: title || url || '未命名素材',
            source_type: source_type || 'url',
            url,
            topic_id: topic_id || null,
            ingestion_status: 'pending',
        })
        .select()
        .single();

    if (error) throw new Error(error.message);

    // 2. 创建 ingestion job
    await supabaseAdmin.from('ingestion_jobs').insert({
        user_id: userId,
        material_id: material.id,
        status: 'queued',
    });

    // 3. 触发 Python sidecar（fire-and-forget + 错误处理）
    fetch(`${process.env.SIDECAR_URL || 'http://127.0.0.1:8100'}/ingest`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Sidecar-Key': process.env.SIDECAR_API_KEY || '',
        },
        body: JSON.stringify({
            user_id: userId,
            material_id: material.id,
            source_type,
            url,
            topic_id,
            options,
        }),
    }).catch(err => {
        console.error('Sidecar 调用失败:', err.message);
        // 更新状态为 failed
        supabaseAdmin.from('materials')
            .update({ ingestion_status: 'failed', ingestion_error: err.message })
            .eq('id', material.id);
    });

    res.json({ ok: true, material_id: material.id, status: 'processing' });
});
```

#### `GET /api/v2/materials/:id/status` — 查询摄入进度

```javascript
router.get('/:id/status', requireAuth, async (req, res) => {
    const { data: job } = await supabaseAdmin
        .from('ingestion_jobs')
        .select('status, progress, error_message, completed_at')
        .eq('material_id', req.params.id)
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    res.json({ ok: true, job });
});
```

#### `POST /api/v2/search/semantic` — 混合语义搜索

```javascript
// 新文件: src/routes/v2/search.mjs
router.post('/semantic', requireAuth, async (req, res) => {
    const { query, limit = 10, min_score = 0.3,
            search_cards = true, search_chunks = true, topic_id } = req.body;
    const userId = req.user.id;

    // 1. 获取查询向量（调用 sidecar 的 /embed 端点）
    const embedResponse = await fetch(`${SIDECAR_URL}/embed`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Sidecar-Key': process.env.SIDECAR_API_KEY || '',
        },
        body: JSON.stringify({ texts: [query] }),
    });
    const { embeddings } = await embedResponse.json();
    const queryEmbedding = embeddings[0];

    let chunkResults = [], cardResults = [];

    // 2. 混合搜索 chunks（FTS + 向量）
    if (search_chunks) {
        const { data } = await supabaseAdmin.rpc('search_chunks_hybrid', {
            query_text: query,
            query_embedding: queryEmbedding,
            match_count: limit,
            min_similarity: min_score,
            p_user_id: userId,
            p_topic_id: topic_id || null,
        });
        chunkResults = data || [];
    }

    // 3. 向量搜索 cards
    if (search_cards) {
        const { data } = await supabaseAdmin.rpc('search_cards_by_embedding', {
            query_embedding: queryEmbedding,
            match_count: limit,
            min_similarity: min_score,
            p_user_id: userId,
            p_topic_id: topic_id || null,
        });
        cardResults = data || [];
    }

    res.json({ ok: true, chunks: chunkResults, cards: cardResults });
});
```

### 6.2 需要修改的现有文件

| 文件 | 修改 |
|---|---|
| `src/server.mjs` | 新增 `app.use('/api/v2/materials', materialsRouter)` 和 `app.use('/api/v2/search', searchRouter)` |
| `src/routes/v2/cards.mjs:POST /capture` | capture 后异步调 sidecar `/embed` 获取 embedding，写入 cards.embedding |
| `web-app/src/lib/api.js` | 新增 `ingestMaterial()`, `getMaterialStatus()`, `semanticSearch()` |
| `web-app/src/components/AddCardSection.jsx` | 新增 URL 提交 UI（输入框 + 提交按钮 + 进度显示） |

### 6.3 卡片 Capture 后自动 Embedding

在 `cards.mjs:POST /capture` 的 `res.json()` **之后**异步触发（不阻塞响应）：

```javascript
// 在 capture handler 末尾（res.json 之后）
// 异步，不阻塞响应
setImmediate(async () => {
    try {
        const textForEmbed = [card.summary, card.raw_snippet].filter(Boolean).join(' ');
        const embedRes = await fetch(`${SIDECAR_URL}/embed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Sidecar-Key': SIDECAR_KEY },
            body: JSON.stringify({ texts: [textForEmbed] }),
        });
        const { embeddings } = await embedRes.json();
        await supabaseAdmin.from('cards')
            .update({ embedding: embeddings[0], embedding_model: 'text-embedding-3-small' })
            .eq('id', card.id);
    } catch (err) {
        console.error('卡片 embedding 失败:', err.message);
    }
});
```

### 6.4 验证清单

- [ ] `POST /api/v2/materials/ingest` → material 记录创建 + sidecar 被调用
- [ ] `GET /api/v2/materials/:id/status` → 返回正确的 job 状态
- [ ] `POST /api/v2/search/semantic` → 返回混合结果（chunks + cards）
- [ ] 对比搜索质量：旧 `search_agent`（全量塞 LLM）vs 新 pgvector
- [ ] 卡片 capture 后 embedding 异步写入成功

---

## 七、Phase 3 — Chat RAG 升级

### 7.1 新增 `semantic_search` 工具

在 `src/chat/tools.mjs` 的 `TOOL_DEFINITIONS` 数组中新增：

```javascript
{
    type: "function",
    function: {
        name: "semantic_search",
        description: "Semantic search across user's reading cards and document chunks using vector similarity + full-text search. Returns results ranked by relevance with source citations. Use this for finding relevant content by meaning, not just keywords. Prefer this over search_cards for complex or conceptual queries.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Natural language search query. For best results, try different formulations of the same question."
                },
                search_cards: { type: "boolean", default: true, description: "Search reading cards" },
                search_chunks: { type: "boolean", default: true, description: "Search document chunks from ingested materials" },
                topic_id: { type: "string", description: "Optional: limit search to a specific topic" },
                limit: { type: "number", default: 10, description: "Max results per type (cards/chunks)" },
            },
            required: ["query"],
        },
    },
    side_effect: "read_only",
}
```

### 7.2 `toolExecutor.mjs` 新增执行逻辑

```javascript
case "semantic_search": {
    // 调用 /api/v2/search/semantic（内部调用，不走 HTTP）
    const { query, search_cards = true, search_chunks = true, topic_id, limit = 10 } = args;

    // 获取查询向量
    const embedRes = await fetch(`${SIDECAR_URL}/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Sidecar-Key': SIDECAR_KEY },
        body: JSON.stringify({ texts: [query] }),
    });
    const { embeddings } = await embedRes.json();
    const queryEmbedding = embeddings[0];

    let chunks = [], cards = [];

    if (search_chunks) {
        const { data } = await supabase.rpc('search_chunks_hybrid', {
            query_text: query,
            query_embedding: queryEmbedding,
            match_count: limit,
            min_similarity: 0.3,
            p_user_id: userId,
            p_topic_id: topic_id || null,
        });
        chunks = (data || []).map(c => ({
            chunk_id: c.id,
            content: c.content.substring(0, 500),  // 截断避免过长
            heading_trail: c.heading_trail,
            quote: c.quote,
            locator: c.locator,
            similarity: c.similarity,
            match_type: c.match_type,
        }));
    }

    if (search_cards) {
        const { data } = await supabase.rpc('search_cards_by_embedding', {
            query_embedding: queryEmbedding,
            match_count: limit,
            min_similarity: 0.3,
            p_user_id: userId,
            p_topic_id: topic_id || null,
        });
        cards = (data || []).map(c => ({
            card_id: c.id,
            summary: c.summary,
            source_name: c.source_name,
            source_url: c.source_url,
            similarity: c.similarity,
        }));
    }

    return { chunks, cards, total: chunks.length + cards.length };
}
```

### 7.3 Orchestrator SYSTEM_PROMPT 追加 RAG 引导

在 `orchestrator.mjs` 的 `SYSTEM_PROMPT` 末尾追加：

```
## Semantic Search & Citations

You have a `semantic_search` tool that performs hybrid vector + full-text search across the user's cards and ingested document chunks.

### When to use semantic_search vs search_cards
- Use `semantic_search` for conceptual/meaning-based queries (e.g., "What evidence supports X?")
- Use `search_cards` for simple keyword lookups (e.g., "cards about climate")
- For complex questions, call `semantic_search` with 2-3 different query formulations to maximize recall

### Citation Protocol (MANDATORY)
When your answer uses information from search results:
1. Number each source: [1], [2], [3]...
2. At the end of your answer, list sources:
   - For chunks: [N] {heading_trail} (page {locator.page})
   - For cards: [N] {source_name} — "{summary 前30字}"
3. Include chunk_id or card_id in your citations so the frontend can link to the original
4. NEVER make claims without citing a source from the search results

### Multi-step Research
For complex questions:
1. First `semantic_search` with the main question
2. If results are insufficient, reformulate and search again
3. Analyze retrieved chunks/cards for relevance
4. Synthesize an answer grounded in evidence with citations
```

### 7.4 Citations 数据流设计

```
                                    ┌─────────────────────────────────────┐
 semantic_search 工具返回:           │  chunk_id, quote, locator, heading  │
                                    └────────────┬────────────────────────┘
                                                 │
                                                 ▼
                                    ┌─────────────────────────────────────┐
 AI 在回答中标注 [1][2][3]:          │  "根据[1]所述... 另外[2]指出..."     │
                                    │  [1] Ch1/Sec1.2 (page 3)           │
                                    │  [2] 纽约时报 — "气候变化的..."      │
                                    └────────────┬────────────────────────┘
                                                 │
                                                 ▼
                                    ┌─────────────────────────────────────┐
 前端渲染:                           │  [1] 可点击 → 打开 material 详情    │
                                    │     → 滚动到 page 3 / 高亮 quote   │
                                    └─────────────────────────────────────┘
```

**前端实现（后续）**：
- Chat 消息中的 `[N]` 渲染为可点击的 citation 标记
- 点击后打开 material 详情页（新页面或侧边栏）
- 如果有 `locator.page`，直接跳转到对应位置

### 7.5 验证清单

- [ ] Chat 中提问 → AI 调用 `semantic_search` → 结果包含 chunks 和 cards
- [ ] AI 回答中正确标注 [1][2] 并列出引用来源
- [ ] 复杂问题 → AI 发起多次 semantic_search（不同 query）
- [ ] Citations 信息完整：chunk_id, quote, locator 都有

---

## 八、Phase 4 — 迁移与兼容

### 8.1 废弃 OpenAI Vector Store 依赖

| 步骤 | 文件 | 操作 |
|---|---|---|
| 1 | `vectorStoresV2.mjs` | 文件顶部加 `@deprecated` 注释，不删除 |
| 2 | `agents.mjs:runSearchAgent` | 改为调用 search_chunks_hybrid RPC |
| 3 | `agents.mjs:hypothesis_evaluator` | 移除 file_search tool，改用 pgvector 搜索获取相关 chunks 后塞入 prompt |
| 4 | `cards.mjs:POST /upload-file` | 改为上传到 Supabase Storage，然后触发 sidecar ingest |
| 5 | `cards.mjs:POST /generate-from-document` | 改为先 ingest material → 生成 chunks → 基于 chunks 生成 cards |

### 8.2 历史卡片 Embedding 回填

Python sidecar 提供批量 API：

```
POST /embed-batch
{ texts: string[], ids: string[] }
→ 返回 { embeddings: float[][] }
```

Node.js 端写一个一次性脚本：
1. 分页查询 `SELECT id, summary, raw_snippet FROM cards WHERE embedding IS NULL`
2. 批量调 sidecar `/embed-batch`
3. 批量 UPDATE cards SET embedding = ...

### 8.3 验证清单

- [ ] 历史卡片全部有 embedding（`SELECT count(*) FROM cards WHERE embedding IS NULL` = 0）
- [ ] hypothesis_evaluator 不再使用 OpenAI file_search → 改用 pgvector 后功能正常
- [ ] search_agent 改用 pgvector → 搜索质量不降
- [ ] upload-file 改为 Supabase Storage → 上传后触发 ingest
- [ ] vectorStoresV2.mjs 无任何代码路径调用它（可安全注释掉）

---

## 九、完整文件清单

### 需要新建的文件

| 文件 | 说明 | Phase |
|---|---|---|
| `supabase/migrations/010_materials_and_chunks.sql` | 数据模型迁移 | 0 |
| `ingestion-sidecar/` (整个目录) | Python sidecar 项目 | 1 |
| `src/routes/v2/materials.mjs` | 素材摄入 API | 2 |
| `src/routes/v2/search.mjs` | 混合语义搜索 API | 2 |
| `docker-compose.yml` | 编排 Node + Python + Postgres（可选） | 1 |

### 需要修改的文件

| 文件 | 修改内容 | Phase |
|---|---|---|
| `src/server.mjs` | 新增 materials/search 路由挂载 | 2 |
| `src/routes/v2/cards.mjs` | capture 后异步触发 embedding | 2 |
| `src/chat/tools.mjs` | 新增 semantic_search 工具定义 | 3 |
| `src/chat/toolExecutor.mjs` | 实现 semantic_search 执行 | 3 |
| `src/chat/orchestrator.mjs` | SYSTEM_PROMPT 增加 RAG + Citations 引导 | 3 |
| `src/services/agents.mjs` | search_agent + hypothesis_evaluator 改用 pgvector | 4 |
| `web-app/src/lib/api.js` | 新增 ingestMaterial / semanticSearch API | 2 |
| `web-app/src/components/AddCardSection.jsx` | 新增 URL 提交 UI | 2 |

### 可复用的现有代码

| 文件 | 复用点 |
|---|---|
| `src/services/aiRuntime.mjs` | proxy/direct 模式检测逻辑 |
| `src/services/aiClient.mjs` | callChatAPI + tool_calls 格式 |
| `src/services/vectorStoresV2.mjs:buildCardFileContent()` | 卡片文本构建格式（参考） |
| `src/config/prompts.config.json` | prompt 模板系统 |
| `src/chat/orchestrator.mjs` | tool-calling loop + confirmation gate 模式 |

---

## 十、实施顺序与依赖

```
Phase 0: 数据模型迁移 (SQL migration)                 ← 基础，所有 Phase 都依赖
    │
    ├── Phase 1: Python Sidecar MVP                    ← URL提取 + 分块 + embedding
    │     ├── 依赖: Phase 0 (tables must exist)
    │     └── 可独立验证: curl 直接调 sidecar API
    │
    ├── Phase 2: Node.js API 集成                       ← /ingest + /search/semantic
    │     ├── 依赖: Phase 0 + Phase 1 (sidecar running)
    │     └── 可独立验证: curl 测试 Node API
    │
    ├── Phase 3: Chat RAG 升级                          ← semantic_search 工具
    │     ├── 依赖: Phase 2 (search API available)
    │     └── 可独立验证: Chat UI 测试
    │
    └── Phase 4: 迁移废弃 OpenAI vector store            ← 最后做，风险最低
          ├── 依赖: Phase 2 + 3 (新搜索功能已可用)
          └── 回填 embedding + 切换 search_agent + 废弃 vectorStoresV2
```

---

## 十一、已知问题与风险

### 高优先级

1. **Schema Drift**：cards 表的 `title` 和 `fact_or_view` 列可能只在 Supabase Dashboard 手动添加过，没有对应的 migration 文件。Phase 0 时需要先在 Supabase 中 `\d cards` 确认实际 schema，如果缺少则在 010 migration 中补齐。

2. **Chat 使用 Chat Completions API，不是 Responses API**：`orchestrator.mjs` 通过 `aiClient.mjs` 的 `callChatAPI()` 走 Chat Completions 格式（`messages[] + tool_calls + tool_choice`）。这与 `agents.mjs` 使用的 Responses API 是两条独立路径。Phase 3 新增 `semantic_search` 工具时要确保 Chat Completions 格式下的 tool 定义兼容。**已验证**：当前 tools.mjs 的格式就是 Chat Completions tool 格式，兼容。

3. **Proxy 不一定支持 tool_calls**：如果 proxy 是简单的 API 转发，需要确认它能正确传递 `tool_choice: "auto"` 和解析 `tool_calls` 响应。如果 proxy 不支持，Chat 功能会完全不工作。这是现有问题，不是本次升级引入的。

4. **Sidecar 单点故障**：如果 sidecar 进程挂了，所有 ingest 和 embed 都会失败。建议：
   - Node.js 端对 sidecar 调用做 timeout + retry
   - ingestion_jobs 表有 retry_count，支持重试
   - 考虑健康检查端点 `GET /health`

### 中优先级

5. **content-core 和 esperanto 的维护风险**：两个库都是同一作者的小众项目。如果停止维护：
   - content-core 替换为：直接用 `docling` + `httpx` + `beautifulsoup4`
   - esperanto 替换为：直接用 `openai` SDK（`client.embeddings.create()`）或 `litellm`
   - 抽象层很薄，替换成本约 1-2 天

6. **pgvector 维度锁定**：`vector(1536)` 是编译时固定的。如果未来要用 768 维的模型，需要：
   - 方案 A：新建一列 `embedding_768 vector(768)` + 新索引
   - 方案 B：DROP + 重建（需要重新 embed 全部数据）
   - `embedding_model` 字段可以帮助追踪哪些数据需要重建

7. **FTS 中文分词质量**：`to_tsvector('simple', ...)` 对中文只做单字分词（每个汉字一个 token），不如 `pg_jieba` 或 `zhparser` 的效果。但 'simple' 是 Supabase 内置的，不需要装扩展。MVP 阶段可接受，后续可升级。

8. **大文件 full_text 性能**：一篇 50 页 PDF 的 full_text 可能有 10 万字。虽然我们不 `SELECT full_text`，但 INSERT 时和 pg_dump 备份时仍有开销。如果后续发现性能问题，迁移到 Supabase Storage（对象存储）。

### 低优先级

9. **Embedding 一致性**：如果某些 cards 用 `text-embedding-3-small` embed，之后换了模型，查询时需要用同一模型生成 query embedding。`embedding_model` 字段可以辅助但无法自动解决。建议：同一时间只用一个模型，换模型时批量重建。

10. **Citation UI 实现**：Phase 3 只设计了数据流，前端渲染（可点击的 [1][2] 标记、material 详情页、滚动定位）需要额外的前端工作，不在本次计划范围内，但数据模型已经支持。

11. **ingestion_jobs 清理**：completed 的 job 会无限积累。需要定期清理或加 TTL。建议加一个 cron 或手动 SQL 清理。

12. **RLS 与 Service Role 的交互**：后端用 `supabaseAdmin`（service role）会绕过 RLS。RLS 主要防御的是前端直连 Supabase 的场景（如果有的话）。目前项目前端全部走 Node.js API，所以 RLS 是 defense-in-depth，不是主要安全边界。
