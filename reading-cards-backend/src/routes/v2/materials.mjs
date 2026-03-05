import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../../middleware/auth.mjs';

const router = express.Router();

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Sidecar config
const SIDECAR_URL = process.env.SIDECAR_URL || 'http://127.0.0.1:8100';
const SIDECAR_API_KEY = process.env.SIDECAR_API_KEY || 'rc-sidecar-2026';

/**
 * POST /v2/materials/ingest
 * Trigger content ingestion (extract → chunk → embed → store)
 */
router.post('/ingest', requireAuth, async (req, res) => {
  try {
    const { source_type, url, file_path, text, topic_id, title } = req.body;
    const userId = req.user.id; // from auth middleware

    if (!source_type || !['url', 'file', 'text'].includes(source_type)) {
      return res.status(400).json({ error: 'Invalid source_type' });
    }

    // Validate source data
    if (source_type === 'url' && !url) {
      return res.status(400).json({ error: 'url required for source_type=url' });
    }
    if (source_type === 'file' && !file_path) {
      return res.status(400).json({ error: 'file_path required for source_type=file' });
    }
    if (source_type === 'text' && !text) {
      return res.status(400).json({ error: 'text required for source_type=text' });
    }

    // 1. Create material record
    const { data: material, error: materialError } = await supabase
      .from('materials')
      .insert({
        user_id: userId,
        title: title || (source_type === 'url' ? url : 'Untitled'),
        source_type,
        url,
        file_path,
        topic_id,
        ingestion_status: 'pending',
      })
      .select()
      .single();

    if (materialError) {
      console.error('Failed to create material:', materialError);
      return res.status(500).json({ error: 'Failed to create material' });
    }

    // 2. Trigger Python sidecar (async)
    const sidecarPayload = {
      user_id: userId,
      material_id: material.id,
      source_type,
      url,
      file_path,
      text,
      topic_id,
    };

    // Fire-and-forget (sidecar will update material status)
    fetch(`${SIDECAR_URL}/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sidecar-Key': SIDECAR_API_KEY,
      },
      body: JSON.stringify(sidecarPayload),
    }).catch((err) => {
      console.error('Sidecar ingestion failed:', err);
      // Update material status to failed
      supabase
        .from('materials')
        .update({
          ingestion_status: 'failed',
          ingestion_error: err.message,
        })
        .eq('id', material.id)
        .then();
    });

    res.json({
      ok: true,
      material_id: material.id,
      status: 'pending',
    });
  } catch (error) {
    console.error('Ingest error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /v2/materials/:id
 * Get material status and metadata
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Material not found' });
    }

    res.json(data);
  } catch (error) {
    console.error('Get material error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /v2/materials
 * List user's materials (with pagination)
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { topic_id, status, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('materials')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (topic_id) {
      query = query.eq('topic_id', topic_id);
    }

    if (status) {
      query = query.eq('ingestion_status', status);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('List materials error:', error);
      return res.status(500).json({ error: 'Failed to list materials' });
    }

    res.json({
      materials: data,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    console.error('List materials error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /v2/materials/:id/chunks
 * Get all chunks for a material (for Reader anchoring)
 */
router.get('/:id/chunks', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Verify ownership
    const { data: material } = await supabase
      .from('materials')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!material) {
      return res.status(404).json({ error: 'Material not found' });
    }

    const { data, error } = await supabase
      .from('chunks')
      .select('id, content, chunk_index, locator, quote, heading_trail')
      .eq('material_id', id)
      .eq('user_id', userId)
      .order('chunk_index', { ascending: true });

    if (error) {
      console.error('Get chunks error:', error);
      return res.status(500).json({ error: 'Failed to get chunks' });
    }

    res.json({ chunks: data || [] });
  } catch (error) {
    console.error('Get chunks error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /v2/materials/:id
 * Delete material and all its chunks
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Verify ownership
    const { data: material } = await supabase
      .from('materials')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!material) {
      return res.status(404).json({ error: 'Material not found' });
    }

    // Delete (cascades to chunks via ON DELETE CASCADE)
    const { error } = await supabase
      .from('materials')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Delete material error:', error);
      return res.status(500).json({ error: 'Failed to delete material' });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Delete material error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
