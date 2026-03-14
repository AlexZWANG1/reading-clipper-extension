// ========= Research Context & Health Computation =========
// Computes per-topic research state from board structure.
// Pure data computation — NO AI/LLM calls. Should complete in <200ms.

// ── Default Config ──────────────────────────────────

const DEFAULT_METHODOLOGY_CONFIG = {
  bias_warning: { enabled: true, min_support_for_warning: 3, max_oppose_for_warning: 0 },
  evidence_sufficiency: { min_evidence_per_hypothesis: 3 },
};

const STALE_MINUTES = 5;

// ── Public API ──────────────────────────────────────

/**
 * Compute research state for a topic from its board structure.
 * Persists result to topics.research_state and thinking_boards.health_cache.
 *
 * @param {Object} supabase - Supabase client (admin)
 * @param {string} topicId
 * @param {Object|null} methodologyConfig - user's methodology config JSON (structured params)
 * @returns {Object} research state
 */
export async function computeResearchState(supabase, topicId, methodologyConfig) {
  if (!topicId) return {};

  // Find the board for this topic
  const { data: board } = await supabase
    .from('thinking_boards')
    .select('id')
    .eq('topic_id', topicId)
    .maybeSingle();

  if (!board) return {};

  // Load all nodes and edges
  const [{ data: nodes }, { data: edges }] = await Promise.all([
    supabase.from('board_nodes').select('*').eq('board_id', board.id),
    supabase.from('board_edges').select('*').eq('board_id', board.id),
  ]);

  const allNodes = nodes || [];
  const allEdges = edges || [];

  // Use user's methodology config or defaults
  const cfg = { ...DEFAULT_METHODOLOGY_CONFIG, ...methodologyConfig };
  const biasConfig = cfg.bias_warning || DEFAULT_METHODOLOGY_CONFIG.bias_warning;
  const sufficiency = cfg.evidence_sufficiency?.min_evidence_per_hypothesis ?? 3;

  // Categorize nodes
  const questions = allNodes.filter(n => n.node_type === 'question');
  const hypotheses = allNodes.filter(n => n.node_type === 'hypothesis');
  const evidenceNodes = allNodes.filter(n => n.node_type === 'evidence');

  // Per-hypothesis analysis
  const perHypothesis = hypotheses.map(h => {
    // Edges where this hypothesis is source OR target
    const relatedEdges = allEdges.filter(
      e => e.target_node_id === h.id || e.source_node_id === h.id
    );
    const support = relatedEdges.filter(e => e.relation_type === 'supports').length;
    const refute = relatedEdges.filter(e => e.relation_type === 'refutes').length;
    const neutral = relatedEdges.filter(e => e.relation_type === 'neutral').length;
    const total = support + refute + neutral;

    let status = 'no_evidence';
    if (total === 0) {
      status = 'no_evidence';
    } else if (total < sufficiency) {
      status = 'insufficient';
    } else if (
      biasConfig.enabled &&
      support >= (biasConfig.min_support_for_warning || 3) &&
      refute <= (biasConfig.max_oppose_for_warning ?? 0)
    ) {
      status = 'bias_warning';
    } else if (refute > support * 2) {
      status = 'strong_against';
    } else if (support > refute * 2) {
      status = 'strong_support';
    } else {
      status = 'mixed';
    }

    const evidenceCardIds = evidenceNodes
      .filter(e => e.parent_id === h.id && e.card_id)
      .map(e => e.card_id);

    return {
      node_id: h.id,
      text: h.claim || h.content?.text || '',
      support,
      refute,
      neutral,
      total,
      status,
      confidence: h.confidence,
      hypo_state: h.hypo_state,
      evidence_card_ids: evidenceCardIds,
    };
  });

  // Orphan cards (cards in this topic not linked to any evidence node)
  const linkedCardIds = new Set(evidenceNodes.map(e => e.card_id).filter(Boolean));

  const state = {
    hypotheses_summary: perHypothesis,
    total_questions: questions.length,
    total_hypotheses: hypotheses.length,
    total_evidence: evidenceNodes.length,
    blind_spots: perHypothesis.filter(h => h.status === 'bias_warning' || h.status === 'no_evidence').length,
    unanswered_questions: questions.filter(q => q.status === 'open' || !q.status).length,
    linked_card_ids: [...linkedCardIds],
    computed_at: new Date().toISOString(),
  };

  // Persist to DB (fire-and-forget style — don't block the caller)
  try {
    await Promise.all([
      supabase
        .from('topics')
        .update({ research_state: state })
        .eq('id', topicId),
      supabase
        .from('thinking_boards')
        .update({ health_cache: state, health_computed_at: new Date().toISOString() })
        .eq('id', board.id),
    ]);
  } catch (err) {
    console.error('[researchContext] Failed to persist state:', err.message);
  }

  return state;
}

/**
 * Get research state for a topic, recomputing if stale.
 *
 * @param {Object} supabase
 * @param {string} topicId
 * @param {Object|null} methodologyConfig
 * @param {number} maxStaleMinutes - recompute if older than this (default 5)
 * @returns {Object} research state
 */
export async function getResearchState(supabase, topicId, methodologyConfig, maxStaleMinutes = STALE_MINUTES) {
  if (!topicId) return {};

  // Check cached state
  const { data: topic } = await supabase
    .from('topics')
    .select('research_state')
    .eq('id', topicId)
    .maybeSingle();

  const cached = topic?.research_state;
  if (cached && cached.computed_at) {
    const age = (Date.now() - new Date(cached.computed_at).getTime()) / 60000;
    if (age < maxStaleMinutes) return cached;
  }

  // Stale or missing — recompute
  return computeResearchState(supabase, topicId, methodologyConfig);
}

/**
 * Load user's active methodology config from DB.
 *
 * @param {Object} supabase
 * @param {string} userId
 * @returns {Object|null} { document, config, name, base_template }
 */
export async function loadUserMethodology(supabase, userId) {
  const { data } = await supabase
    .from('user_methodologies')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  return data || null;
}

/**
 * Format research state into a readable string for the AI prompt.
 */
export function formatResearchStateForPrompt(state) {
  if (!state || !state.hypotheses_summary?.length) return '';

  const statusLabels = {
    no_evidence: '无证据',
    insufficient: '证据不足',
    bias_warning: '⚠ 偏见警告',
    strong_support: '强支持',
    strong_against: '强反对',
    mixed: '正反兼有',
  };

  const lines = [];
  lines.push(`假说数: ${state.total_hypotheses}, 证据数: ${state.total_evidence}, 盲点: ${state.blind_spots}`);

  for (const h of state.hypotheses_summary) {
    const label = statusLabels[h.status] || h.status;
    lines.push(`- "${h.text}" → ${h.support}支持/${h.refute}反对 [${label}]`);
  }

  if (state.unanswered_questions > 0) {
    lines.push(`\n${state.unanswered_questions} 个问题尚未有假说。`);
  }

  return lines.join('\n');
}
