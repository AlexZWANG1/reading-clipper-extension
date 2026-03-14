-- Migration 020: Research State, Health Cache, and User Methodologies
-- Adds research_state to topics, health_cache to thinking_boards,
-- and creates user_methodologies table for the methodology knowledge layer.

-- ══════════════════════════════════════════════════════
-- 1. Add research_state to topics
-- ══════════════════════════════════════════════════════

ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS research_state JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN topics.research_state IS 'Computed research state: hypotheses summary, evidence balance, blind spots. Auto-computed by researchContext.mjs.';

-- ══════════════════════════════════════════════════════
-- 2. Add health_cache to thinking_boards
-- ══════════════════════════════════════════════════════

ALTER TABLE thinking_boards
  ADD COLUMN IF NOT EXISTS health_cache JSONB DEFAULT '{}'::jsonb;

ALTER TABLE thinking_boards
  ADD COLUMN IF NOT EXISTS health_computed_at TIMESTAMPTZ;

COMMENT ON COLUMN thinking_boards.health_cache IS 'Cached health computation: per-hypothesis evidence balance, bias warnings, orphan cards.';

-- ══════════════════════════════════════════════════════
-- 3. Create user_methodologies table
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_methodologies (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '默认方法论',
  document TEXT NOT NULL DEFAULT '',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  base_template TEXT CHECK (base_template IN ('mece', '5whys', 'first_principles')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Only one active methodology per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_active_methodology
  ON user_methodologies(user_id) WHERE is_active = true;

-- ══════════════════════════════════════════════════════
-- 4. RLS for user_methodologies
-- ══════════════════════════════════════════════════════

ALTER TABLE user_methodologies ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_methodologies_select ON user_methodologies
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY user_methodologies_insert ON user_methodologies
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY user_methodologies_update ON user_methodologies
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY user_methodologies_delete ON user_methodologies
  FOR DELETE USING (user_id = auth.uid());

-- Service role bypass for backend operations
CREATE POLICY user_methodologies_service ON user_methodologies
  FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════
-- 5. Auto-update trigger
-- ══════════════════════════════════════════════════════

CREATE TRIGGER update_user_methodologies_updated_at
  BEFORE UPDATE ON user_methodologies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
