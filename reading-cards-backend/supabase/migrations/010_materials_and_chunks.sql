-- ============================================
-- Reading Clipper - 素材与分块系统迁移
-- Phase 0: 数据模型升级（pgvector + materials + chunks）
-- ============================================
--
-- 回滚步骤（如需撤销）:
--   DROP FUNCTION IF EXISTS search_chunks_hybrid;
--   DROP FUNCTION IF EXISTS search_cards_by_embedding;
--   DROP TABLE IF EXISTS ingestion_jobs;
--   DROP TABLE IF EXISTS chunks;
--   DROP TABLE IF EXISTS materials;
--   ALTER TABLE cards DROP COLUMN IF EXISTS embedding;
--   ALTER TABLE cards DROP COLUMN IF EXISTS embedding_model;
--   ALTER TABLE cards DROP COLUMN IF EXISTS material_id;
--   ALTER TABLE cards DROP COLUMN IF EXISTS chunk_id;
-- ============================================

-- 启用 pgvector 扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- 1. Materials 表（内容容器：URL/PDF/文本素材）
--    注意：不修改现有 sources 表（它是"信息源通讯录"，继续独立使用）
-- ============================================
CREATE TABLE IF NOT EXISTS materials (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES topics(id) ON DELETE SET NULL,

    -- 基本信息
    title TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'url'
      CHECK (source_type IN ('url', 'file', 'text')),
    url TEXT,
    file_path TEXT,
    mime_type TEXT,

    -- 内容
    excerpt TEXT,                                  -- 前500字摘要（列表展示用，避免 SELECT full_text）
    full_text TEXT,                                -- 提取的全文（MVP 直存，后期可迁对象存储）
    content_hash TEXT,                             -- SHA-256 去重

    -- 元数据
    metadata JSONB DEFAULT '{}'::jsonb,            -- { pages, language, author, publish_date, ... }
    word_count INTEGER,
    chunk_count INTEGER DEFAULT 0,

    -- 摄入状态
    ingestion_status TEXT DEFAULT 'pending'
      CHECK (ingestion_status IN ('pending', 'processing', 'completed', 'failed', 'retrying')),
    ingestion_error TEXT,

    -- Embedding 模型标记
    embedding_model TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Materials 索引
CREATE INDEX idx_materials_user_id ON materials(user_id);
CREATE INDEX idx_materials_topic_id ON materials(topic_id);
CREATE INDEX idx_materials_status ON materials(ingestion_status);
CREATE UNIQUE INDEX idx_materials_content_hash ON materials(user_id, content_hash)
  WHERE content_hash IS NOT NULL;

-- Materials updated_at 触发器
CREATE TRIGGER set_materials_updated_at
  BEFORE UPDATE ON materials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Materials RLS
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "materials_select" ON materials FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "materials_insert" ON materials FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "materials_update" ON materials FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "materials_delete" ON materials FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 2. Chunks 表（文档分块 + 向量）
-- ============================================
CREATE TABLE IF NOT EXISTS chunks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES topics(id) ON DELETE SET NULL,

    -- 内容
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    heading_trail TEXT[],                           -- 层级标题路径 ['Ch1', 'Sec1.2']

    -- 定位信息（Citations 核心）
    locator JSONB DEFAULT '{}'::jsonb,
    -- locator 结构:
    -- {
    --   "page": 3,
    --   "page_end": 4,
    --   "bbox": {"l": 72, "t": 340, "r": 540, "b": 420},
    --   "char_start": 1200,
    --   "char_end": 1850
    -- }
    quote TEXT,                                    -- 前100字预览（UI citation 展示用）

    -- 向量
    embedding vector(1536),
    embedding_model TEXT DEFAULT 'text-embedding-3-small',

    -- 元数据
    token_count INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chunks 向量索引（HNSW）
-- 需要 pgvector >= 0.5.0（Supabase 托管版已支持）
-- 如果自建环境不支持 HNSW，替换为:
--   CREATE INDEX idx_chunks_embedding ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_chunks_embedding ON chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Chunks 常规索引
CREATE INDEX idx_chunks_material_id ON chunks(material_id);
CREATE INDEX idx_chunks_user_id ON chunks(user_id);
CREATE INDEX idx_chunks_topic_id ON chunks(topic_id);
CREATE INDEX idx_chunks_index ON chunks(material_id, chunk_index);

-- Chunks 全文搜索（'simple' 配置支持中英文基础分词）
CREATE INDEX idx_chunks_fts ON chunks
  USING gin(to_tsvector('simple', content));

-- Chunks updated_at 触发器
CREATE TRIGGER set_chunks_updated_at
  BEFORE UPDATE ON chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Chunks RLS
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chunks_select" ON chunks FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "chunks_insert" ON chunks FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "chunks_update" ON chunks FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "chunks_delete" ON chunks FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 3. Cards 表新增字段（向量 + 素材关联）
-- ============================================
ALTER TABLE cards ADD COLUMN IF NOT EXISTS embedding vector(1536);
ALTER TABLE cards ADD COLUMN IF NOT EXISTS embedding_model TEXT DEFAULT 'text-embedding-3-small';
ALTER TABLE cards ADD COLUMN IF NOT EXISTS material_id UUID REFERENCES materials(id) ON DELETE SET NULL;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS chunk_id UUID REFERENCES chunks(id) ON DELETE SET NULL;

-- Cards 向量索引
CREATE INDEX IF NOT EXISTS idx_cards_embedding ON cards
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================
-- 4. Ingestion Jobs 表（异步摄入管道状态追踪）
-- ============================================
CREATE TABLE IF NOT EXISTS ingestion_jobs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,

    status TEXT DEFAULT 'queued'
      CHECK (status IN ('queued', 'extracting', 'chunking', 'embedding', 'completed', 'failed')),
    error_message TEXT,
    progress JSONB DEFAULT '{}'::jsonb,
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

-- Ingestion Jobs RLS
ALTER TABLE ingestion_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ingestion_jobs_select" ON ingestion_jobs FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "ingestion_jobs_insert" ON ingestion_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ingestion_jobs_update" ON ingestion_jobs FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 5. RPC 函数：混合搜索 Chunks（FTS + 向量）
-- ============================================
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
    match_type text
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
    -- 合并去重（同一 chunk 同时命中两种方式时取高分）
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

-- ============================================
-- 6. RPC 函数：向量搜索 Cards
-- ============================================
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
