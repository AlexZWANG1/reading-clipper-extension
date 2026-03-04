#!/bin/bash
# Quick start script for NotebookLM system

echo "=== Starting NotebookLM System ==="
echo ""

# Check Ollama
echo "1. Checking Ollama..."
if curl -s http://127.0.0.1:11434/api/tags > /dev/null 2>&1; then
    echo "   ✓ Ollama is running"
else
    echo "   ✗ Ollama is not running"
    echo "   Please start Ollama: ollama serve"
    exit 1
fi

# Check nomic-embed-text model
echo ""
echo "2. Checking nomic-embed-text model..."
if ollama list | grep -q "nomic-embed-text"; then
    echo "   ✓ Model is available"
else
    echo "   ✗ Model not found"
    echo "   Pulling model..."
    ollama pull nomic-embed-text
fi

# Start Python Sidecar
echo ""
echo "3. Starting Python Sidecar..."
cd ingestion-sidecar
if [ -d "venv" ]; then
    source venv/bin/activate 2>/dev/null || source venv/Scripts/activate 2>/dev/null
fi

python run.py > sidecar.log 2>&1 &
SIDECAR_PID=$!
echo "   ✓ Sidecar started (PID: $SIDECAR_PID)"
echo "   Log: ingestion-sidecar/sidecar.log"

# Wait for sidecar to start
sleep 3

# Check sidecar health
if curl -s http://127.0.0.1:8100/health > /dev/null 2>&1; then
    echo "   ✓ Sidecar is healthy"
else
    echo "   ✗ Sidecar failed to start"
    echo "   Check log: ingestion-sidecar/sidecar.log"
    exit 1
fi

# Start Node.js Backend
echo ""
echo "4. Starting Node.js Backend..."
cd ../reading-cards-backend
npm start > backend.log 2>&1 &
BACKEND_PID=$!
echo "   ✓ Backend started (PID: $BACKEND_PID)"
echo "   Log: reading-cards-backend/backend.log"

# Wait for backend to start
sleep 5

# Check backend health
if curl -s http://localhost:3000/ > /dev/null 2>&1; then
    echo "   ✓ Backend is healthy"
else
    echo "   ✗ Backend failed to start"
    echo "   Check log: reading-cards-backend/backend.log"
    exit 1
fi

echo ""
echo "=== System Started Successfully ==="
echo ""
echo "Services:"
echo "  - Ollama:  http://127.0.0.1:11434"
echo "  - Sidecar: http://127.0.0.1:8100"
echo "  - Backend: http://localhost:3000"
echo ""
echo "PIDs:"
echo "  - Sidecar: $SIDECAR_PID"
echo "  - Backend: $BACKEND_PID"
echo ""
echo "To stop:"
echo "  kill $SIDECAR_PID $BACKEND_PID"
echo ""
