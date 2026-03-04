#!/bin/bash
# Apply migration 011 via Supabase REST API

SUPABASE_URL="https://eqvlgoiiumstaqywtpon.supabase.co"
SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxdmxnb2lpdW1zdGFxeXd0cG9uIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjY1MzAwNiwiZXhwIjoyMDgyMjI5MDA2fQ.yZCyCZeH1NypjZlsJfFPn9sekdybQd5phYuE0-VB4sU"

echo "Applying migration 011: Fix embedding dimensions..."

# Execute SQL via RPC
curl -X POST "${SUPABASE_URL}/rest/v1/rpc/exec_sql" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -d @- <<'EOF'
{
  "sql": "DROP INDEX IF EXISTS idx_chunks_embedding; ALTER TABLE chunks ALTER COLUMN embedding TYPE vector(768); ALTER TABLE chunks ALTER COLUMN embedding_model SET DEFAULT 'nomic-embed-text'; CREATE INDEX idx_chunks_embedding ON chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);"
}
EOF

echo ""
echo "Migration applied!"
