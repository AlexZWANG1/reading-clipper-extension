#!/bin/bash
# Test Chat semantic_search tool

BACKEND_URL="http://localhost:3000"
USER_EMAIL="test@example.com"
USER_PASSWORD="testpassword123"

echo "=== Chat Semantic Search Test ==="
echo ""

# 1. Login
echo "1. Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST "${BACKEND_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${USER_EMAIL}\",\"password\":\"${USER_PASSWORD}\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo "   ✗ Login failed"
    exit 1
fi

echo "   ✓ Login successful"

# 2. Send chat message asking about documents
echo ""
echo "2. Sending chat message: 'What do my documents say about AI research?'"
CHAT_RESPONSE=$(curl -s -X POST "${BACKEND_URL}/api/v2/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "messages": [
      {"role": "user", "content": "What do my documents say about AI research?"}
    ]
  }')

echo "$CHAT_RESPONSE" | head -c 800
echo ""
echo ""

# Check if semantic_search was called
if echo "$CHAT_RESPONSE" | grep -q "semantic_search"; then
    echo "   ✓ semantic_search tool was called"
else
    echo "   ⚠ semantic_search tool may not have been called"
fi

# 3. Send another message
echo ""
echo "3. Sending follow-up: 'Tell me more about NotebookLM'"
CHAT_RESPONSE2=$(curl -s -X POST "${BACKEND_URL}/api/v2/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "messages": [
      {"role": "user", "content": "What do my documents say about AI research?"},
      {"role": "assistant", "content": "Let me search your documents..."},
      {"role": "user", "content": "Tell me more about NotebookLM"}
    ]
  }')

echo "$CHAT_RESPONSE2" | head -c 800
echo ""
echo ""

echo "=== Test Complete ==="
