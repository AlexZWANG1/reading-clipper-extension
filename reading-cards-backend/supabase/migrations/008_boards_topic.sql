-- ============================================
-- Migration 008: Add topic_id to thinking_boards
-- Enables 1:1 Topic-Board relationship
-- ============================================

-- 1. Add topic_id column with CASCADE delete
ALTER TABLE thinking_boards 
ADD COLUMN IF NOT EXISTS topic_id UUID REFERENCES topics(id) ON DELETE CASCADE;

-- 2. Partial unique index (allows historical data with NULL topic_id)
-- Ensures each topic has at most one board
CREATE UNIQUE INDEX IF NOT EXISTS idx_thinking_boards_topic_unique 
ON thinking_boards(topic_id) WHERE topic_id IS NOT NULL;

-- 3. Regular index for query performance
CREATE INDEX IF NOT EXISTS idx_thinking_boards_topic_id 
ON thinking_boards(topic_id);

-- Note: Historical boards with topic_id = NULL will become inaccessible
-- via the new topic-centric UI, but data is preserved.
