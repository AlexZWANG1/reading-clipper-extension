#!/bin/bash
# Test semantic search via Postgres RPC

SUPABASE_URL="https://eqvlgoiiumstaqywtpon.supabase.co"
SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxdmxnb2lpdW1zdGFxeXd0cG9uIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjY1MzAwNiwiZXhwIjoyMDgyMjI5MDA2fQ.yZCyCZeH1NypjZlsJfFPn9sekdybQd5phYuE0-VB4sU"
SIDECAR_KEY="rc-sidecar-2026"
USER_ID="34920265-2ca4-4ac7-b2e5-bf2caacedd8b"

echo "=== Semantic Search Test ==="
echo ""

# 1. Generate query embedding
echo "1. Generating query embedding for 'AI research assistant'..."
EMBED_RESPONSE=$(curl -s -X POST http://127.0.0.1:8100/embed \
  -H "Content-Type: application/json" \
  -H "X-Sidecar-Key: ${SIDECAR_KEY}" \
  -d '{"texts":["AI research assistant"]}')

QUERY_EMBEDDING=$(echo "$EMBED_RESPONSE" | grep -o '"embeddings":\[\[[^]]*\]\]' | sed 's/"embeddings":\[\[/[/' | sed 's/\]\]/]/')

if [ -z "$QUERY_EMBEDDING" ]; then
    echo "   ✗ Failed to generate embedding"
    exit 1
fi

echo "   ✓ Embedding generated (768 dimensions)"

# 2. Call search RPC
echo ""
echo "2. Calling search_chunks_hybrid RPC..."
SEARCH_RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/rest/v1/rpc/search_chunks_hybrid" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{
    \"query_embedding\": ${QUERY_EMBEDDING},
    \"query_text\": \"AI research assistant\",
    \"match_count\": 5,
    \"min_similarity\": 0.3,
    \"p_user_id\": \"${USER_ID}\"
  }")

echo "$SEARCH_RESPONSE" | head -c 500
echo ""
echo ""

# Check if results found
RESULT_COUNT=$(echo "$SEARCH_RESPONSE" | grep -o '"id"' | wc -l)

if [ "$RESULT_COUNT" -gt 0 ]; then
    echo "   ✓ Found $RESULT_COUNT results"
else
    echo "   ✗ No results found"
    echo "   Full response: $SEARCH_RESPONSE"
fi

echo ""
echo "=== Test Complete ==="
