import express from 'express';
import multer from 'multer';
import { requireAuth } from '../../middleware/auth.mjs';
import { supabaseAdmin } from '../../config/supabase.mjs';
import {
  archiveSubscription,
  createSubscription,
  getItemById,
  getSubscriptionById,
  getSyncState,
  listSubscriptionItems,
  listSubscriptions,
  updateSyncState,
  updateItem,
  updateSubscription,
} from '../../services/supabase/rss.mjs';
import { discoverFeeds } from '../../services/rss/discovery.mjs';
import { buildOpml, parseOpmlText } from '../../services/rss/opml.mjs';
import { RssSyncConflictError, syncSubscription } from '../../services/rss/sync.mjs';
import { clampInt, computeNextScheduledAt, normalizeFeedUrl } from '../../services/rss/utils.mjs';
import { ingestUrl } from '../../services/ingestion.mjs';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(requireAuth);

function toBoolean(value) {
  if (value === undefined) return undefined;
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return undefined;
}

function parseTags(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value).split(',').map((v) => v.trim()).filter(Boolean);
}

function respondError(res, error, fallbackStatus = 500, fallbackCode = 'rss_error') {
  if (error instanceof RssSyncConflictError) {
    return res.status(409).json({ ok: false, error: error.message });
  }

  const message = error?.message || fallbackCode;
  if (message === 'subscription_not_found') {
    return res.status(404).json({ ok: false, error: 'subscription_not_found' });
  }
  if (message === 'invalid_input' || message === 'invalid_website_url' || message.startsWith('invalid_opml')) {
    return res.status(400).json({ ok: false, error: message });
  }

  console.error('[rss] route error:', error);
  return res.status(fallbackStatus).json({ ok: false, error: fallbackCode, detail: message });
}

router.post('/discover', async (req, res) => {
  try {
    const { source_type, value, limit = 10, use_cache = true } = req.body || {};
    if (!source_type || !value) {
      return res.status(400).json({ ok: false, error: 'source_type_and_value_required' });
    }

    const result = await discoverFeeds({
      supabase: req.supabase,
      userId: req.user.id,
      sourceType: source_type,
      value,
      limit,
      useCache: use_cache !== false,
    });

    res.json({
      ok: true,
      source_type,
      normalized_input: result.normalized_input,
      candidates: result.candidates,
      cached: result.cached,
    });
  } catch (error) {
    respondError(res, error, 500, 'discover_failed');
  }
});

router.get('/subscriptions', async (req, res) => {
  try {
    const { status, tags, limit, offset } = req.query;
    const result = await listSubscriptions(req.supabase, req.user.id, {
      status: status || undefined,
      tags: parseTags(tags),
      limit,
      offset,
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    respondError(res, error, 500, 'list_subscriptions_failed');
  }
});

router.get('/subscriptions/:id', async (req, res) => {
  try {
    const subscription = await getSubscriptionById(req.supabase, req.user.id, req.params.id);
    if (!subscription) {
      return res.status(404).json({ ok: false, error: 'subscription_not_found' });
    }
    const syncState = await getSyncState(req.supabase, req.user.id, req.params.id);
    res.json({ ok: true, subscription, sync_state: syncState });
  } catch (error) {
    respondError(res, error, 500, 'get_subscription_failed');
  }
});

router.post('/subscriptions', async (req, res) => {
  try {
    const {
      source_id,
      title,
      site_url,
      feed_url,
      description,
      language,
      region,
      tags,
      status,
      poll_interval_minutes,
      sync_on_create = false,
    } = req.body || {};

    const normalizedFeedUrl = normalizeFeedUrl(feed_url);
    if (!normalizedFeedUrl) {
      return res.status(400).json({ ok: false, error: 'invalid_feed_url' });
    }

    if (source_id) {
      const { data: source, error: sourceErr } = await req.supabase
        .from('sources')
        .select('id')
        .eq('id', source_id)
        .eq('user_id', req.user.id)
        .maybeSingle();
      if (sourceErr || !source) {
        return res.status(404).json({ ok: false, error: 'source_not_found' });
      }
    }

    let finalTitle = title?.trim();
    let finalDescription = description || null;
    let finalSiteUrl = site_url || null;
    let finalLanguage = language || null;

    if (!finalTitle) {
      const discovery = await discoverFeeds({
        supabase: req.supabase,
        userId: req.user.id,
        sourceType: 'feed_url',
        value: normalizedFeedUrl,
        limit: 1,
        useCache: false,
      }).catch(() => ({ candidates: [] }));

      const candidate = discovery?.candidates?.[0];
      finalTitle = candidate?.title || normalizedFeedUrl;
      finalDescription = finalDescription || candidate?.description || null;
      finalSiteUrl = finalSiteUrl || candidate?.site_url || null;
      finalLanguage = finalLanguage || candidate?.language || null;
    }

    const result = await createSubscription(req.supabase, req.user.id, {
      source_id: source_id || null,
      title: finalTitle,
      site_url: finalSiteUrl,
      feed_url: normalizedFeedUrl,
      feed_url_normalized: normalizedFeedUrl,
      description: finalDescription,
      language: finalLanguage,
      region: region || null,
      tags: parseTags(tags),
      status: status || 'active',
      poll_interval_minutes: clampInt(poll_interval_minutes, {
        min: 5,
        max: 1440,
        fallback: 60,
      }),
    });

    let syncResult = null;
    if (sync_on_create) {
      syncResult = await syncSubscription({
        supabase: req.supabase,
        userId: req.user.id,
        subscriptionId: result.subscription.id,
        force: true,
      });
    }

    res.json({
      ok: true,
      subscription: result.subscription,
      created: result.created,
      sync_result: syncResult,
    });
  } catch (error) {
    respondError(res, error, 500, 'create_subscription_failed');
  }
});

router.patch('/subscriptions/:id', async (req, res) => {
  try {
    const allowedFields = [
      'source_id',
      'title',
      'site_url',
      'description',
      'language',
      'region',
      'status',
      'poll_interval_minutes',
      'tags',
    ];
    const updates = {};
    for (const key of allowedFields) {
      if (req.body?.[key] !== undefined) updates[key] = req.body[key];
    }

    if (req.body?.feed_url !== undefined) {
      const normalizedFeedUrl = normalizeFeedUrl(req.body.feed_url);
      if (!normalizedFeedUrl) {
        return res.status(400).json({ ok: false, error: 'invalid_feed_url' });
      }
      updates.feed_url = normalizedFeedUrl;
      updates.feed_url_normalized = normalizedFeedUrl;
    }

    if (updates.tags !== undefined) {
      updates.tags = parseTags(updates.tags);
    }
    if (updates.poll_interval_minutes !== undefined) {
      updates.poll_interval_minutes = clampInt(updates.poll_interval_minutes, {
        min: 5,
        max: 1440,
        fallback: 60,
      });
    }

    const updated = await updateSubscription(req.supabase, req.user.id, req.params.id, updates);
    if (!updated) {
      return res.status(404).json({ ok: false, error: 'subscription_not_found' });
    }

    if (updates.poll_interval_minutes !== undefined) {
      const syncState = await getSyncState(req.supabase, req.user.id, req.params.id);
      if (syncState) {
        const nextScheduledAt = computeNextScheduledAt({
          pollIntervalMinutes: updates.poll_interval_minutes,
          consecutiveFailures: syncState.consecutive_failures || 0,
        });
        await updateSyncState(req.supabase, req.user.id, req.params.id, {
          next_scheduled_at: nextScheduledAt,
        });
      }
    }

    res.json({ ok: true, subscription: updated });
  } catch (error) {
    respondError(res, error, 500, 'update_subscription_failed');
  }
});

router.delete('/subscriptions/:id', async (req, res) => {
  try {
    const deleted = await archiveSubscription(req.supabase, req.user.id, req.params.id);
    if (!deleted) {
      return res.status(404).json({ ok: false, error: 'subscription_not_found' });
    }
    res.json({ ok: true, deleted: true });
  } catch (error) {
    respondError(res, error, 500, 'delete_subscription_failed');
  }
});

router.post('/subscriptions/:id/sync', async (req, res) => {
  try {
    const { force = true, limit } = req.body || {};
    const result = await syncSubscription({
      supabase: req.supabase,
      userId: req.user.id,
      subscriptionId: req.params.id,
      force: force !== false,
      maxItems: clampInt(limit, { min: 1, max: 300, fallback: 120 }),
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    respondError(res, error, 500, 'sync_subscription_failed');
  }
});

router.get('/subscriptions/:id/items', async (req, res) => {
  try {
    const subscription = await getSubscriptionById(req.supabase, req.user.id, req.params.id);
    if (!subscription) {
      return res.status(404).json({ ok: false, error: 'subscription_not_found' });
    }

    const result = await listSubscriptionItems(req.supabase, req.user.id, req.params.id, {
      unread: toBoolean(req.query.unread),
      starred: toBoolean(req.query.starred),
      imported: toBoolean(req.query.imported),
      limit: req.query.limit,
      offset: req.query.offset,
    });

    res.json({ ok: true, subscription, ...result });
  } catch (error) {
    respondError(res, error, 500, 'list_items_failed');
  }
});

router.patch('/items/:id', async (req, res) => {
  try {
    const updates = {};
    if (req.body?.is_read !== undefined) updates.is_read = !!req.body.is_read;
    if (req.body?.is_starred !== undefined) updates.is_starred = !!req.body.is_starred;

    if (!Object.keys(updates).length) {
      return res.status(400).json({ ok: false, error: 'no_valid_updates' });
    }

    const item = await updateItem(req.supabase, req.user.id, req.params.id, updates);
    if (!item) {
      return res.status(404).json({ ok: false, error: 'item_not_found' });
    }
    res.json({ ok: true, item });
  } catch (error) {
    respondError(res, error, 500, 'update_item_failed');
  }
});

router.post('/items/:id/import-to-materials', async (req, res) => {
  try {
    const { topic_id } = req.body || {};
    const item = await getItemById(req.supabase, req.user.id, req.params.id);
    if (!item) {
      return res.status(404).json({ ok: false, error: 'item_not_found' });
    }
    if (!item.url) {
      return res.status(400).json({ ok: false, error: 'item_url_missing' });
    }

    if (item.imported_material_id) {
      return res.json({
        ok: true,
        item_id: item.id,
        material_id: item.imported_material_id,
        already_imported: true,
        ingestion_status: 'pending',
      });
    }

    const ingestResult = await ingestUrl(supabaseAdmin, req.user.id, {
      url: item.url,
      title: item.title || undefined,
      topic_id: topic_id || null,
    });

    const updatedItem = await updateItem(req.supabase, req.user.id, item.id, {
      imported_material_id: ingestResult.material_id,
      is_read: true,
    });

    res.json({
      ok: true,
      item_id: item.id,
      material_id: ingestResult.material_id,
      already_imported: false,
      ingestion_status: ingestResult.status || 'pending',
      item: updatedItem,
    });
  } catch (error) {
    respondError(res, error, 500, 'import_to_materials_failed');
  }
});

router.post('/import-opml', upload.single('file'), async (req, res) => {
  try {
    const opmlText = req.body?.opml_text
      || (req.file ? req.file.buffer.toString('utf-8') : null);

    if (!opmlText) {
      return res.status(400).json({ ok: false, error: 'opml_input_required' });
    }

    const candidates = parseOpmlText(opmlText);
    let imported = 0;
    let duplicates = 0;
    let failed = 0;
    const errors = [];

    for (const candidate of candidates) {
      try {
        const result = await createSubscription(req.supabase, req.user.id, {
          source_id: null,
          title: candidate.title || candidate.feed_url,
          site_url: candidate.site_url,
          feed_url: candidate.feed_url,
          feed_url_normalized: candidate.feed_url,
          description: candidate.description || null,
          language: null,
          region: null,
          tags: candidate.tags || [],
          status: 'active',
          poll_interval_minutes: 60,
        });
        if (result.created) imported += 1;
        else duplicates += 1;
      } catch (error) {
        failed += 1;
        errors.push({
          feed_url: candidate.feed_url,
          error: error.message,
        });
      }
    }

    res.json({
      ok: true,
      total: candidates.length,
      imported,
      skipped: duplicates,
      duplicates,
      failed,
      errors,
    });
  } catch (error) {
    respondError(res, error, 500, 'import_opml_failed');
  }
});

router.get('/export-opml', async (req, res) => {
  try {
    const { subscriptions } = await listSubscriptions(req.supabase, req.user.id, {
      status: req.query.status || undefined,
      limit: 10000,
      offset: 0,
    });

    const xml = buildOpml(subscriptions);
    res.setHeader('Content-Type', 'text/x-opml; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="verity-rss-subscriptions.opml"');
    res.send(xml);
  } catch (error) {
    respondError(res, error, 500, 'export_opml_failed');
  }
});

export default router;
