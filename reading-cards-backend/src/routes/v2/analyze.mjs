import express from 'express';
import { supabaseAdmin } from '../../config/supabase.mjs';
import { requireAuth } from '../../middleware/auth.mjs';
import { createAIClientConfig, callChatAPI } from '../../services/aiClient.mjs';

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

    const aiConfig = await createAIClientConfig(userId, supabase);

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
      const messages = [
        { role: 'system', content: 'You are a reading assistant. Respond in valid JSON.' },
        { role: 'user', content: `Analyze this article and provide:\n1. A 2-3 sentence summary\n2. 3-5 key arguments/claims (with the exact quote from the article)\n3. Questions worth exploring further\n\nRespond in the same language as the article.\n\nJSON format: { "summary": "...", "key_points": [{ "claim": "...", "quote": "exact text", "significance": "..." }], "questions": ["..."] }\n\nArticle:\n${truncated}` },
      ];
      const response = await callChatAPI(aiConfig, messages, {
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      });
      let content = response.choices?.[0]?.message?.content || '';
      content = content.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '');
      let result;
      try {
        result = JSON.parse(content);
      } catch (parseErr) {
        console.error('Failed to parse AI summary response:', parseErr.message);
        return res.status(502).json({ error: 'AI returned invalid JSON', raw: content.slice(0, 200) });
      }

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

      const qaMessages = [
        { role: 'system', content: 'You are a reading assistant. Answer based on the article. Respond in valid JSON.' },
        { role: 'user', content: `Answer this question based on the article content below.\nCite specific passages by including exact quotes.\nIf the article doesn\'t address this, say so.\nRespond in the same language as the question.\n\nJSON format: { "answer": "...", "sources": [{ "chunk_id": "id if available", "quote": "exact text" }] }\n\nQuestion: ${question}\n\nArticle passages:\n${context}` },
      ];
      const qaResponse = await callChatAPI(aiConfig, qaMessages, {
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      });
      let qaContent = qaResponse.choices?.[0]?.message?.content || '';
      qaContent = qaContent.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '');
      let result;
      try {
        result = JSON.parse(qaContent);
      } catch (parseErr) {
        console.error('Failed to parse AI QA response:', parseErr.message);
        return res.status(502).json({ error: 'AI returned invalid JSON', raw: qaContent.slice(0, 200) });
      }

      return res.json({ mode: 'qa', result });
    }
  } catch (err) {
    console.error('Analyze error:', err);
    res.status(500).json({ ok: false, error: `AI analysis failed: ${err.message}` });
  }
});

export default router;
