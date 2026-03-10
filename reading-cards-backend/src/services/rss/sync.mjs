import Parser from 'rss-parser';
import {
  getSubscriptionById,
  getSyncState,
  updateSubscription,
  updateSyncState,
} from '../supabase/rss.mjs';
import {
  buildItemGuid,
  computeNextScheduledAt,
  hashText,
  normalizeFeedUrl,
  normalizeUrl,
  parsePublishedAt,
} from './utils.mjs';

const parser = new Parser({
  timeout: 20000,
  headers: {
    'User-Agent': 'Verity/1.0 RSS Sync',
  },
});

const syncLocks = new Set();

export class RssSyncConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RssSyncConflictError';
    this.status = 409;
  }
}

function normalizeSummary(item) {
  return (
    item?.contentSnippet ||
    item?.summary ||
    item?.content ||
    item?.description ||
    null
  );
}

function normalizeContentHtml(item) {
  return (
    item?.['content:encoded'] ||
    item?.content ||
    null
  );
}

function buildPreparedItem(item, subscription, userId) {
  const normalizedUrl = normalizeUrl(item?.link || item?.url || item?.id || item?.guid);
  const guid = buildItemGuid(item, normalizedUrl);
  const title = (item?.title || normalizedUrl || guid || 'Untitled').trim().slice(0, 1000);
  const publishedAt = parsePublishedAt(item?.isoDate || item?.pubDate || item?.published);

  return {
    subscription_id: subscription.id,
    user_id: userId,
    guid,
    title,
    url: normalizedUrl,
    url_hash: normalizedUrl ? hashText(normalizedUrl) : null,
    author: item?.creator || item?.author || item?.dcCreator || null,
    published_at: publishedAt,
    summary: normalizeSummary(item),
    content_html: normalizeContentHtml(item),
    raw_payload: item || {},
  };
}

async function insertRssItem(supabase, payload) {
  const { error } = await supabase
    .from('rss_items')
    .insert(payload);

  if (error) {
    if (error.code === '23505') return { inserted: false, duplicate: true };
    throw new Error(`Failed to insert rss item: ${error.message}`);
  }
  return { inserted: true, duplicate: false };
}

async function loadFeedWithHttp(feedUrl, syncState) {
  const headers = {
    'User-Agent': 'Verity/1.0 RSS Sync',
    Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
  };
  if (syncState?.last_etag) headers['If-None-Match'] = syncState.last_etag;
  if (syncState?.last_modified) headers['If-Modified-Since'] = syncState.last_modified;

  const response = await fetch(feedUrl, {
    headers,
    signal: AbortSignal.timeout(20000),
  });

  return response;
}

async function markSyncFailure({
  supabase,
  userId,
  subscription,
  syncState,
  errorMessage,
}) {
  const now = new Date().toISOString();
  const failures = (syncState?.consecutive_failures || 0) + 1;
  const nextScheduledAt = computeNextScheduledAt({
    pollIntervalMinutes: subscription.poll_interval_minutes,
    consecutiveFailures: failures,
    now: new Date(),
  });

  await updateSyncState(supabase, userId, subscription.id, {
    last_failure_at: now,
    consecutive_failures: failures,
    next_scheduled_at: nextScheduledAt,
  });

  await updateSubscription(supabase, userId, subscription.id, {
    last_checked_at: now,
    last_error: errorMessage?.slice(0, 2000) || 'sync_failed',
  });
}

export async function syncSubscription({
  supabase,
  userId,
  subscriptionId,
  force = false,
  maxItems = 120,
}) {
  if (syncLocks.has(subscriptionId)) {
    throw new RssSyncConflictError('subscription_sync_in_progress');
  }
  syncLocks.add(subscriptionId);

  const startedAt = Date.now();
  let subscription = null;
  let syncState = null;

  try {
    subscription = await getSubscriptionById(supabase, userId, subscriptionId);
    if (!subscription) {
      throw new Error('subscription_not_found');
    }

    if (subscription.status !== 'active' && !force) {
      return {
        ok: true,
        subscription_id: subscriptionId,
        skipped: true,
        reason: 'subscription_not_active',
        fetched: 0,
        inserted: 0,
        updated: 0,
        failed: 0,
        duration_ms: Date.now() - startedAt,
      };
    }

    syncState = await getSyncState(supabase, userId, subscriptionId);
    const now = new Date();
    const nowIso = now.toISOString();

    if (
      !force &&
      syncState?.next_scheduled_at &&
      new Date(syncState.next_scheduled_at).getTime() > now.getTime()
    ) {
      return {
        ok: true,
        subscription_id: subscriptionId,
        skipped: true,
        reason: 'not_due',
        fetched: 0,
        inserted: 0,
        updated: 0,
        failed: 0,
        duration_ms: Date.now() - startedAt,
      };
    }

    await updateSubscription(supabase, userId, subscriptionId, {
      last_checked_at: nowIso,
      last_error: null,
    });

    const response = await loadFeedWithHttp(subscription.feed_url, syncState);
    if (response.status === 304) {
      const nextScheduledAt = computeNextScheduledAt({
        pollIntervalMinutes: subscription.poll_interval_minutes,
        consecutiveFailures: 0,
        now,
      });

      await updateSyncState(supabase, userId, subscriptionId, {
        last_success_at: nowIso,
        consecutive_failures: 0,
        next_scheduled_at: nextScheduledAt,
      });

      await updateSubscription(supabase, userId, subscriptionId, {
        last_synced_at: nowIso,
        last_error: null,
      });

      return {
        ok: true,
        subscription_id: subscriptionId,
        skipped: false,
        reason: 'not_modified',
        fetched: 0,
        inserted: 0,
        updated: 0,
        failed: 0,
        next_scheduled_at: nextScheduledAt,
        duration_ms: Date.now() - startedAt,
      };
    }

    if (!response.ok) {
      throw new Error(`feed_fetch_failed_${response.status}`);
    }

    const etag = response.headers.get('etag') || null;
    const lastModified = response.headers.get('last-modified') || null;
    const xml = await response.text();
    const parsedFeed = await parser.parseString(xml);

    const feedItems = Array.isArray(parsedFeed?.items) ? parsedFeed.items : [];
    const limitedItems = feedItems.slice(0, Math.max(1, Math.min(maxItems, 300)));
    let inserted = 0;
    let skipped = 0;
    let failed = 0;

    for (const item of limitedItems) {
      try {
        const payload = buildPreparedItem(item, subscription, userId);
        const result = await insertRssItem(supabase, payload);
        if (result.inserted) inserted += 1;
        else skipped += 1;
      } catch (err) {
        failed += 1;
        console.warn(`[rss-sync] item insert failed: ${err.message}`);
      }
    }

    const nextScheduledAt = computeNextScheduledAt({
      pollIntervalMinutes: subscription.poll_interval_minutes,
      consecutiveFailures: 0,
      now,
    });

    await updateSyncState(supabase, userId, subscriptionId, {
      last_etag: etag,
      last_modified: lastModified,
      last_success_at: nowIso,
      consecutive_failures: 0,
      next_scheduled_at: nextScheduledAt,
    });

    const updatedSubscriptionPayload = {
      last_synced_at: nowIso,
      last_error: null,
    };

    if (!subscription.title && parsedFeed?.title) {
      updatedSubscriptionPayload.title = parsedFeed.title;
    }
    if (!subscription.description && parsedFeed?.description) {
      updatedSubscriptionPayload.description = parsedFeed.description;
    }
    if (!subscription.site_url && parsedFeed?.link) {
      updatedSubscriptionPayload.site_url = normalizeUrl(parsedFeed.link);
    }
    if (!subscription.language && parsedFeed?.language) {
      updatedSubscriptionPayload.language = parsedFeed.language;
    }

    await updateSubscription(supabase, userId, subscriptionId, updatedSubscriptionPayload);

    return {
      ok: true,
      subscription_id: subscriptionId,
      fetched: limitedItems.length,
      inserted,
      updated: 0,
      skipped,
      failed,
      next_scheduled_at: nextScheduledAt,
      duration_ms: Date.now() - startedAt,
    };
  } catch (error) {
    const message = error?.message || 'sync_failed';
    if (subscription) {
      try {
        await markSyncFailure({
          supabase,
          userId,
          subscription,
          syncState,
          errorMessage: message,
        });
      } catch (markError) {
        console.error('[rss-sync] failed to mark failure:', markError.message);
      }
    }
    throw error;
  } finally {
    syncLocks.delete(subscriptionId);
  }
}

export async function forceSyncIfUrlChanged({
  supabase,
  userId,
  subscriptionId,
  nextFeedUrl,
}) {
  const normalized = normalizeFeedUrl(nextFeedUrl);
  if (!normalized) return;

  await updateSubscription(supabase, userId, subscriptionId, {
    feed_url: normalized,
    feed_url_normalized: normalized,
  });
}
