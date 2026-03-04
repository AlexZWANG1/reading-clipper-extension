#!/bin/bash
# Test Node.js backend API endpoints

BACKEND_URL="http://localhost:3000"
USER_EMAIL="test@example.com"
USER_PASSWORD="testpassword123"

echo "=== Backend API Test ==="
echo ""

# 1. Login to get JWT token
echo "1. Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST "${BACKEND_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${USER_EMAIL}\",\"password\":\"${USER_PASSWORD}\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo "   ✗ Login failed"
    echo "   Response: $LOGIN_RESPONSE"
    exit 1
fi

echo "   ✓ Login successful"
echo "   Token: ${TOKEN:0:50}..."

# 2. Test materials list endpoint
echo ""
echo "2. Testing GET /api/v2/materials..."
MATERIALS_RESPONSE=$(curl -s "${BACKEND_URL}/api/v2/materials" \
  -H "Authorization: Bearer ${TOKEN}")

echo "$MATERIALS_RESPONSE" | head -c 300
echo ""

MATERIAL_COUNT=$(echo "$MATERIALS_RESPONSE" | grep -o '"id"' | wc -l)
echo "   ✓ Found $MATERIAL_COUNT materials"

# 3. Test materials ingest endpoint
echo ""
echo "3. Testing POST /api/v2/materials/ingest..."
INGEST_RESPONSE=$(curl -s -X POST "${BACKEND_URL}/api/v2/materials/ingest" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "source_type": "text",
    "title": "Backend API Test",
    "text": "This is a test document created via the Node.js backend API. It should be processed by the Python sidecar and stored in the database with embeddings."
  }')

echo "$INGEST_RESPONSE"
echo ""

NEW_MATERIAL_ID=$(echo "$INGEST_RESPONSE" | grep -o '"material_id":"[^"]*"' | cut -d'"' -f4)

if [ -z "$NEW_MATERIAL_ID" ]; then
    echo "   ✗ Ingest failed"
else
    echo "   ✓ Ingest triggered, material_id: $NEW_MATERIAL_ID"

    # Wait for processing
    echo ""
    echo "4. Waiting for ingestion to complete (10 seconds)..."
    sleep 10

    # Check material status
    echo ""
    echo "5. Checking material status..."
    STATUS_RESPONSE=$(curl -s "${BACKEND_URL}/api/v2/materials/${NEW_MATERIAL_ID}" \
      -H "Authorization: Bearer ${TOKEN}")

    echo "$STATUS_RESPONSE" | head -c 400
    echo ""

    INGESTION_STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"ingestion_status":"[^"]*"' | cut -d'"' -f4)
    CHUNK_COUNT=$(echo "$STATUS_RESPONSE" | grep -o '"chunk_count":[0-9]*' | cut -d':' -f2)

    echo "   Status: $INGESTION_STATUS"
    echo "   Chunks: $CHUNK_COUNT"
fi

# 6. Test semantic search endpoint
echo ""
echo "6. Testing POST /api/v2/search/semantic..."
SEARCH_RESPONSE=$(curl -s -X POST "${BACKEND_URL}/api/v2/search/semantic" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "query": "research assistant",
    "limit": 5,
    "min_score": 0.3
  }')

echo "$SEARCH_RESPONSE" | head -c 400
echo ""

RESULT_COUNT=$(echo "$SEARCH_RESPONSE" | grep -o '"id"' | wc -l)
echo "   ✓ Found $RESULT_COUNT search results"

echo ""
echo "=== All Tests Complete ==="
