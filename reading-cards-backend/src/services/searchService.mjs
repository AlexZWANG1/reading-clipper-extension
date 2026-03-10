// ========= Search Service =========
// Extracted from routes/v2/search.mjs for direct use by toolExecutor and task runner.

const SIDECAR_URL = process.env.SIDECAR_URL || 'http://127.0.0.1:8100';
const SIDECAR_API_KEY = process.env.SIDECAR_API_KEY || 'rc-sidecar-2026';

/**
 * Semantic search across user's document chunks.
 * @param {Object} supabase - Supabase client (service-role or user-scoped)
 * @param {string} userId
 * @param {string} query
 * @param {Object} opts - { limit?, min_score?, topic_id?, material_id? }
 * @returns {{ results: Array, total: number }}
 */
export async function searchSemantic(supabase, userId, query, opts = {}) {
  const limit = Math.min(opts.limit || 10, 20);
  const minScore = opts.min_score || 0.3;

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
    throw new Error('Failed to generate query embedding');
  }

  const { embeddings } = await embedResponse.json();
  const queryEmbedding = embeddings[0];

  // 2. Search via RPC
  const params = {
    query_embedding: queryEmbedding,
    query_text: query,
    match_count: limit,
    min_similarity: minScore,
    p_user_id: userId,
    p_topic_id: opts.topic_id || null,
  };

  if (opts.material_id) {
    params.p_material_id = opts.material_id;
  }

  let { data, error } = await supabase.rpc('search_chunks_hybrid', params);

  // Fallback for RPC overload conflicts
  if (error?.code === 'PGRST203') {
    console.warn('search_chunks_hybrid conflict, using fallback');
    let fallbackQuery = supabase
      .from('chunks')
      .select('id, material_id, content, heading_trail, locator, quote')
      .eq('user_id', userId)
      .ilike('content', `%${query}%`)
      .limit(limit);

    if (opts.topic_id) fallbackQuery = fallbackQuery.eq('topic_id', opts.topic_id);
    if (opts.material_id) fallbackQuery = fallbackQuery.eq('material_id', opts.material_id);

    const result = await fallbackQuery;
    if (result.error) throw new Error(`Search failed: ${result.error.message}`);
    data = (result.data || []).map((chunk) => ({
      ...chunk,
      similarity: null,
      match_type: 'fts_fallback',
    }));
  } else if (error) {
    throw new Error(`Search failed: ${error.message}`);
  }

  // 3. Enrich with material metadata
  const materialIds = [...new Set((data || []).map((c) => c.material_id))];
  let materialMap = {};
  if (materialIds.length > 0) {
    const { data: materials } = await supabase
      .from('materials')
      .select('id, title, source_type, url')
      .in('id', materialIds);
    materialMap = Object.fromEntries((materials || []).map((m) => [m.id, m]));
  }

  const results = (data || []).map((chunk) => ({
    ...chunk,
    material: materialMap[chunk.material_id],
  }));

  return { results, total: results.length };
}
