# Local Embeddings Testing Guide

This guide shows how to test the local Ollama embeddings integration.

## Prerequisites

1. **Install Ollama** (if not already installed):
   - Download from https://ollama.ai/
   - Or use package manager: `winget install Ollama.Ollama`

2. **Pull the embedding model**:
   ```bash
   ollama pull nomic-embed-text
   ```

3. **Verify Ollama is running**:
   ```bash
   # Check if Ollama service is running
   curl http://127.0.0.1:11434/api/tags
   ```

## Test Steps

### Step 1: Test Ollama directly

Test the Ollama embeddings endpoint directly:

```bash
curl http://127.0.0.1:11434/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model":"nomic-embed-text","input":["ping"]}'
```

**Expected output**: JSON response with `data` array containing embedding vectors:
```json
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "embedding": [0.123, -0.456, ...],
      "index": 0
    }
  ],
  "model": "nomic-embed-text",
  "usage": {...}
}
```

### Step 2: Start the ingestion sidecar

```bash
cd ingestion-sidecar
python run.py
```

**Expected output**:
```
INFO:     Started server process [xxxxx]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8100
```

### Step 3: Test sidecar health endpoint

```bash
curl http://127.0.0.1:8100/health
```

**Expected output**:
```json
{"ok":true,"version":"0.1.0"}
```

### Step 4: Test sidecar embed endpoint

```bash
curl -X POST http://127.0.0.1:8100/embed \
  -H "Content-Type: application/json" \
  -H "X-Sidecar-Key: rc-sidecar-2026" \
  -d '{"texts":["ping"]}'
```

**Expected output**: JSON response with embeddings array:
```json
{
  "embeddings": [
    [0.123, -0.456, ...]
  ],
  "model": "ollama/nomic-embed-text"
}
```

### Step 5: Verify no OpenAI API calls

Check the sidecar logs - you should see:
```
INFO: Embedding 1 texts via http://127.0.0.1:11434/v1/embeddings (model: nomic-embed-text)
INFO: Successfully embedded 1 texts
```

**Important**: There should be NO mentions of:
- `api.openai.com`
- `insufficient_quota`
- `429 Too Many Requests`
- Any fallback attempts

## Troubleshooting

### Error: "Failed to connect to embeddings endpoint"

**Cause**: Ollama is not running.

**Solution**:
```bash
# Start Ollama service (Windows)
ollama serve

# Or check if it's already running
curl http://127.0.0.1:11434/api/tags
```

### Error: "Embeddings API returned 404"

**Cause**: Model not pulled or wrong model name.

**Solution**:
```bash
# List available models
ollama list

# Pull the model if missing
ollama pull nomic-embed-text
```

### Error: "Invalid response format"

**Cause**: Ollama version too old or API incompatibility.

**Solution**:
```bash
# Update Ollama to latest version
ollama --version  # Check current version
# Download latest from https://ollama.ai/
```

## Configuration

Edit `ingestion-sidecar/.env` to customize:

```env
# Use different Ollama host (e.g., remote server)
EMBEDDINGS_BASE_URL=http://192.168.1.100:11434/v1

# Use different model (must be pulled first)
EMBEDDINGS_MODEL=mxbai-embed-large
EMBEDDINGS_DIMENSIONS=1024

# API key (Ollama ignores this, but required for compatibility)
EMBEDDINGS_API_KEY=ollama
```

## Supported Models

Common Ollama embedding models:
- `nomic-embed-text` (768 dim) - Default, good balance
- `mxbai-embed-large` (1024 dim) - Higher quality
- `all-minilm` (384 dim) - Faster, smaller

Pull any model before use:
```bash
ollama pull <model-name>
```
