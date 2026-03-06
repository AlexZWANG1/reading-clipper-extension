-- ============================================
-- Fix: remove overloaded search_chunks_hybrid signature conflict
-- ============================================

-- PostgREST RPC resolves overloaded functions poorly when one signature
-- can be satisfied by defaults in another. Keep only one canonical
-- search_chunks_hybrid signature with optional p_material_id.

DROP FUNCTION IF EXISTS public.search_chunks_hybrid(
    query_text TEXT,
    query_embedding vector,
    match_count int,
    min_similarity float,
    p_user_id uuid,
    p_topic_id uuid
);

CREATE OR REPLACE FUNCTION public.search_chunks_hybrid(
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
    vec_results AS (
        SELECT
            c.id,
            c.material_id,
            c.content,
            c.heading_trail,
            c.locator,
            c.quote,
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
    fts_results AS (
        SELECT
            c.id,
            c.material_id,
            c.content,
            c.heading_trail,
            c.locator,
            c.quote,
            ts_rank(
                to_tsvector('simple', c.content),
                plainto_tsquery('simple', query_text)
            )::float AS sim,
            'fts'::text AS mtype
        FROM chunks c
        WHERE (p_user_id IS NULL OR c.user_id = p_user_id)
          AND (p_topic_id IS NULL OR c.topic_id = p_topic_id)
          AND (p_material_id IS NULL OR c.material_id = p_material_id)
          AND to_tsvector('simple', c.content) @@ plainto_tsquery('simple', query_text)
        ORDER BY sim DESC
        LIMIT match_count
    ),
    combined AS (
        SELECT DISTINCT ON (r.id) r.*
        FROM (
            SELECT * FROM vec_results
            UNION ALL
            SELECT * FROM fts_results
        ) r
        ORDER BY r.id, r.sim DESC
    )
    SELECT
        combined.id,
        combined.material_id,
        combined.content,
        combined.heading_trail,
        combined.locator,
        combined.quote,
        combined.sim AS similarity,
        combined.mtype AS match_type
    FROM combined
    ORDER BY combined.sim DESC
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;
