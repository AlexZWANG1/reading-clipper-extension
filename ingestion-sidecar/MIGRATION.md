# Local Embeddings Migration Summary

## What Changed

This migration removes all OpenAI API dependencies for embeddings and switches to local Ollama.

### Files Modified

1. **`src/ingestion/config.py`**
   - Removed: `embedding_provider`, `openai_api_key`, `openai_base_url`, `openai_real_api_key`
   - Added: `embeddings_base_url`, `embeddings_model`, `embeddings_api_key`, `embeddings_dimensions`
   - Default: Ollama at `http://127.0.0.1:11434/v1` with `nomic-embed-text` model

2. **`src/ingestion/embedder.py`**
   - Completely rewritten
   - Removed: Esperanto integration, OpenAI proxy fallback, OpenAI direct fallback
   - Added: Simple, direct call to OpenAI-compatible embeddings endpoint
   - Fail-fast with clear error messages (no silent fallbacks)
   - No external API calls to `api.openai.com`

3. **`src/ingestion/api.py`**
   - Updated `/embed` endpoint to use `get_embedding_model_name()`
   - Simplified error handling (removed OpenAI-specific quota checks)

4. **`.env` and `.env.example`**
   - Updated configuration to use Ollama settings
   - Removed all OpenAI API key references

### New Files

1. **`TESTING.md`** - Comprehensive testing guide with troubleshooting
2. **`test-embeddings.sh`** - Automated test script

## Key Improvements

### Before
- Multiple fallback layers: Esperanto → Proxy → OpenAI Direct
- Silent failures and retries
- External API dependency (api.openai.com)
- Quota limits and billing issues
- Complex error handling

### After
- Single, direct call to local Ollama
- Fail-fast with clear error messages
- No external API dependencies
- No quota limits (runs locally)
- Simple, maintainable code

## Configuration

```env
# Local Ollama (default)
EMBEDDINGS_BASE_URL=http://127.0.0.1:11434/v1
EMBEDDINGS_MODEL=nomic-embed-text
EMBEDDINGS_API_KEY=ollama
EMBEDDINGS_DIMENSIONS=768
```

## Testing

See `TESTING.md` for detailed testing instructions.

Quick test:
```bash
# 1. Pull model
ollama pull nomic-embed-text

# 2. Test Ollama directly
curl http://127.0.0.1:11434/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model":"nomic-embed-text","input":["test"]}'

# 3. Start sidecar
python run.py

# 4. Test sidecar
curl -X POST http://127.0.0.1:8100/embed \
  -H "Content-Type: application/json" \
  -H "X-Sidecar-Key: rc-sidecar-2026" \
  -d '{"texts":["test"]}'
```

## Migration Notes

- **No backward compatibility**: Old OpenAI-based configuration will not work
- **Ollama required**: Must have Ollama installed and running
- **Model must be pulled**: Run `ollama pull nomic-embed-text` before use
- **Dimension change**: nomic-embed-text uses 768 dimensions (was 1536 for OpenAI)
- **Database compatibility**: Existing embeddings in database remain valid (different model, but same vector type)

## Troubleshooting

### "Failed to connect to embeddings endpoint"
→ Start Ollama: `ollama serve`

### "Embeddings API returned 404"
→ Pull model: `ollama pull nomic-embed-text`

### "Invalid response format"
→ Update Ollama to latest version

See `TESTING.md` for more details.
