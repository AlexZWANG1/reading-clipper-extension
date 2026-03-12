import express from 'express';
import { supabaseAdmin } from '../../config/supabase.mjs';
import { requireAuth } from '../../middleware/auth.mjs';

const router = express.Router();

const supabase = supabaseAdmin;

/**
 * POST /v2/highlights
 * 创建高亮（划线）
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      material_id, card_id,
      chunk_id, chunk_relative_start, chunk_relative_end,
      exact, prefix, suffix,
      color = 'yellow', note,
    } = req.body;

    if (!material_id || !exact) {
      return res.status(400).json({ error: 'material_id and exact are required' });
    }

    // Verify material ownership
    const { data: material } = await supabase
      .from('materials')
      .select('id')
      .eq('id', material_id)
      .eq('user_id', userId)
      .single();

    if (!material) {
      return res.status(404).json({ error: 'Material not found' });
    }

    const { data, error } = await supabase
      .from('highlights')
      .insert({
        user_id: userId,
        material_id,
        card_id: card_id || null,
        chunk_id: chunk_id || null,
        chunk_relative_start: chunk_relative_start ?? null,
        chunk_relative_end: chunk_relative_end ?? null,
        exact,
        prefix: prefix || null,
        suffix: suffix || null,
        color,
        note: note || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Create highlight error:', error);
      return res.status(500).json({ error: 'Failed to create highlight' });
    }

    res.status(201).json(data);
  } catch (error) {
    console.error('Create highlight error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /v2/highlights?material_id=xxx
 * 获取某 material 的所有高亮
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { material_id } = req.query;

    if (!material_id) {
      return res.status(400).json({ error: 'material_id is required' });
    }

    const { data, error } = await supabase
      .from('highlights')
      .select('*')
      .eq('material_id', material_id)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Get highlights error:', error);
      return res.status(500).json({ error: 'Failed to get highlights' });
    }

    res.json({ highlights: data || [] });
  } catch (error) {
    console.error('Get highlights error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /v2/highlights/:id
 * 更新高亮（添加批注、改颜色）
 */
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { note, color, card_id } = req.body;

    const updates = {};
    if (note !== undefined) updates.note = note;
    if (color !== undefined) updates.color = color;
    if (card_id !== undefined) updates.card_id = card_id;

    const { data, error } = await supabase
      .from('highlights')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Highlight not found' });
    }

    res.json(data);
  } catch (error) {
    console.error('Update highlight error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /v2/highlights/:id
 * 删除高亮
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { error } = await supabase
      .from('highlights')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      return res.status(404).json({ error: 'Highlight not found' });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Delete highlight error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
