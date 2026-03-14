# Extraction Pipeline Fix & AI-Assisted Reading Design

Date: 2026-03-14

## Problem Statement

Two systemic issues limit the reading experience:

1. **Broken document extraction pipeline** — The Node.js `docExtractor.mjs` is an empty stub. The Python sidecar has a full Docling implementation but was never connected (Python/Ollama weren't installed). Users cannot import PDF/DOCX files.

2. **AI-assisted reading is non-functional** — Focus Lens (semantic highlight) depends on sidecar embeddings which weren't available. Beyond that, there's no AI summarization, Q&A, or insight generation.

## Design Decisions

- **Architecture**: Node.js handles URL/HTML extraction; Python sidecar handles document parsing, chunking, and embedding. No duplication.
- **Document upload**: Via Web App upload UI (not browser extension).
- **AI features**: Highlight + Q&A + proactive insights, triggered on-demand when user opens reader and clicks a button.
- **AI backend**: Uses `aiRuntime.mjs` configuration (reads from env vars `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`) for generation; Ollama (nomic-embed-text) for embeddings.

## Part 1: Document Upload Pipeline

### Architecture

```
Web App (upload UI)
  │ POST multipart/form-data
  ▼
Backend API (/api/v2/materials/upload)
  │ multer saves to uploads/
  │ creates material record (status: pending)
  │ calls sidecar /ingest with file_path
  ▼
Sidecar (Python, port 8100)
  │ Docling: PDF/DOCX/PPTX → structured text + headings + page/bbox
  │ Chunker: structure-aware splitting (HierarchicalChunker)
  │ Embedder: nomic-embed-text via Ollama
  │ DB: writes chunks with embeddings to Supabase
  │ Updates material status → completed
  ▼
Reader displays article with full chunk support
```

### Changes Required

#### 1. Backend API — `materials.mjs`

Add a new `/upload` endpoint:

- Accept `multipart/form-data` with a `file` field
- `multer` is already in `package.json` (`multer@^2.0.2`) — no new install needed
- Save uploaded file to `uploads/` directory with a unique filename (uuid + original extension)
- Validate file type: `.pdf`, `.docx`, `.pptx`, `.txt`, `.md` (max 50MB)
- Create material record with `source_type: 'file'`, `ingestion_status: 'pending'`, `title` from filename
- Fire-and-forget call to sidecar `/ingest` with `source_type: 'file'` and absolute `file_path`
- Graceful degradation: if sidecar call fails, update material status to `failed` with error message
- Return `{ ok: true, material_id, title, status: 'pending' }`
- Add `uploads/` to root `.gitignore`

#### 2. Node.js docExtractor cleanup

- `content-fetch/src/extractors/docExtractor.mjs`: Keep as-is (unused, no harm)
- `content-fetch/server.mjs` `/extract/document`: Leave unchanged (sidecar handles this now)
- No code deletion needed — just don't route through it

#### 3. Sidecar — already implemented

The sidecar's `/ingest` endpoint already handles `source_type: 'file'`:
- `pipeline.py` dispatches to `doc_extractor.py`
- `doc_extractor.py` uses Docling (with pymupdf fallback)
- `chunker.py` uses HierarchicalChunker for structure-aware chunks
- `embedder.py` generates embeddings via Ollama
- `db.py` writes chunks and updates material status

No sidecar code changes needed.

Note: if Docling fails, the fallback (`_extract_basic`) only handles `.txt`, `.md`, `.pdf` (via pymupdf). `.docx` and `.pptx` will fail in fallback mode. This is acceptable since Docling is installed and functional.

#### 4. Web App — Upload UI

The existing `MaterialsPage.jsx` already has a file upload tab, but it uses `file.text()` to read files client-side and sends content as a JSON string — this does not work for binary formats (PDF/DOCX). Must be reworked:

- Replace the existing `handleUpload` function to use `FormData`-based upload
- POST `FormData` to the new `/api/v2/materials/upload` endpoint
- **Important**: The existing `request()` helper in `api.js` hardcodes `Content-Type: application/json`. The upload function should use `fetch` directly (bypass `request()`), omitting `Content-Type` so the browser sets `multipart/form-data` with the correct boundary. This matches the pattern already used by `rssApi.importOpml` and `cardsApi.uploadFile`.
- Accept: `.pdf,.docx,.pptx,.txt,.md`
- Also support drag-and-drop onto the materials list area
- File size limit: 50MB, with client-side validation
- After upload: show card in materials list with status badge
- Poll for status updates every 5 seconds while material is in `pending`/`processing` state
- Click the card to open in reader once completed

#### 5. Sidecar file access

Backend and sidecar run on the same machine. The `file_path` sent to sidecar is an absolute path to the uploaded file in `uploads/`. Sidecar reads it directly.

## Part 2: Fix Focus Lens (Semantic Highlight)

Focus Lens already has frontend code but was non-functional because sidecar wasn't running. Now that sidecar is live:

### Current flow (already implemented)

1. User types a question in the Focus Lens input
2. Frontend calls `POST /api/v2/search/semantic` with `{ query, material_id }`
3. Backend calls sidecar `/embed` to generate query embedding
4. Backend runs `search_chunks_hybrid` Postgres RPC (vector similarity search)
5. Returns matching chunk IDs
6. Frontend highlights those chunks' text in the article via `ReaderContent.jsx`

### Required verification

- Verify the Postgres RPC function `search_chunks_hybrid` exists and works with the current schema
- Test end-to-end: import a URL → verify chunks are created → run a Focus Lens query → verify highlights appear
- If the RPC function has issues, fall back to the existing `ilike` text search (already coded in `search.mjs`)

### Acceptance criteria

Focus Lens is verified when:
1. `search_chunks_hybrid` RPC executes without error
2. Query returns chunk IDs that exist in the material
3. Those chunk IDs produce visible orange highlights in the reader

## Part 3: AI-Assisted Reading — Q&A and Insights

### Architecture

```
User clicks "AI Analysis" button in reader
  │
  ▼
Frontend sends POST /api/v2/materials/:id/analyze
  │ { mode: 'summary' | 'qa', question?: string }
  ▼
Backend:
  1. Fetch material text_content and chunks from DB
  2. Build prompt with article content as context
  3. Call AI via completion helper (see below)
  4. Return structured response
  ▼
Frontend renders AI panel in reader sidebar
```

### New: AI completion helper

`aiRuntime.mjs` currently only exports config utilities (`buildEndpoint`, `getApiKey`, `buildHeaders`). A new `callChatCompletion(messages, options)` function must be added:

```javascript
async function callChatCompletion(messages, options = {}) {
  const {
    model = process.env.OPENAI_MODEL || 'gpt-5.4',
    temperature = 0.3,
    max_tokens = 2000,
    response_format = { type: 'json_object' },
  } = options;

  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model, messages, temperature, max_tokens, response_format }),
  });

  const data = await response.json();
  // Parse and validate JSON response, strip markdown fences if present
  let content = data.choices?.[0]?.message?.content || '';
  content = content.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '');
  return JSON.parse(content);
}
```

- Uses env vars via existing configuration (not hardcoded ports/models)
- Uses `response_format: { type: "json_object" }` for reliable structured output
- Strips markdown code fences as a safety measure before JSON.parse
- Wraps in try/catch at call sites with graceful error response

### Token management

- **Summary mode**: Use `text_content` (or concatenate chunks if `text_content` is null). Truncate to ~30,000 characters (~8,000 tokens). Estimation: `Math.floor(text.length / 4)` as rough token count.
- **Q&A mode**: Use top-5 chunks from semantic search (each chunk ≤ 2000 chars, so ≤ 10,000 chars total). Well within context limits.
- **If `text_content` is empty** (e.g., file-sourced materials): Concatenate chunk contents in order up to the 30,000 character limit.

### Two AI interaction modes (v1)

#### Mode 1: Proactive Insights (summary)

Triggered when user clicks an "AI Insights" button in the reader toolbar.

**Prompt structure:**
```
You are a reading assistant. Analyze this article and provide:
1. A 2-3 sentence summary
2. 3-5 key arguments/claims (with the exact quote from the article)
3. Questions worth exploring further

Respond in the same language as the article.

Article:
{text_content, truncated to ~30000 chars}
```

**Response format:**
```json
{
  "summary": "...",
  "key_points": [
    { "claim": "...", "quote": "exact text from article", "significance": "..." }
  ],
  "questions": ["...", "..."]
}
```

The `quote` fields are used to highlight corresponding passages in the article (reusing the existing highlight infrastructure in `ReaderContent.jsx`).

#### Mode 2: Q&A (ask about the article)

User types a question in the AI panel. Backend uses RAG:

1. Generate question embedding via sidecar `/embed`
2. Search top-5 relevant chunks via `search_chunks_hybrid`
3. Build prompt with those chunks as context + the question
4. Call AI via `callChatCompletion`
5. Return answer + source chunk IDs (for highlighting)

**Prompt structure:**
```
Answer this question based on the article content below.
Cite specific passages by including exact quotes. If the article doesn't address this, say so.
Respond in the same language as the question.

Question: {user_question}

Relevant passages:
{top-5 chunks with chunk_id labels}
```

#### Mode 3: Card connection (future, out of scope for v1)

### Frontend: AI Panel

Add to `MaterialReaderPage.jsx`:

- A toggle button in the header bar (next to Focus Lens): "AI" with a sparkle icon
- Clicking it opens a right-side panel (replaces or sits alongside the cards sidebar)
- Panel sections:
  - **Insights**: Button to trigger → shows loading spinner → shows summary + key points (with clickable quotes that highlight in article). AI calls can take 10-30 seconds, so show a clear loading state.
  - **Ask**: Chat input where user can ask questions about the article. Shows answer with source quotes highlighted.
- Each insight's quote is clickable → scrolls to and highlights that passage in the article
- Error state: If AI call fails, show "AI analysis unavailable" with retry button
- Use a longer fetch timeout (60 seconds) for AI calls

### Backend: New endpoint

`POST /api/v2/materials/:id/analyze`

Request:
```json
{
  "mode": "summary" | "qa",
  "question": "optional, required for qa mode"
}
```

Response (summary):
```json
{
  "mode": "summary",
  "result": {
    "summary": "...",
    "key_points": [{ "claim": "...", "quote": "...", "significance": "..." }],
    "questions": ["..."]
  }
}
```

Response (Q&A):
```json
{
  "mode": "qa",
  "result": {
    "answer": "...",
    "sources": [{ "chunk_id": "...", "quote": "..." }]
  }
}
```

Error response:
```json
{
  "ok": false,
  "error": "AI analysis failed: <reason>"
}
```

## Implementation Order

1. **Backend: `/upload` endpoint with multer** — unblocks document import
2. **Web App: Rework upload UI** — FormData-based upload replacing the broken `file.text()` approach
3. **Verify Focus Lens end-to-end** — confirm sidecar → embedding → search → highlight works
4. **Backend: `callChatCompletion` helper in `aiRuntime.mjs`** — foundation for AI features
5. **Backend: `/analyze` endpoint** — AI summary and Q&A
6. **Web App: AI Panel in reader** — sidebar with insights and Q&A
7. **Integration test** — upload PDF → read in reader → Focus Lens → AI analysis → highlight quotes

## Out of Scope

- Browser extension PDF import (user said Web App upload only)
- Auto-trigger AI analysis on import (user chose on-demand)
- Card connection mode (future iteration)
- Cloud file storage (files stored locally in `uploads/`)
- OCR for scanned PDFs (Docling handles this if the PDF has text layers)
