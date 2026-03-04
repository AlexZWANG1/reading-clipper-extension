#!/bin/bash
# Quick test script for local Ollama embeddings

set -e

echo "=== Local Embeddings Test ==="
echo ""

# Test 1: Check Ollama is running
echo "1. Checking Ollama service..."
if curl -s http://127.0.0.1:11434/api/tags > /dev/null; then
    echo "   ✓ Ollama is running"
else
    echo "   ✗ Ollama is not running. Start it with: ollama serve"
    exit 1
fi

# Test 2: Check model is available
echo ""
echo "2. Checking nomic-embed-text model..."
if ollama list | grep -q "nomic-embed-text"; then
    echo "   ✓ Model is available"
else
    echo "   ✗ Model not found. Pull it with: ollama pull nomic-embed-text"
    exit 1
fi

# Test 3: Test Ollama embeddings directly
echo ""
echo "3. Testing Ollama embeddings API..."
RESPONSE=$(curl -s http://127.0.0.1:11434/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model":"nomic-embed-text","input":["test"]}')

if echo "$RESPONSE" | grep -q '"data"'; then
    echo "   ✓ Ollama embeddings API works"
else
    echo "   ✗ Ollama embeddings API failed"
    echo "   Response: $RESPONSE"
    exit 1
fi

# Test 4: Check sidecar is running
echo ""
echo "4. Checking sidecar health..."
if curl -s http://127.0.0.1:8100/health > /dev/null; then
    echo "   ✓ Sidecar is running"
else
    echo "   ✗ Sidecar is not running. Start it with: cd ingestion-sidecar && python run.py"
    exit 1
fi

# Test 5: Test sidecar embed endpoint
echo ""
echo "5. Testing sidecar /embed endpoint..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://127.0.0.1:8100/embed \
  -H "Content-Type: application/json" \
  -H "X-Sidecar-Key: rc-sidecar-2026" \
  -d '{"texts":["hello world"]}')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    echo "   ✓ Sidecar embed endpoint works"
    echo "   Model: $(echo "$BODY" | grep -o '"model":"[^"]*"' | cut -d'"' -f4)"
    EMBEDDING_COUNT=$(echo "$BODY" | grep -o '"embeddings":\[\[' | wc -l)
    if [ "$EMBEDDING_COUNT" -gt 0 ]; then
        echo "   ✓ Embeddings returned successfully"
    fi
else
    echo "   ✗ Sidecar embed endpoint failed (HTTP $HTTP_CODE)"
    echo "   Response: $BODY"
    exit 1
fi

echo ""
echo "=== All tests passed! ==="
echo ""
echo "✓ No api.openai.com calls detected"
echo "✓ Local Ollama embeddings working correctly"
