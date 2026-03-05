-- ============================================
-- Reading Clipper - Reader 高亮与锚定系统
-- Phase 2: highlights 表 + material_id 过滤支持
-- ============================================

-- ============================================
-- 1. Highlights 表（阅读器划线/高亮记录）
-- ============================================
CREATE TABLE IF NOT EXISTS highlights (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    card_id UUID REFERENCES cards(id) ON DELETE SET NULL,

    -- 锚定信息（优先级1：chunk 定位）
    chunk_id UUID REFERENCES chunks(id) ON DELETE SET NULL,
    chunk_relative_start INTEGER,   -- 相对于 chunk 内容的字符起始偏移
    chunk_relative_end INTEGER,     -- 相对于 chunk 内容的字符结束偏移

    -- 锚定信息（优先级2：TextQuote 模糊匹配）
    exact TEXT NOT NULL,            -- 选中的文本
    prefix TEXT,                    -- 前 32 字符（用于模糊定位）
    suffix TEXT,                    -- 后 32 字符（用于模糊定位）

    -- 用户标注
    color TEXT DEFAULT 'yellow',    -- 高亮颜色: yellow | green | blue | pink
    note TEXT,                      -- 批注文字

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_highlights_material ON highlights(material_id);
CREATE INDEX idx_highlights_user ON highlights(user_id);
CREATE INDEX idx_highlights_card ON highlights(card_id) WHERE card_id IS NOT NULL;
CREATE INDEX idx_highlights_chunk ON highlights(chunk_id) WHERE chunk_id IS NOT NULL;

-- updated_at 触发器
CREATE TRIGGER set_highlights_updated_at
  BEFORE UPDATE ON highlights
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE highlights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "highlights_select" ON highlights FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "highlights_insert" ON highlights FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "highlights_update" ON highlights FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "highlights_delete" ON highlights FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 2. 辅助索引（加速 Reader 查询）
-- ============================================
CREATE INDEX IF NOT EXISTS idx_cards_material_id ON cards(material_id);

-- ============================================
-- 3. 升级 search_chunks_hybrid RPC
--    新增 p_material_id 可选过滤参数（null 时不过滤）
-- ============================================
CREATE OR REPLACE FUNCTION search_chunks_hybrid(
    query_text TEXT,
    query_embedding vector(768),
    match_count int DEFAULT 10,
    min_similarity float DEFAULT 0.3,
    p_user_id uuid DEFAULT NULL,
    p_topic_id uuid DEFAULT NULL,
    p_material_id uuid DEFAULT NULL
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
          AND (p_material_id IS NULL OR c.material_id = p_material_id)
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
          AND (p_material_id IS NULL OR c.material_id = p_material_id)
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
