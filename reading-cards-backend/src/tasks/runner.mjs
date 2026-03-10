// ========= Task Runner =========
// Executes a task run: collect → filter → materialize → cardify.

import {
  createRun, updateRun,
  createStep, updateStep,
  acquireTaskLock, releaseTaskLock, incrementRunCount,
} from '../services/supabase/tasks.mjs';
import { buildRunContext } from './contextBuilder.mjs';
import { fetchRssItems } from './fetchers/rss.mjs';
import { ingestUrl } from '../services/ingestion.mjs';
import { createAIClientConfig, callChatAPI } from '../services/aiClient.mjs';
import { addCard } from '../services/supabase/cards.mjs';

/**
 * Execute a full task run.
 * @param {string} taskId
 * @param {Object} task - Full task object
 * @param {Object} supabase - Service-role Supabase client
 */
export async function executeRun(taskId, task, supabase) {
  const userId = task.user_id;
  const taskSpec = task.task_spec || {};
  const phases = taskSpec.phases || ['collect', 'filter', 'materialize', 'cardify'];

  // 1. Create run record first (need its ID for lock)
  const run = await createRun(supabase, userId, taskId);

  // 2. Acquire lock (CAS: only if not already running)
  const locked = await acquireTaskLock(supabase, taskId, run.id);
  if (!locked) {
    await updateRun(supabase, run.id, {
      status: 'failed',
      error: 'Task is already running',
      completed_at: new Date().toISOString(),
    });
    throw new Error('Task is already running');
  }

  const results = {
    items_fetched: 0,
    items_filtered: 0,
    materials_created: 0,
    cards_created: 0,
    proposals_created: 0,
    processed_urls: [],
  };

  try {
    // Build shared context
    const ctx = await buildRunContext(supabase, task);

    let stepIndex = 0;
    let collectedItems = [];
    let filteredItems = [];
    let materializedItems = [];

    // ── Phase: collect ──
    if (phases.includes('collect')) {
      const step = await createStep(supabase, userId, run.id, {
        step_index: stepIndex++,
        phase: 'collect',
        input_summary: `RSS feeds: ${(ctx.sourceConfig.rss_feeds || []).length}`,
      });

      try {
        const feeds = ctx.sourceConfig.rss_feeds || [];
        const maxItems = ctx.sourceConfig.max_items_per_run || 20;

        collectedItems = await fetchRssItems(feeds, {
          maxItems,
          processedUrls: ctx.processedUrls,
        });

        results.items_fetched = collectedItems.length;

        await updateStep(supabase, step.id, {
          status: 'completed',
          output_summary: `Fetched ${collectedItems.length} items`,
          detail: { count: collectedItems.length },
          completed_at: new Date().toISOString(),
        });
      } catch (err) {
        await updateStep(supabase, step.id, {
          status: 'failed',
          error: err.message,
          completed_at: new Date().toISOString(),
        });
        throw err;
      }
    }

    // ── Phase: filter ──
    if (phases.includes('filter') && collectedItems.length > 0) {
      const step = await createStep(supabase, userId, run.id, {
        step_index: stepIndex++,
        phase: 'filter',
        input_summary: `${collectedItems.length} items to filter`,
      });

      try {
        filteredItems = await filterItems(collectedItems, ctx);
        results.items_filtered = filteredItems.length;

        await updateStep(supabase, step.id, {
          status: 'completed',
          output_summary: `${filteredItems.length} of ${collectedItems.length} relevant`,
          detail: { passed: filteredItems.length, total: collectedItems.length },
          completed_at: new Date().toISOString(),
        });
      } catch (err) {
        // Filter failure is non-fatal: use all collected items
        filteredItems = collectedItems;
        results.items_filtered = filteredItems.length;

        await updateStep(supabase, step.id, {
          status: 'completed',
          output_summary: `Filter failed, using all ${collectedItems.length} items`,
          error: err.message,
          completed_at: new Date().toISOString(),
        });
      }
    }

    // ── Phase: materialize ──
    // Limit to top 5 items per run to avoid timeouts
    const itemsToProcess = filteredItems.slice(0, 5);

    if (phases.includes('materialize') && itemsToProcess.length > 0) {
      const step = await createStep(supabase, userId, run.id, {
        step_index: stepIndex++,
        phase: 'materialize',
        input_summary: `${itemsToProcess.length} items to ingest (of ${filteredItems.length} filtered)`,
      });

      try {
        const materialIds = [];
        for (const item of itemsToProcess) {
          try {
            const result = await ingestUrl(supabase, userId, {
              url: item.url,
              title: item.title,
              topic_id: task.topic_id,
            });
            materialIds.push(result.material_id);
            results.processed_urls.push(item.url);
            materializedItems.push({ ...item, material_id: result.material_id });
          } catch (err) {
            console.warn(`[runner] materialize failed for ${item.url}:`, err.message);
          }
        }
        results.materials_created = materialIds.length;

        await updateStep(supabase, step.id, {
          status: 'completed',
          output_summary: `Created ${materialIds.length} materials`,
          detail: { material_ids: materialIds },
          completed_at: new Date().toISOString(),
        });
      } catch (err) {
        await updateStep(supabase, step.id, {
          status: 'failed',
          error: err.message,
          completed_at: new Date().toISOString(),
        });
        throw err;
      }
    }

    // ── Phase: cardify ──
    if (phases.includes('cardify') && itemsToProcess.length > 0) {
      const step = await createStep(supabase, userId, run.id, {
        step_index: stepIndex++,
        phase: 'cardify',
        input_summary: `${itemsToProcess.length} items to create cards for`,
      });

      try {
        const cardIds = [];
        const topicTitle = ctx.topic?.title || task.title;

        for (const item of itemsToProcess) {
          try {
            const cardData = await Promise.race([
              generateCardData(item, ctx),
              new Promise((_, reject) => setTimeout(() => reject(new Error('AI timeout')), 30000)),
            ]);
            const card = await addCard(supabase, userId, {
              topic_title: topicTitle,
              topic_id: task.topic_id,
              title: cardData.title,
              summary: cardData.summary,
              key_points: cardData.key_points || [],
              source_name: item.feedTitle || item.title,
              source_url: item.url,
              fact_or_view: 'fact',
              material_id: item.material_id || null,
            });
            cardIds.push(card.id);
          } catch (err) {
            console.warn(`[runner] cardify failed for ${item.url}:`, err.message);
          }
        }
        results.cards_created = cardIds.length;

        await updateStep(supabase, step.id, {
          status: 'completed',
          output_summary: `Created ${cardIds.length} cards`,
          detail: { card_ids: cardIds },
          completed_at: new Date().toISOString(),
        });
      } catch (err) {
        await updateStep(supabase, step.id, {
          status: 'failed',
          error: err.message,
          completed_at: new Date().toISOString(),
        });
        throw err;
      }
    }

    // ── Phase: synthesize (Phase 1: skip) ──
    if (phases.includes('synthesize')) {
      await createStep(supabase, userId, run.id, {
        step_index: stepIndex++,
        phase: 'synthesize',
        input_summary: 'Skipped in Phase 1',
      }).then((step) =>
        updateStep(supabase, step.id, {
          status: 'skipped',
          output_summary: 'Synthesize phase not yet implemented',
          completed_at: new Date().toISOString(),
        })
      );
    }

    // Finalize run
    await updateRun(supabase, run.id, {
      status: results.proposals_created > 0 ? 'completed_with_proposals' : 'completed',
      results,
      completed_at: new Date().toISOString(),
    });
  } catch (err) {
    await updateRun(supabase, run.id, {
      status: 'failed',
      error: err.message,
      results,
      completed_at: new Date().toISOString(),
    });
  } finally {
    await releaseTaskLock(supabase, taskId);
    await incrementRunCount(supabase, taskId);
  }

  return run;
}

/**
 * Filter items using AI to check relevance to the task scope.
 */
async function filterItems(items, ctx) {
  if (items.length === 0) return [];

  const keywords = ctx.scope.keywords || [];
  if (keywords.length === 0) return items;

  // Simple keyword-based pre-filter first
  const keywordFiltered = items.filter((item) => {
    const text = `${item.title} ${item.summary}`.toLowerCase();
    return keywords.some((kw) => text.includes(kw.toLowerCase()));
  });

  // If keyword filter is too aggressive (< 2 items), use AI filter
  if (keywordFiltered.length >= 2) return keywordFiltered;

  try {
    const aiConfig = await createAIClientConfig();
    const itemList = items
      .map((item, i) => `[${i}] ${item.title}\n${item.summary?.slice(0, 200) || ''}`)
      .join('\n\n');

    const messages = [
      {
        role: 'system',
        content: `You are a research relevance filter. Given a list of items and research keywords, return the indices of relevant items as a JSON array of numbers. Only include items that are directly relevant to the research topic.`,
      },
      {
        role: 'user',
        content: `Keywords: ${keywords.join(', ')}\n\nItems:\n${itemList}`,
      },
    ];

    const response = await callChatAPI(aiConfig, messages, {
      temperature: 0,
      response_format: { type: 'json_object' },
    });

    const content = response.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);
    const indices = parsed.indices || parsed.relevant_indices || parsed;

    if (Array.isArray(indices)) {
      return indices
        .filter((i) => typeof i === 'number' && i >= 0 && i < items.length)
        .map((i) => items[i]);
    }
  } catch (err) {
    console.warn('[runner] AI filter failed:', err.message);
  }

  // Fallback: return keyword filtered or all items
  return keywordFiltered.length > 0 ? keywordFiltered : items;
}

/**
 * Generate card data from an RSS item using AI.
 */
async function generateCardData(item, ctx) {
  try {
    const aiConfig = await createAIClientConfig();
    const messages = [
      {
        role: 'system',
        content: `Generate a concise reading card from this article. Return JSON with: title (short, 3-8 words), summary (1-3 sentences), key_points (2-5 bullet strings). Output JSON only.`,
      },
      {
        role: 'user',
        content: `Title: ${item.title}\nURL: ${item.url}\nContent: ${item.summary?.slice(0, 1000) || 'No content available'}`,
      },
    ];

    const response = await callChatAPI(aiConfig, messages, {
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const content = response.choices?.[0]?.message?.content;
    return JSON.parse(content);
  } catch {
    // Fallback: use item data directly
    return {
      title: item.title?.slice(0, 60) || 'Untitled',
      summary: item.summary?.slice(0, 200) || item.title || '',
      key_points: [],
    };
  }
}
