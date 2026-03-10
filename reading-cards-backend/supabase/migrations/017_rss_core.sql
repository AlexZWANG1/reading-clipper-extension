-- ========= Migration 017: Built-in RSS Subscription Domain =========
-- Adds pure built-in RSS product layer:
--   rss_subscriptions / rss_items / rss_sync_state / rss_discovery_cache

-- 1) Subscriptions
CREATE TABLE IF NOT EXISTS rss_subscriptions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_id UUID REFERENCES sources(id) ON DELETE SET NULL,

    title TEXT NOT NULL,
    site_url TEXT,
    feed_url TEXT NOT NULL,
    feed_url_normalized TEXT NOT NULL,
    description TEXT,
    language TEXT,
    region TEXT,
    tags TEXT[] DEFAULT '{}'::text[],

    status TEXT DEFAULT 'active'
      CHECK (status IN ('active', 'paused', 'archived')),
    poll_interval_minutes INTEGER DEFAULT 60
      CHECK (poll_interval_minutes >= 5 AND poll_interval_minutes <= 1440),

    last_checked_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ,
    last_error TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (user_id, feed_url_normalized)
);

CREATE INDEX IF NOT EXISTS idx_rss_subscriptions_user_id
  ON rss_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_rss_subscriptions_status
  ON rss_subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_rss_subscriptions_source_id
  ON rss_subscriptions(source_id);
CREATE INDEX IF NOT EXISTS idx_rss_subscriptions_tags
  ON rss_subscriptions USING GIN(tags);

-- 2) Item inbox
CREATE TABLE IF NOT EXISTS rss_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    subscription_id UUID NOT NULL REFERENCES rss_subscriptions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    guid TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT,
    url_hash TEXT,
    author TEXT,
    published_at TIMESTAMPTZ,
    summary TEXT,
    content_html TEXT,
    raw_payload JSONB DEFAULT '{}'::jsonb,

    is_read BOOLEAN DEFAULT FALSE,
    is_starred BOOLEAN DEFAULT FALSE,
    imported_material_id UUID REFERENCES materials(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (subscription_id, guid)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rss_items_subscription_url_hash
  ON rss_items(subscription_id, url_hash)
  WHERE url_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rss_items_subscription_published
  ON rss_items(subscription_id, published_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rss_items_user_read
  ON rss_items(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rss_items_user_starred
  ON rss_items(user_id, is_starred, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rss_items_imported_material
  ON rss_items(imported_material_id);

-- 3) Sync state
CREATE TABLE IF NOT EXISTS rss_sync_state (
    subscription_id UUID PRIMARY KEY REFERENCES rss_subscriptions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    last_etag TEXT,
    last_modified TEXT,
    last_success_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    consecutive_failures INTEGER DEFAULT 0 CHECK (consecutive_failures >= 0),
    next_scheduled_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rss_sync_state_next
  ON rss_sync_state(next_scheduled_at);
CREATE INDEX IF NOT EXISTS idx_rss_sync_state_user
  ON rss_sync_state(user_id);

-- 4) Discovery cache
CREATE TABLE IF NOT EXISTS rss_discovery_cache (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    source_type TEXT NOT NULL
      CHECK (source_type IN ('nl_query', 'website_url', 'feed_url')),
    normalized_query TEXT,
    normalized_url TEXT,
    discovery_result JSONB NOT NULL DEFAULT '[]'::jsonb,

    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CHECK (
      (normalized_query IS NOT NULL AND normalized_url IS NULL)
      OR
      (normalized_query IS NULL AND normalized_url IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rss_discovery_cache_unique
  ON rss_discovery_cache(user_id, source_type, COALESCE(normalized_query, normalized_url));
CREATE INDEX IF NOT EXISTS idx_rss_discovery_cache_expires
  ON rss_discovery_cache(expires_at);

-- 5) Triggers
DROP TRIGGER IF EXISTS set_rss_subscriptions_updated_at ON rss_subscriptions;
CREATE TRIGGER set_rss_subscriptions_updated_at
  BEFORE UPDATE ON rss_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_rss_items_updated_at ON rss_items;
CREATE TRIGGER set_rss_items_updated_at
  BEFORE UPDATE ON rss_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_rss_sync_state_updated_at ON rss_sync_state;
CREATE TRIGGER set_rss_sync_state_updated_at
  BEFORE UPDATE ON rss_sync_state
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_rss_discovery_cache_updated_at ON rss_discovery_cache;
CREATE TRIGGER set_rss_discovery_cache_updated_at
  BEFORE UPDATE ON rss_discovery_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 6) RLS
ALTER TABLE rss_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rss_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE rss_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE rss_discovery_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rss_subscriptions_select" ON rss_subscriptions;
CREATE POLICY "rss_subscriptions_select" ON rss_subscriptions
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "rss_subscriptions_insert" ON rss_subscriptions;
CREATE POLICY "rss_subscriptions_insert" ON rss_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "rss_subscriptions_update" ON rss_subscriptions;
CREATE POLICY "rss_subscriptions_update" ON rss_subscriptions
  FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "rss_subscriptions_delete" ON rss_subscriptions;
CREATE POLICY "rss_subscriptions_delete" ON rss_subscriptions
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "rss_items_select" ON rss_items;
CREATE POLICY "rss_items_select" ON rss_items
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "rss_items_insert" ON rss_items;
CREATE POLICY "rss_items_insert" ON rss_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "rss_items_update" ON rss_items;
CREATE POLICY "rss_items_update" ON rss_items
  FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "rss_items_delete" ON rss_items;
CREATE POLICY "rss_items_delete" ON rss_items
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "rss_sync_state_select" ON rss_sync_state;
CREATE POLICY "rss_sync_state_select" ON rss_sync_state
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "rss_sync_state_insert" ON rss_sync_state;
CREATE POLICY "rss_sync_state_insert" ON rss_sync_state
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "rss_sync_state_update" ON rss_sync_state;
CREATE POLICY "rss_sync_state_update" ON rss_sync_state
  FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "rss_sync_state_delete" ON rss_sync_state;
CREATE POLICY "rss_sync_state_delete" ON rss_sync_state
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "rss_discovery_cache_select" ON rss_discovery_cache;
CREATE POLICY "rss_discovery_cache_select" ON rss_discovery_cache
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "rss_discovery_cache_insert" ON rss_discovery_cache;
CREATE POLICY "rss_discovery_cache_insert" ON rss_discovery_cache
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "rss_discovery_cache_update" ON rss_discovery_cache;
CREATE POLICY "rss_discovery_cache_update" ON rss_discovery_cache
  FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "rss_discovery_cache_delete" ON rss_discovery_cache;
CREATE POLICY "rss_discovery_cache_delete" ON rss_discovery_cache
  FOR DELETE USING (auth.uid() = user_id);
