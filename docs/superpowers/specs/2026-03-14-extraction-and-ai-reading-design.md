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
- **AI backend**: OpenAI proxy (Easy CLI, port 8080, gpt-5.4) for generation; Ollama (nomic-embed-text) for embeddings.

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
- Use `multer` to save to `uploads/` directory
- Validate file type: `.pdf`, `.docx`, `.pptx`, `.txt`, `.md` (max 50MB)
- Create material record with `source_type: 'file'`, `ingestion_status: 'pending'`
- Fire-and-forget call to sidecar `/ingest` with `source_type: 'file'` and `file_path`
- Return `{ ok: true, material_id, title, status: 'pending' }`
- Install `multer` as a dependency

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

#### 4. Web App — Upload UI

Add to the materials list page (`/materials`):

- "Upload Document" button next to the page header
- Click opens a file picker dialog (accept: `.pdf,.docx,.pptx,.txt,.md`)
- Also support drag-and-drop onto the materials list area
- On file select: POST to `/api/v2/materials/upload`, show upload progress
- After upload: show card in materials list with status badge (pending → processing → completed)
- Click the card to open in reader once completed
- File size limit: 50MB, with client-side validation

#### 5. Sidecar file access

Backend and sidecar run on the same machine. The `file_path` sent to sidecar is an absolute path to the uploaded file in `uploads/`. Sidecar reads it directly.

Create `uploads/` directory in backend root. Add to `.gitignore`.

## Part 2: Fix Focus Lens (Semantic Highlight)

Focus Lens already has frontend code but was non-functional because sidecar wasn't running. Now that sidecar is live:

### Current flow (already implemented)

1. User types a question in the Focus Lens input
2. Frontend calls `POST /api/v2/search/semantic` with `{ query, material_id }`
3. Backend calls sidecar `/embed` to generate query embedding
4. Backend runs `search_chunks_hybrid` Postgres RPC (vector similarity search)
5. Returns matching chunk IDs
6. Frontend highlights those chunks' text in the article via `ReaderContent.jsx`

### Required fix

- Verify the Postgres RPC function `search_chunks_hybrid` exists and works with the current schema
- Test end-to-end: import a URL → verify chunks are created → run a Focus Lens query → verify highlights appear
- If the RPC function has issues, fall back to the existing `ilike` text search (already coded)

### No code changes expected — just verification and testing.

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
  3. Call OpenAI proxy (gpt-5.4 via Easy CLI, port 8080)
  4. Return structured response
  ▼
Frontend renders AI panel in reader sidebar
```

### Three AI interaction modes

#### Mode 1: Proactive Insights (summary)

Triggered when user clicks an "AI Insights" button in the reader toolbar.

**Prompt structure:**
```
You are a reading assistant. Analyze this article and provide:
1. A 2-3 sentence summary
2. 3-5 key arguments/claims (with the exact quote from the article)
3. Questions worth exploring further

Article:
{text_content, truncated to ~8000 tokens}
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
4. Call OpenAI proxy
5. Return answer + source chunk IDs (for highlighting)

**Prompt structure:**
```
Answer this question based on the article content below.
Cite specific passages. If the article doesn't address this, say so.

Question: {user_question}

Relevant passages:
{top-5 chunks}
```

#### Mode 3: Card connection

When user has existing cards, the AI can find connections:

1. Fetch user's recent cards from the same topic
2. Include card snippets in prompt
3. Ask AI to identify connections between the article and existing cards

This mode is lower priority and can be implemented after modes 1 and 2.

### Frontend: AI Panel

Add to `MaterialReaderPage.jsx`:

- A toggle button in the header bar (next to Focus Lens): "AI Assistant" with a sparkle icon
- Clicking it opens a right-side panel (replaces or sits alongside the cards sidebar)
- Panel has three tabs/sections:
  - **Insights**: Shows summary + key points (with clickable quotes that highlight in article)
  - **Ask**: Chat input where user can ask questions about the article
  - **Cards**: Shows connections to existing cards (future)
- Each insight's quote is clickable → scrolls to and highlights that passage in the article

### Backend: New endpoint

`POST /api/v2/materials/:id/analyze`

Request:
```json
{
  "mode": "summary" | "qa",
  "question": "optional, required for qa mode"
}
```

Response:
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

Or for Q&A:
```json
{
  "mode": "qa",
  "result": {
    "answer": "...",
    "sources": [{ "chunk_id": "...", "quote": "..." }]
  }
}
```

### AI Provider

Uses the existing `aiRuntime.mjs` which connects to OpenAI proxy at `localhost:8080` with model `gpt-5.4`. No new AI integration needed.

## Implementation Order

1. **Backend: multer + `/upload` endpoint** — unblocks document import
2. **Web App: Upload UI** — user-facing document upload
3. **Verify Focus Lens end-to-end** — confirm sidecar → embedding → search → highlight works
4. **Backend: `/analyze` endpoint** — AI summary and Q&A
5. **Web App: AI Panel** — reader sidebar with insights and Q&A
6. **Integration test** — upload PDF → read in reader → AI analysis → highlight quotes

## Out of Scope

- Browser extension PDF import (user said Web App upload only)
- Auto-trigger AI analysis on import (user chose on-demand)
- Card connection mode (future iteration)
- Cloud file storage (files stored locally in `uploads/`)
- OCR for scanned PDFs (Docling handles this if the PDF has text layers)
