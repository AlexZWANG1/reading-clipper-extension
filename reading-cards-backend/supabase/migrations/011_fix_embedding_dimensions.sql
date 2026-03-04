-- ============================================
-- Fix embedding dimensions: 1536 → 768
-- Reason: Using Ollama nomic-embed-text (768 dims) instead of OpenAI ada-002 (1536 dims)
-- ============================================

-- Drop existing index (will be recreated with correct dimensions)
DROP INDEX IF EXISTS idx_chunks_embedding;

-- Alter embedding column to 768 dimensions
ALTER TABLE chunks ALTER COLUMN embedding TYPE vector(768);

-- Update default embedding model
ALTER TABLE chunks ALTER COLUMN embedding_model SET DEFAULT 'nomic-embed-text';

-- Recreate HNSW index with correct dimensions
CREATE INDEX idx_chunks_embedding ON chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Also update cards table if it has embedding column
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'cards' AND column_name = 'embedding'
    ) THEN
        DROP INDEX IF EXISTS idx_cards_embedding;
        ALTER TABLE cards ALTER COLUMN embedding TYPE vector(768);
        ALTER TABLE cards ALTER COLUMN embedding_model SET DEFAULT 'nomic-embed-text';
        CREATE INDEX idx_cards_embedding ON cards
          USING hnsw (embedding vector_cosine_ops)
          WITH (m = 16, ef_construction = 64);
    END IF;
END $$;
