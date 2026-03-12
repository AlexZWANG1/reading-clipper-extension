import express from 'express';
import { supabaseAdmin } from '../../config/supabase.mjs';
import { requireAuth } from '../../middleware/auth.mjs';

const router = express.Router();

const supabase = supabaseAdmin;

// Sidecar config
const SIDECAR_URL = process.env.SIDECAR_URL || 'http://127.0.0.1:8100';
const SIDECAR_API_KEY = process.env.SIDECAR_API_KEY;
if (!SIDECAR_API_KEY) {
  console.warn('[search] SIDECAR_API_KEY not set — sidecar calls will fail');
}

async function searchChunksHybridWithFallback({
  queryEmbedding,
  query,
  limit,
  minScore,
  userId,
  topicId,
  materialId,
}) {
  const baseParams = {
    query_embedding: queryEmbedding,
    query_text: query,
    match_count: limit,
    min_similarity: minScore,
    p_user_id: userId,
    p_topic_id: topicId || null,
  };

  const params = materialId
    ? { ...baseParams, p_material_id: materialId }
    : baseParams;

  const rpcResult = await supabase.rpc('search_chunks_hybrid', params);
  if (!rpcResult.error) {
    return rpcResult;
  }

  // Avoid hard failure when DB has overloaded RPC signatures.
  if (rpcResult.error.code !== 'PGRST203') {
    return rpcResult;
  }

  console.warn('search_chunks_hybrid conflict detected, using fallback query');
  let fallbackQuery = supabase
    .from('chunks')
    .select('id, material_id, content, heading_trail, locator, quote')
    .eq('user_id', userId)
    .ilike('content', `%${query}%`)
    .limit(limit);

  if (topicId) {
    fallbackQuery = fallbackQuery.eq('topic_id', topicId);
  }
  if (materialId) {
    fallbackQuery = fallbackQuery.eq('material_id', materialId);
  }

  const { data, error } = await fallbackQuery;
  if (error) {
    return { data: null, error };
  }

  const normalized = (data || []).map((chunk) => ({
    ...chunk,
    similarity: null,
    match_type: 'fts_fallback',
  }));
  return { data: normalized, error: null };
}

/**
 * POST /v2/search/semantic
 * Semantic search across user's document chunks using vector similarity
 */
router.post('/semantic', requireAuth, async (req, res) => {
  try {
    const { query, limit = 10, min_score = 0.3, topic_id, material_id } = req.body;
    const userId = req.user.id;

    if (!query) {
      return res.status(400).json({ error: 'query required' });
    }

    // 1. Generate query embedding via sidecar
    const embedResponse = await fetch(`${SIDECAR_URL}/embed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sidecar-Key': SIDECAR_API_KEY,
      },
      body: JSON.stringify({ texts: [query] }),
    });

    if (!embedResponse.ok) {
      const errorText = await embedResponse.text();
      console.error('Sidecar embed failed:', errorText);
      return res.status(502).json({ error: 'Failed to generate query embedding' });
    }

    const { embeddings } = await embedResponse.json();
    const queryEmbedding = embeddings[0];

    // 2. Search chunks via Postgres RPC (with fallback for function overload conflicts)
    const { data, error } = await searchChunksHybridWithFallback({
      queryEmbedding,
      query,
      limit,
      minScore: min_score,
      userId,
      topicId: topic_id,
      materialId: material_id,
    });

    if (error) {
      console.error('Search RPC failed:', error);
      return res.status(500).json({ error: 'Search failed' });
    }

    // 3. Enrich results with material metadata
    const materialIds = [...new Set(data.map((c) => c.material_id))];
    const { data: materials } = await supabase
      .from('materials')
      .select('id, title, source_type, url')
      .in('id', materialIds);

    const materialMap = Object.fromEntries(
      materials?.map((m) => [m.id, m]) || []
    );

    const enrichedResults = data.map((chunk) => ({
      ...chunk,
      material: materialMap[chunk.material_id],
    }));

    res.json({
      results: enrichedResults,
      total: data.length,
    });
  } catch (error) {
    console.error('Semantic search error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /v2/search/cards
 * Search cards by embedding (for backward compatibility)
 */
router.post('/cards', requireAuth, async (req, res) => {
  try {
    const { query, limit = 10, min_score = 0.3 } = req.body;
    const userId = req.user.id;

    if (!query) {
      return res.status(400).json({ error: 'query required' });
    }

    // 1. Generate query embedding
    const embedResponse = await fetch(`${SIDECAR_URL}/embed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sidecar-Key': SIDECAR_API_KEY,
      },
      body: JSON.stringify({ texts: [query] }),
    });

    if (!embedResponse.ok) {
      return res.status(502).json({ error: 'Failed to generate query embedding' });
    }

    const { embeddings } = await embedResponse.json();
    const queryEmbedding = embeddings[0];

    // 2. Search cards via RPC
    const { data, error } = await supabase.rpc('search_cards_by_embedding', {
      query_embedding: queryEmbedding,
      match_count: limit,
      min_similarity: min_score,
      p_user_id: userId,
    });

    if (error) {
      console.error('Card search RPC failed:', error);
      return res.status(500).json({ error: 'Search failed' });
    }

    res.json({
      cards: data,
      total: data.length,
    });
  } catch (error) {
    console.error('Card search error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
