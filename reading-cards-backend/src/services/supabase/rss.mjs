import { computeNextScheduledAt } from '../rss/utils.mjs';

export async function listSubscriptions(supabase, userId, filters = {}) {
  const limit = Math.min(Number.parseInt(filters.limit || 50, 10), 200);
  const offset = Math.max(Number.parseInt(filters.offset || 0, 10), 0);

  let query = supabase
    .from('rss_subscriptions')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  if (filters.tags?.length) {
    query = query.overlaps('tags', filters.tags);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to list subscriptions: ${error.message}`);
  return { subscriptions: data || [], total: count || 0, limit, offset };
}

export async function getSubscriptionById(supabase, userId, subscriptionId) {
  const { data, error } = await supabase
    .from('rss_subscriptions')
    .select('*')
    .eq('id', subscriptionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`Failed to get subscription: ${error.message}`);
  return data || null;
}

export async function createSubscription(supabase, userId, data) {
  const { data: existing, error: existingError } = await supabase
    .from('rss_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('feed_url_normalized', data.feed_url_normalized)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to check existing subscription: ${existingError.message}`);
  }

  if (existing) {
    await ensureSyncState(supabase, userId, existing.id, existing.poll_interval_minutes);
    return { subscription: existing, created: false };
  }

  const payload = {
    user_id: userId,
    source_id: data.source_id || null,
    title: data.title,
    site_url: data.site_url || null,
    feed_url: data.feed_url,
    feed_url_normalized: data.feed_url_normalized,
    description: data.description || null,
    language: data.language || null,
    region: data.region || null,
    tags: data.tags || [],
    status: data.status || 'active',
    poll_interval_minutes: data.poll_interval_minutes || 60,
  };

  const { data: inserted, error } = await supabase
    .from('rss_subscriptions')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      const { data: raceExisting } = await supabase
        .from('rss_subscriptions')
        .select('*')
        .eq('user_id', userId)
        .eq('feed_url_normalized', data.feed_url_normalized)
        .maybeSingle();
      if (raceExisting) {
        await ensureSyncState(supabase, userId, raceExisting.id, raceExisting.poll_interval_minutes);
        return { subscription: raceExisting, created: false };
      }
    }
    throw new Error(`Failed to create subscription: ${error.message}`);
  }

  await ensureSyncState(supabase, userId, inserted.id, inserted.poll_interval_minutes);
  return { subscription: inserted, created: true };
}

export async function updateSubscription(supabase, userId, subscriptionId, updates) {
  const { data, error } = await supabase
    .from('rss_subscriptions')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', subscriptionId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(`Failed to update subscription: ${error.message}`);
  return data || null;
}

export async function archiveSubscription(supabase, userId, subscriptionId) {
  const { data, error } = await supabase
    .from('rss_subscriptions')
    .update({
      status: 'archived',
      updated_at: new Date().toISOString(),
    })
    .eq('id', subscriptionId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(`Failed to archive subscription: ${error.message}`);
  return !!data;
}

export async function ensureSyncState(supabase, userId, subscriptionId, pollIntervalMinutes = 60) {
  const nextScheduledAt = computeNextScheduledAt({
    pollIntervalMinutes,
    consecutiveFailures: 0,
  });

  const { error } = await supabase
    .from('rss_sync_state')
    .upsert({
      subscription_id: subscriptionId,
      user_id: userId,
      next_scheduled_at: nextScheduledAt,
    }, {
      onConflict: 'subscription_id',
      ignoreDuplicates: false,
    });

  if (error) throw new Error(`Failed to ensure sync state: ${error.message}`);
}

export async function getSyncState(supabase, userId, subscriptionId) {
  const { data, error } = await supabase
    .from('rss_sync_state')
    .select('*')
    .eq('subscription_id', subscriptionId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to get sync state: ${error.message}`);
  return data || null;
}

export async function updateSyncState(supabase, userId, subscriptionId, updates) {
  const { error } = await supabase
    .from('rss_sync_state')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('subscription_id', subscriptionId)
    .eq('user_id', userId);

  if (error) throw new Error(`Failed to update sync state: ${error.message}`);
}

export async function listSubscriptionItems(supabase, userId, subscriptionId, filters = {}) {
  const limit = Math.min(Number.parseInt(filters.limit || 50, 10), 200);
  const offset = Math.max(Number.parseInt(filters.offset || 0, 10), 0);

  let query = supabase
    .from('rss_items')
    .select('*', { count: 'exact' })
    .eq('subscription_id', subscriptionId)
    .eq('user_id', userId)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.unread === true) query = query.eq('is_read', false);
  if (filters.unread === false) query = query.eq('is_read', true);
  if (filters.starred === true) query = query.eq('is_starred', true);
  if (filters.starred === false) query = query.eq('is_starred', false);
  if (filters.imported === true) query = query.not('imported_material_id', 'is', null);
  if (filters.imported === false) query = query.is('imported_material_id', null);

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to list items: ${error.message}`);
  return { items: data || [], total: count || 0, limit, offset };
}

export async function getItemById(supabase, userId, itemId) {
  const { data, error } = await supabase
    .from('rss_items')
    .select('*')
    .eq('id', itemId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to get item: ${error.message}`);
  return data || null;
}

export async function updateItem(supabase, userId, itemId, updates) {
  const { data, error } = await supabase
    .from('rss_items')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(`Failed to update item: ${error.message}`);
  return data || null;
}

export async function getDiscoveryCache(supabase, userId, sourceType, normalizedKey) {
  if (!normalizedKey) return null;
  const nowIso = new Date().toISOString();

  let query = supabase
    .from('rss_discovery_cache')
    .select('*')
    .eq('user_id', userId)
    .eq('source_type', sourceType)
    .gt('expires_at', nowIso)
    .limit(1);

  if (sourceType === 'nl_query') {
    query = query.eq('normalized_query', normalizedKey);
  } else {
    query = query.eq('normalized_url', normalizedKey);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Failed to read discovery cache: ${error.message}`);
  return data || null;
}

export async function upsertDiscoveryCache(supabase, userId, sourceType, normalizedKey, result, expiresAt) {
  const payload = {
    user_id: userId,
    source_type: sourceType,
    normalized_query: sourceType === 'nl_query' ? normalizedKey : null,
    normalized_url: sourceType === 'nl_query' ? null : normalizedKey,
    discovery_result: result,
    expires_at: expiresAt,
  };

  let selectQuery = supabase
    .from('rss_discovery_cache')
    .select('id')
    .eq('user_id', userId)
    .eq('source_type', sourceType)
    .limit(1);
  selectQuery = sourceType === 'nl_query'
    ? selectQuery.eq('normalized_query', normalizedKey)
    : selectQuery.eq('normalized_url', normalizedKey);

  const { data: existing, error: selectErr } = await selectQuery.maybeSingle();
  if (selectErr) {
    throw new Error(`Failed to read discovery cache before upsert: ${selectErr.message}`);
  }

  if (existing?.id) {
    const { error: updateErr } = await supabase
      .from('rss_discovery_cache')
      .update(payload)
      .eq('id', existing.id);
    if (updateErr) {
      throw new Error(`Failed to update discovery cache: ${updateErr.message}`);
    }
    return;
  }

  const { error: insertErr } = await supabase
    .from('rss_discovery_cache')
    .insert(payload);
  if (insertErr) {
    if (insertErr.code === '23505') return;
    throw new Error(`Failed to insert discovery cache: ${insertErr.message}`);
  }
}

export async function listDueSubscriptionStates(supabase, nowIso, limit = 20) {
  const { data, error } = await supabase
    .from('rss_sync_state')
    .select('subscription_id, user_id, next_scheduled_at, consecutive_failures')
    .lte('next_scheduled_at', nowIso)
    .order('next_scheduled_at', { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Failed to list due subscriptions: ${error.message}`);

  return data || [];
}
