// ========= Task Run Context Builder =========
// Unified context assembly for all phases of a task run.

import { listCards } from '../services/supabase/cards.mjs';
import { getProcessedUrls } from '../services/supabase/tasks.mjs';

/**
 * Build shared context for a task run.
 * Called once at the start of executeRun, shared across all phase handlers.
 */
export async function buildRunContext(supabase, task) {
  const userId = task.user_id;
  const topicId = task.topic_id;
  const taskSpec = task.task_spec || {};

  // Recent cards for dedup (last 30 days by default)
  let recentCards = [];
  if (topicId) {
    try {
      const cards = await listCards(supabase, userId, {
        topic_id: topicId,
        limit: 100,
      });
      recentCards = cards;
    } catch (err) {
      console.warn('[contextBuilder] failed to fetch recent cards:', err.message);
    }
  }

  // Already-processed URLs from previous runs
  let processedUrls = new Set();
  try {
    processedUrls = await getProcessedUrls(supabase, task.id);
  } catch (err) {
    console.warn('[contextBuilder] failed to fetch processed URLs:', err.message);
  }

  // Pending proposals for this task (avoid re-proposing)
  let pendingProposals = [];
  try {
    const { data } = await supabase
      .from('task_proposals')
      .select('title, execution_plan')
      .eq('task_id', task.id)
      .eq('status', 'pending');
    pendingProposals = data || [];
  } catch (err) {
    console.warn('[contextBuilder] failed to fetch pending proposals:', err.message);
  }

  // Topic info
  let topic = null;
  if (topicId) {
    try {
      const { data } = await supabase
        .from('topics')
        .select('id, title, status, research_context')
        .eq('id', topicId)
        .single();
      topic = data;
    } catch {}
  }

  return {
    userId,
    topic,
    recentCards,
    processedUrls,
    pendingProposals,
    scope: taskSpec.scope || {},
    policies: taskSpec.policies || {},
    sourceConfig: taskSpec.source_config || {},
  };
}
