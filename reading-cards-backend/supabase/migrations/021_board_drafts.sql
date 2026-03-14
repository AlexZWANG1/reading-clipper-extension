-- Migration 021: Board Drafts
-- Stores AI-proposed board changes as drafts for user review on the canvas.

CREATE TABLE IF NOT EXISTS board_drafts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  board_id UUID NOT NULL REFERENCES thinking_boards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  reasoning TEXT,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'partially_accepted', 'rejected', 'expired')),
  accepted_changes JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

-- RLS
ALTER TABLE board_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY board_drafts_select ON board_drafts
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY board_drafts_insert ON board_drafts
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY board_drafts_update ON board_drafts
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY board_drafts_delete ON board_drafts
  FOR DELETE USING (user_id = auth.uid());

-- Service role bypass
CREATE POLICY board_drafts_service ON board_drafts
  FOR ALL USING (true) WITH CHECK (true);

-- Index for querying pending drafts per board
CREATE INDEX IF NOT EXISTS idx_board_drafts_pending
  ON board_drafts(board_id, status) WHERE status = 'pending';
