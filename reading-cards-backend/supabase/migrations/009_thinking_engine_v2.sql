-- ============================================
-- Migration 009: Thinking Engine V2
-- Recursive Q→Q, H→H decomposition via parent_id
-- Evidence relationships via edges (supports/refutes/neutral)
-- New node attributes: priority, status, claim, confidence, etc.
-- ============================================

-- ============================================
-- 1. Add parent_id for recursive decomposition
-- ============================================
ALTER TABLE board_nodes
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES board_nodes(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_board_nodes_parent ON board_nodes(parent_id);

-- ============================================
-- 2. Question-specific columns
-- ============================================
ALTER TABLE board_nodes
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS decomposition_type TEXT;

-- Add constraints (safe for existing data)
ALTER TABLE board_nodes
  ADD CONSTRAINT chk_priority CHECK (priority IS NULL OR priority IN ('critical','normal','low')),
  ADD CONSTRAINT chk_status CHECK (status IS NULL OR status IN ('open','resolved','blocked')),
  ADD CONSTRAINT chk_decomposition_type CHECK (decomposition_type IS NULL OR decomposition_type IN ('component','process','factor'));

-- ============================================
-- 3. Hypothesis-specific columns
-- ============================================
ALTER TABLE board_nodes
  ADD COLUMN IF NOT EXISTS claim TEXT,
  ADD COLUMN IF NOT EXISTS hypo_state TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS confidence FLOAT DEFAULT 0.0;

ALTER TABLE board_nodes
  ADD CONSTRAINT chk_hypo_state CHECK (hypo_state IS NULL OR hypo_state IN ('validated','falsified','pending')),
  ADD CONSTRAINT chk_confidence CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));

-- ============================================
-- 4. Evidence-specific columns
-- ============================================
ALTER TABLE board_nodes
  ADD COLUMN IF NOT EXISTS evidence_type TEXT,
  ADD COLUMN IF NOT EXISTS strength INT DEFAULT 3;

ALTER TABLE board_nodes
  ADD CONSTRAINT chk_evidence_type CHECK (evidence_type IS NULL OR evidence_type IN ('fact','opinion')),
  ADD CONSTRAINT chk_strength CHECK (strength IS NULL OR (strength >= 1 AND strength <= 5));

-- ============================================
-- 5. Migrate existing data BEFORE changing constraints
-- ============================================
-- Change 'card_ref' to 'evidence' for the new model
UPDATE board_nodes SET node_type = 'evidence' WHERE node_type = 'card_ref';

-- 'answers' is no longer used (Q→H is via parent_id), remap to 'related'
UPDATE board_edges SET relation_type = 'related' WHERE relation_type = 'answers';

-- ============================================
-- 6. Update node_type enum (after data migrated)
-- ============================================
-- Drop old constraint, add new one
ALTER TABLE board_nodes DROP CONSTRAINT IF EXISTS board_nodes_node_type_check;
ALTER TABLE board_nodes
  ADD CONSTRAINT board_nodes_node_type_check
    CHECK (node_type IN ('question','hypothesis','evidence'));

-- ============================================
-- 7. Update edge relation_type enum (after data migrated)
-- ============================================
ALTER TABLE board_edges DROP CONSTRAINT IF EXISTS board_edges_relation_type_check;
ALTER TABLE board_edges
  ADD CONSTRAINT board_edges_relation_type_check
    CHECK (relation_type IN ('supports','refutes','neutral','conflicts','related'));

ALTER TABLE board_edges
  ADD COLUMN IF NOT EXISTS ai_explanation TEXT;
