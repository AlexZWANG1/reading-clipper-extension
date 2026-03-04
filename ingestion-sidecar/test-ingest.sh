#!/bin/bash
# Test script for full ingestion flow

set -e

SUPABASE_URL="https://eqvlgoiiumstaqywtpon.supabase.co"
SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxdmxnb2lpdW1zdGFxeXd0cG9uIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjY1MzAwNiwiZXhwIjoyMDgyMjI5MDA2fQ.yZCyCZeH1NypjZlsJfFPn9sekdybQd5phYuE0-VB4sU"
SIDECAR_KEY="rc-sidecar-2026"

echo "=== Ingestion Flow Test ==="
echo ""

# Step 1: Use a test user ID
echo "1. Using test user ID..."
USER_ID="34920265-2ca4-4ac7-b2e5-bf2caacedd8b"
echo "   ✓ Using test user ID: $USER_ID"

# Step 2: Create a material record
echo ""
echo "2. Creating material record..."
MATERIAL_RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/rest/v1/materials" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{
    \"user_id\": \"${USER_ID}\",
    \"title\": \"Test Article\",
    \"source_type\": \"url\",
    \"url\": \"https://example.com/test-article\",
    \"ingestion_status\": \"pending\"
  }")

MATERIAL_ID=$(echo "$MATERIAL_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$MATERIAL_ID" ]; then
    echo "   ✗ Failed to create material"
    echo "   Response: $MATERIAL_RESPONSE"
    exit 1
fi

echo "   ✓ Created material ID: $MATERIAL_ID"

# Step 3: Trigger ingestion
echo ""
echo "3. Triggering ingestion via sidecar..."
INGEST_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://127.0.0.1:8100/ingest \
  -H "Content-Type: application/json" \
  -H "X-Sidecar-Key: ${SIDECAR_KEY}" \
  -d "{
    \"user_id\": \"${USER_ID}\",
    \"material_id\": \"${MATERIAL_ID}\",
    \"source_type\": \"url\",
    \"url\": \"https://example.com/test-article\"
  }")

HTTP_CODE=$(echo "$INGEST_RESPONSE" | tail -n1)
BODY=$(echo "$INGEST_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" != "200" ]; then
    echo "   ✗ Ingestion failed (HTTP $HTTP_CODE)"
    echo "   Response: $BODY"
    exit 1
fi

echo "   ✓ Ingestion triggered successfully"
echo "   Response: $BODY"

# Step 4: Wait and check material status
echo ""
echo "4. Waiting for ingestion to complete (5 seconds)..."
sleep 5

MATERIAL_CHECK=$(curl -s "${SUPABASE_URL}/rest/v1/materials?id=eq.${MATERIAL_ID}&select=*" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}")

echo "   Material status:"
echo "$MATERIAL_CHECK" | grep -o '"ingestion_status":"[^"]*"' || echo "   (no status found)"
echo "$MATERIAL_CHECK" | grep -o '"chunk_count":[0-9]*' || echo "   (no chunks found)"

# Step 5: Check chunks table
echo ""
echo "5. Checking chunks table..."
CHUNKS_RESPONSE=$(curl -s "${SUPABASE_URL}/rest/v1/chunks?material_id=eq.${MATERIAL_ID}&select=id,content,embedding_model&limit=3" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}")

CHUNK_COUNT=$(echo "$CHUNKS_RESPONSE" | grep -o '"id":"[^"]*"' | wc -l)

if [ "$CHUNK_COUNT" -gt 0 ]; then
    echo "   ✓ Found $CHUNK_COUNT chunks"
    echo "   Sample chunks:"
    echo "$CHUNKS_RESPONSE" | head -c 500
else
    echo "   ✗ No chunks found"
    echo "   Response: $CHUNKS_RESPONSE"
fi

echo ""
echo "=== Test Complete ==="
