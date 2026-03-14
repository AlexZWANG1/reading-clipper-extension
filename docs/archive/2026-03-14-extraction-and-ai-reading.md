# Extraction Pipeline & AI Reading Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable PDF/DOCX upload via sidecar Docling pipeline, fix Focus Lens, and add AI-powered reading assistant (summary + Q&A) to the reader.

**Architecture:** Node.js backend receives file uploads (multer), delegates to Python sidecar for extraction/chunking/embedding. AI analysis uses OpenAI-compatible proxy via new `callChatCompletion` helper. Frontend adds upload UI rework and AI panel in reader sidebar.

**Tech Stack:** Node.js/Express, multer, Python/FastAPI sidecar, Docling, Ollama (nomic-embed-text), OpenAI-compatible API (gpt-5.4), React, Supabase.

**Spec:** `docs/superpowers/specs/2026-03-14-extraction-and-ai-reading-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `reading-cards-backend/src/routes/v2/materials.mjs` | Add `/upload` endpoint with multer |
| Modify | `reading-cards-backend/src/services/aiRuntime.mjs` | Add `callChatCompletion()` helper |
| Create | `reading-cards-backend/src/routes/v2/analyze.mjs` | AI analysis endpoint (`/materials/:id/analyze`) |
| Modify | `reading-cards-backend/.gitignore` or root `.gitignore` | Add `uploads/` |
| Modify | `web-app/src/lib/api.js` | Add `materialsApi.upload()` and `materialsApi.analyze()` |
| Modify | `web-app/src/pages/MaterialsPage.jsx` | Rework file upload to use FormData |
| Create | `web-app/src/components/Reader/AIPanel.jsx` | AI insights + Q&A sidebar panel |
| Modify | `web-app/src/pages/MaterialReaderPage.jsx` | Add AI panel toggle and integration |

---

## Chunk 1: Document Upload Pipeline

### Task 1: Backend — `/upload` endpoint

**Files:**
- Modify: `reading-cards-backend/src/routes/v2/materials.mjs`
- Modify: root `.gitignore`

- [ ] **Step 1: Create uploads directory and add to .gitignore**

```bash
mkdir -p reading-cards-backend/uploads
echo "uploads/" >> .gitignore
```

- [ ] **Step 2: Add multer + `/upload` route to materials.mjs**

At the top of `materials.mjs`, add:
```javascript
import multer from 'multer';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.docx', '.pptx', '.txt', '.md'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});
```

Then add the route before `export default router`:
```javascript
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded or unsupported file type' });
    }

    const userId = req.user.id;
    const { topic_id } = req.body;
    const filePath = req.file.path;
    const originalName = req.file.originalname;
    const title = path.basename(originalName, path.extname(originalName));

    // Create material record
    const { data: material, error } = await supabase
      .from('materials')
      .insert({
        user_id: userId,
        title,
        source_type: 'file',
        file_path: filePath,
        topic_id: topic_id || null,
        ingestion_status: 'pending',
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to create material' });
    }

    // Fire-and-forget sidecar call
    fetch(`${SIDECAR_URL}/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sidecar-Key': SIDECAR_API_KEY,
      },
      body: JSON.stringify({
        user_id: userId,
        material_id: material.id,
        source_type: 'file',
        file_path: filePath,
        topic_id: topic_id || null,
      }),
    }).catch((err) => {
      console.error('Sidecar file ingestion failed:', err.message);
      supabase
        .from('materials')
        .update({ ingestion_status: 'failed', ingestion_error: err.message })
        .eq('id', material.id)
        .then();
    });

    res.json({ ok: true, material_id: material.id, title, status: 'pending' });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 3: Test upload endpoint manually**

```bash
curl -X POST http://localhost:3000/api/v2/materials/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@test.pdf"
```

- [ ] **Step 4: Commit**

```bash
git add reading-cards-backend/src/routes/v2/materials.mjs .gitignore
git commit -m "feat: add /upload endpoint for document import via sidecar"
```

---

### Task 2: Web App — Rework file upload UI

**Files:**
- Modify: `web-app/src/lib/api.js`
- Modify: `web-app/src/pages/MaterialsPage.jsx`

- [ ] **Step 1: Add `materialsApi.upload` to api.js**

Add to the `materialsApi` object in `api.js`:
```javascript
upload: async (file, topicId) => {
  const token = getAccessToken();
  const formData = new FormData();
  formData.append('file', file);
  if (topicId) formData.append('topic_id', topicId);

  const response = await fetch(`${API_BASE}/v2/materials/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    // Do NOT set Content-Type — browser sets multipart boundary automatically
    body: formData,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(data.error || 'Upload failed', response.status, data);
  }
  return response.json();
},
```

- [ ] **Step 2: Update `handleUpload` and file input in MaterialsPage.jsx**

Replace the existing `source_type: 'file'` branch inside `handleUpload` to call `materialsApi.upload(uploadFile)` instead of reading `uploadFile.text()` and posting JSON. The URL and text branches remain unchanged.

Also update the file input `accept` attribute from `".txt,.md,.pdf"` to `".pdf,.docx,.pptx,.txt,.md"`.

Add client-side file size validation before upload:
```javascript
if (uploadFile.size > 50 * 1024 * 1024) {
  toast.error('File exceeds 50MB limit');
  return;
}
```

Add drag-and-drop support: wrap the materials list area with `onDragOver` (prevent default) and `onDrop` handlers that extract the dropped file and call `materialsApi.upload()`.

- [ ] **Step 3: Add status polling for pending materials**

Add a `useEffect` that polls `materialsApi.get(id)` every 5 seconds for materials in `pending`/`processing` status. Filter `materials` state for those with `ingestion_status` of `pending` or `processing`. For each, set up a `setInterval` polling their status. Clear intervals on unmount or when status changes to `completed`/`failed`.

- [ ] **Step 4: Build and verify**

```bash
cd web-app && npx vite build
```

- [ ] **Step 5: Commit**

```bash
git add web-app/src/lib/api.js web-app/src/pages/MaterialsPage.jsx
git commit -m "feat: rework file upload to use FormData + add status polling"
```

---

## Chunk 2: Focus Lens Verification

### Task 3: Verify end-to-end Focus Lens flow

**Files:** No changes expected — verification only.

- [ ] **Step 1: Import a URL and verify chunks are created**

```bash
# Import a test URL via backend
curl -X POST http://localhost:3000/api/v2/materials/ingest \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"source_type":"url","url":"https://paulgraham.com/greatwork.html"}'

# Wait for sidecar to process, then check chunks
curl http://localhost:3000/api/v2/materials/<id>/chunks \
  -H "Authorization: Bearer <token>"
```

Verify: chunks array is non-empty, each chunk has `content`, `chunk_index`, `embedding` fields.

- [ ] **Step 2: Test semantic search**

```bash
curl -X POST http://localhost:3000/api/v2/search/semantic \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"query":"what makes great work","material_id":"<id>","limit":5}'
```

Verify: returns results with chunk IDs and similarity scores. If `search_chunks_hybrid` RPC fails, the fallback `ilike` search should still return results.

- [ ] **Step 3: If RPC function missing, document the issue**

If `search_chunks_hybrid` doesn't exist in Supabase, the existing fallback in `search.mjs` (lines 48-74) handles this — verify the fallback path works.

- [ ] **Step 4: Commit any fixes if needed**

---

## Chunk 3: AI Analysis Backend

### Task 4: Add `callChatCompletion` to aiRuntime.mjs

**Files:**
- Modify: `reading-cards-backend/src/services/aiRuntime.mjs`

- [ ] **Step 1: Add the completion helper function**

Append to `aiRuntime.mjs` before the final `validateRuntimeConfig()` call:

```javascript
/**
 * Call chat completion API (OpenAI-compatible)
 * @param {Array} messages - Chat messages array
 * @param {Object} options - { model, temperature, max_tokens, response_format }
 * @returns {Object} Parsed JSON response from the model
 */
export async function callChatCompletion(messages, options = {}) {
  const {
    model = process.env.OPENAI_MODEL || 'gpt-5.4',
    temperature = 0.3,
    max_tokens = 4000,
    json_mode = false,
  } = options;

  const endpoint = buildEndpoint('openai', 'chat');
  const apiKey = getApiKey('openai');
  const headers = buildHeaders('openai', apiKey);

  const body = { model, messages, temperature, max_tokens };
  if (json_mode) {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`AI call failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  let content = data.choices?.[0]?.message?.content || '';

  if (json_mode) {
    // Strip markdown fences if present
    content = content.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '');
    return JSON.parse(content);
  }

  return { text: content };
}
```

- [ ] **Step 2: Commit**

```bash
git add reading-cards-backend/src/services/aiRuntime.mjs
git commit -m "feat: add callChatCompletion helper to aiRuntime"
```

---

### Task 5: Create `/analyze` endpoint

**Files:**
- Create: `reading-cards-backend/src/routes/v2/analyze.mjs`
- Modify: `reading-cards-backend/src/routes/v2/index.mjs` (or wherever routes are mounted)

- [ ] **Step 1: Create analyze.mjs**

```javascript
import express from 'express';
import { supabaseAdmin } from '../../config/supabase.mjs';
import { requireAuth } from '../../middleware/auth.mjs';
import { callChatCompletion } from '../../services/aiRuntime.mjs';

const router = express.Router();
const supabase = supabaseAdmin;

const SIDECAR_URL = process.env.SIDECAR_URL || 'http://127.0.0.1:8100';
const SIDECAR_API_KEY = process.env.SIDECAR_API_KEY;
const MAX_CONTEXT_CHARS = 30000;

router.post('/:id/analyze', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { mode, question } = req.body;
    const userId = req.user.id;

    if (!['summary', 'qa'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be summary or qa' });
    }
    if (mode === 'qa' && !question) {
      return res.status(400).json({ error: 'question required for qa mode' });
    }

    // Fetch material
    const { data: material } = await supabase
      .from('materials')
      .select('id, title, text_content, article_html')
      .eq('id', id).eq('user_id', userId).single();

    if (!material) {
      return res.status(404).json({ error: 'Material not found' });
    }

    if (mode === 'summary') {
      // Get article text — prefer text_content, fallback to concatenating chunks
      let articleText = material.text_content;
      if (!articleText) {
        const { data: chunks } = await supabase
          .from('chunks').select('content').eq('material_id', id)
          .order('chunk_index', { ascending: true });
        articleText = (chunks || []).map(c => c.content).join('\n\n');
      }
      if (!articleText) {
        return res.status(400).json({ error: 'No text content available for analysis' });
      }

      const truncated = articleText.slice(0, MAX_CONTEXT_CHARS);
      const result = await callChatCompletion([
        { role: 'system', content: 'You are a reading assistant. Respond in valid JSON.' },
        { role: 'user', content: `Analyze this article and provide:\n1. A 2-3 sentence summary\n2. 3-5 key arguments/claims (with the exact quote from the article)\n3. Questions worth exploring further\n\nRespond in the same language as the article.\n\nJSON format: { "summary": "...", "key_points": [{ "claim": "...", "quote": "exact text", "significance": "..." }], "questions": ["..."] }\n\nArticle:\n${truncated}` },
      ], { json_mode: true, max_tokens: 4000 });

      return res.json({ mode: 'summary', result });
    }

    if (mode === 'qa') {
      // RAG: embed question → search chunks → build prompt
      let chunks = [];
      try {
        const embedResp = await fetch(`${SIDECAR_URL}/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Sidecar-Key': SIDECAR_API_KEY },
          body: JSON.stringify({ texts: [question] }),
        });
        if (embedResp.ok) {
          const { embeddings } = await embedResp.json();
          const { data } = await supabase.rpc('search_chunks_hybrid', {
            query_embedding: embeddings[0],
            query_text: question,
            match_count: 5,
            min_similarity: 0.3,
            p_user_id: userId,
            p_material_id: id,
          });
          chunks = data || [];
        }
      } catch (err) {
        console.warn('RAG search failed, falling back to full text:', err.message);
      }

      // Fallback: if no chunks from search, use text_content
      let context;
      if (chunks.length > 0) {
        context = chunks.map((c, i) => `[Passage ${i + 1}, chunk_id: ${c.id}]\n${c.content}`).join('\n\n');
      } else {
        const text = material.text_content || '';
        context = text.slice(0, MAX_CONTEXT_CHARS);
      }

      const result = await callChatCompletion([
        { role: 'system', content: 'You are a reading assistant. Answer based on the article. Respond in valid JSON.' },
        { role: 'user', content: `Answer this question based on the article content below.\nCite specific passages by including exact quotes.\nIf the article doesn\'t address this, say so.\nRespond in the same language as the question.\n\nJSON format: { "answer": "...", "sources": [{ "chunk_id": "id if available", "quote": "exact text" }] }\n\nQuestion: ${question}\n\nArticle passages:\n${context}` },
      ], { json_mode: true, max_tokens: 2000 });

      return res.json({ mode: 'qa', result });
    }
  } catch (err) {
    console.error('Analyze error:', err);
    res.status(500).json({ ok: false, error: `AI analysis failed: ${err.message}` });
  }
});

export default router;
```

- [ ] **Step 2: Mount the route in server.mjs**

In `reading-cards-backend/src/server.mjs`, add the import at the top (after the other v2 route imports):
```javascript
import analyzeRouterV2 from "./routes/v2/analyze.mjs";
```

Then add the route mount after the existing materials route (after line `app.use("/api/v2/materials", materialsRouterV2);`):
```javascript
app.use("/api/v2/materials", analyzeRouterV2);
```

- [ ] **Step 3: Test the endpoint**

```bash
curl -X POST http://localhost:3000/api/v2/materials/<id>/analyze \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"mode":"summary"}'
```

- [ ] **Step 4: Commit**

```bash
git add reading-cards-backend/src/routes/v2/analyze.mjs reading-cards-backend/src/routes/v2/
git commit -m "feat: add /analyze endpoint for AI summary and Q&A"
```

---

## Chunk 4: AI Panel Frontend

### Task 6: Create AIPanel component

**Files:**
- Create: `web-app/src/components/Reader/AIPanel.jsx`
- Modify: `web-app/src/lib/api.js`

- [ ] **Step 1: Add `materialsApi.analyze` to api.js**

```javascript
analyze: async (id, mode, question) => {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE}/v2/materials/${id}/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ mode, question }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(data.error || 'Analysis failed', response.status, data);
  }
  return response.json();
},
```

- [ ] **Step 2: Build the AI Panel component**

Component signature: `AIPanel({ materialId, onHighlightQuote })`

Key state: `insights` (null), `qaHistory` ([]), `loading` (false), `error` (null)

Two sections:
- **Insights**: A "Generate Insights" button → calls `materialsApi.analyze(materialId, 'summary')` → renders summary, key_points (with clickable quotes), questions
- **Ask**: Text input + submit → calls `materialsApi.analyze(materialId, 'qa', question)` → renders answer with source quotes

Each quote is clickable and calls `onHighlightQuote(quoteText)` callback to highlight in the article.

Shows loading spinner during AI calls (can take 10-30s). Shows error state with retry button on failure.

- [ ] **Step 3: Commit**

```bash
git add web-app/src/components/Reader/AIPanel.jsx web-app/src/lib/api.js
git commit -m "feat: add AIPanel component and analyze API for reader sidebar"
```

---

### Task 7: Integrate AIPanel into MaterialReaderPage

**Files:**
- Modify: `web-app/src/pages/MaterialReaderPage.jsx`

- [ ] **Step 1: Add AI panel toggle to MaterialReaderPage header**

Add a "AI" button next to the Focus Lens button in the header. Clicking toggles `showAIPanel` state.

- [ ] **Step 2: Render AIPanel in the right sidebar area**

When `showAIPanel` is true, render `<AIPanel>` alongside or replacing `<CardsSidebar>`. Wire `onHighlightQuote` to set card highlights (reuse existing `cardHighlights` / `activeCardHighlightId` state).

- [ ] **Step 3: Build and verify**

```bash
cd web-app && npx vite build
```

- [ ] **Step 4: Commit**

```bash
git add web-app/src/pages/MaterialReaderPage.jsx
git commit -m "feat: integrate AI panel into material reader"
```

---

## Chunk 5: Integration Verification

### Task 8: End-to-end test

- [ ] **Step 1: Upload a PDF via Web App** — verify it appears in materials list, status progresses to completed
- [ ] **Step 2: Open the PDF in reader** — verify content renders with headings and structure
- [ ] **Step 3: Test Focus Lens** — type a question, verify orange highlights appear on relevant passages
- [ ] **Step 4: Test AI Insights** — click AI button, click Generate Insights, verify summary and key points appear with clickable quotes
- [ ] **Step 5: Test AI Q&A** — ask a question about the article, verify answer appears with source quotes
- [ ] **Step 6: Test URL import still works** — import a URL via browser extension, verify full flow unchanged
