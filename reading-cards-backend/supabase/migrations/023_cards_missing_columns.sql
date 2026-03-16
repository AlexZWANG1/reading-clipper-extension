-- Migration 023: Add missing columns to cards table
-- These columns are referenced in code (cards.mjs) but were never added via migration.

ALTER TABLE cards ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS fact_or_view TEXT CHECK (fact_or_view IN ('fact', 'view'));
ALTER TABLE cards ADD COLUMN IF NOT EXISTS locator JSONB DEFAULT '{}';
ALTER TABLE cards ADD COLUMN IF NOT EXISTS source_region TEXT;

-- Index for filtering by fact_or_view
CREATE INDEX IF NOT EXISTS idx_cards_fact_or_view ON cards (fact_or_view) WHERE fact_or_view IS NOT NULL;
