# Phase 1 Testing Results & Next Steps

## ✅ Completed Tests

### 1. Ollama Embedding Service
- ✅ Ollama running on `http://127.0.0.1:11434`
- ✅ Model `nomic-embed-text` available (768 dimensions)
- ✅ Embedding API working correctly

### 2. Sidecar Health
- ✅ Sidecar running on `http://127.0.0.1:8100`
- ✅ `/health` endpoint: OK
- ✅ `/embed` endpoint: Returns 768-dim vectors

### 3. Ingestion Pipeline
- ✅ Text extraction working
- ✅ Chunking working
- ✅ Embedding generation working
- ❌ Database insertion failing: **dimension mismatch (768 vs 1536)**

## 🔧 Required Fix: Migration 011

**Problem:** Database expects 1536 dimensions (OpenAI ada-002), but we're using 768 dimensions (Ollama nomic-embed-text).

**Solution:** Run migration `011_fix_embedding_dimensions.sql`

### Manual Steps (via Supabase SQL Editor)

1. Go to: https://supabase.com/dashboard/project/eqvlgoiiumstaqywtpon/sql/new
2. Paste and execute:

```sql
-- Drop existing index
DROP INDEX IF EXISTS idx_chunks_embedding;

-- Alter embedding column to 768 dimensions
ALTER TABLE chunks ALTER COLUMN embedding TYPE vector(768);

-- Update default embedding model
ALTER TABLE chunks ALTER COLUMN embedding_model SET DEFAULT 'nomic-embed-text';

-- Recreate HNSW index
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
```

3. Verify:
```sql
SELECT
    column_name,
    data_type,
    udt_name
FROM information_schema.columns
WHERE table_name = 'chunks' AND column_name = 'embedding';
-- Should show: vector(768)
```

## 🧪 Re-test After Migration

Once migration is applied, re-run the text ingestion test:

```bash
cd ingestion-sidecar

# Create test material
MATERIAL_ID=$(curl -s "https://eqvlgoiiumstaqywtpon.supabase.co/rest/v1/materials" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"user_id":"34920265-2ca4-4ac7-b2e5-bf2caacedd8b","title":"Test","source_type":"text","ingestion_status":"pending"}' \
  | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

# Trigger ingestion
curl -X POST http://127.0.0.1:8100/ingest \
  -H "Content-Type: application/json" \
  -H "X-Sidecar-Key: rc-sidecar-2026" \
  -d "{
    \"user_id\": \"34920265-2ca4-4ac7-b2e5-bf2caacedd8b\",
    \"material_id\": \"$MATERIAL_ID\",
    \"source_type\": \"text\",
    \"text\": \"This is a test document with multiple sentences. It will be chunked and embedded.\"
  }"

# Check results
curl -s "https://eqvlgoiiumstaqywtpon.supabase.co/rest/v1/chunks?material_id=eq.$MATERIAL_ID&select=id,content,embedding_model" \
  -H "apikey: ..." \
  -H "Authorization: Bearer ..."
```

Expected result:
```json
{
  "status": "completed",
  "chunk_count": 1,
  "word_count": 14,
  "title": "Test"
}
```

## 📋 Phase 2: Node.js Backend Integration

Once Phase 1 is verified, proceed to Phase 2:

### Files to Create/Modify

1. **`reading-cards-backend/src/routes/v2/materials.mjs`** (new)
   - `POST /v2/materials/ingest` — trigger ingestion
   - `GET /v2/materials/:id` — get material status
   - `GET /v2/materials` — list user materials

2. **`reading-cards-backend/src/routes/v2/search.mjs`** (new)
   - `POST /v2/search/semantic` — vector search via chunks

3. **`reading-cards-backend/src/server.mjs`** (modify)
   - Register new v2 routes

4. **`reading-cards-backend/.env`** (add)
   ```
   SIDECAR_URL=http://127.0.0.1:8100
   SIDECAR_API_KEY=rc-sidecar-2026
   ```

### Implementation Priority

1. ✅ Phase 1: Sidecar + Database (BLOCKED on migration 011)
2. ⏸️ Phase 2: Node.js API endpoints
3. ⏸️ Phase 3: Chat RAG integration
4. ⏸️ Phase 4: Migration & cleanup

## 🐛 Known Issues

1. **URL extraction timeout** — Jina API may be slow/unreliable
   - Workaround: Use text ingestion for testing
   - Future: Add timeout handling and retry logic

2. **Dimension mismatch** — Fixed by migration 011
   - Root cause: Migration 010 used OpenAI dimensions
   - Solution: Migration 011 updates to Ollama dimensions

## 📊 Test User

- **User ID:** `34920265-2ca4-4ac7-b2e5-bf2caacedd8b`
- **Email:** `test@example.com`
- **Password:** `testpassword123`

## 🔗 Useful Links

- Supabase Dashboard: https://supabase.com/dashboard/project/eqvlgoiiumstaqywtpon
- SQL Editor: https://supabase.com/dashboard/project/eqvlgoiiumstaqywtpon/sql/new
- Table Editor: https://supabase.com/dashboard/project/eqvlgoiiumstaqywtpon/editor
