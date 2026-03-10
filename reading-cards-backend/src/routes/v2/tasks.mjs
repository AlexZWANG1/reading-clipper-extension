// ========= Task REST API =========

import express from 'express';
import { requireAuth } from '../../middleware/auth.mjs';
import { supabaseAdmin } from '../../config/supabase.mjs';
import {
  createTask, listTasks, getTask, updateTask, deleteTask,
  listRuns, getRun,
  listProposals, getPendingProposalCount,
} from '../../services/supabase/tasks.mjs';
import { compile } from '../../tasks/compiler.mjs';
import { executeRun } from '../../tasks/runner.mjs';
import { approve, reject } from '../../tasks/proposalEngine.mjs';

const router = express.Router();

// ── Proposals (must be before /:id to avoid param capture) ──

/**
 * GET /v2/tasks/proposals — List all pending proposals for the user.
 */
router.get('/proposals', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const status = req.query.status || 'pending';
    const proposals = await listProposals(supabaseAdmin, userId, { status });

    res.json({ ok: true, proposals });
  } catch (error) {
    console.error('[tasks] list proposals error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /v2/tasks/proposals/:id/approve — Approve and execute a proposal.
 */
router.post('/proposals/:id/approve', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await approve(supabaseAdmin, userId, req.params.id);

    res.json({ ok: true, ...result });
  } catch (error) {
    console.error('[tasks] approve error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /v2/tasks/proposals/:id/reject — Reject a proposal.
 */
router.post('/proposals/:id/reject', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await reject(supabaseAdmin, userId, req.params.id);

    res.json({ ok: true, ...result });
  } catch (error) {
    console.error('[tasks] reject error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── Tasks CRUD ──

/**
 * POST /v2/tasks — Create a new research task from natural language intent.
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { intent, topic_id } = req.body;
    const userId = req.user.id;

    if (!intent || typeof intent !== 'string' || intent.trim().length < 5) {
      return res.status(400).json({ error: 'intent required (min 5 chars)' });
    }

    // Compile intent → task_spec
    const compiled = await compile(intent.trim(), userId, req.supabase);

    // Create task
    const task = await createTask(supabaseAdmin, userId, {
      title: compiled.title,
      intent: intent.trim(),
      task_spec: compiled.task_spec,
      schedule: compiled.schedule,
      topic_id: topic_id || compiled.suggested_topic_id || null,
    });

    res.json({ ok: true, task });
  } catch (error) {
    console.error('[tasks] create error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /v2/tasks — List user's tasks.
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;

    const tasks = await listTasks(supabaseAdmin, userId, { status });

    // Enrich with pending proposal counts
    const enriched = await Promise.all(
      tasks.map(async (task) => {
        const pendingCount = await getPendingProposalCount(supabaseAdmin, userId, task.id);
        return { ...task, pending_proposals: pendingCount };
      })
    );

    res.json({ ok: true, tasks: enriched });
  } catch (error) {
    console.error('[tasks] list error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /v2/tasks/:id — Get task details with recent runs and pending proposals.
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const task = await getTask(supabaseAdmin, userId, req.params.id);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Fetch recent runs
    const runs = await listRuns(supabaseAdmin, userId, task.id, 10);

    // Fetch pending proposals
    const proposals = await listProposals(supabaseAdmin, userId, {
      task_id: task.id,
      status: 'pending',
    });

    res.json({ ok: true, task, runs, proposals });
  } catch (error) {
    console.error('[tasks] get error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /v2/tasks/:id — Update task (pause/resume/archive, change schedule).
 */
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const task = await updateTask(supabaseAdmin, userId, req.params.id, req.body);

    res.json({ ok: true, task });
  } catch (error) {
    console.error('[tasks] update error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /v2/tasks/:id — Delete task and all related data.
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    await deleteTask(supabaseAdmin, userId, req.params.id);

    res.json({ ok: true });
  } catch (error) {
    console.error('[tasks] delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── Task Runs ──

/**
 * POST /v2/tasks/:id/run — Manually trigger a task run.
 */
router.post('/:id/run', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const task = await getTask(supabaseAdmin, userId, req.params.id);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (task.status !== 'active') {
      return res.status(400).json({ error: `Task is ${task.status}, cannot run` });
    }

    if (task.is_running) {
      return res.status(409).json({ error: 'Task is already running' });
    }

    // Execute run in background (don't block the response)
    const runPromise = executeRun(task.id, task, supabaseAdmin);

    // Return immediately with acknowledgement
    res.json({ ok: true, message: 'Run started' });

    // Wait for completion (for logging)
    runPromise.catch((err) => {
      console.error(`[tasks] run failed for task ${task.id}:`, err.message);
    });
  } catch (error) {
    console.error('[tasks] run error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /v2/tasks/:id/runs — List runs for a task.
 */
router.get('/:id/runs', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const runs = await listRuns(supabaseAdmin, userId, req.params.id, limit);

    res.json({ ok: true, runs });
  } catch (error) {
    console.error('[tasks] list runs error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /v2/tasks/:id/runs/:runId — Get run details with steps.
 */
router.get('/:id/runs/:runId', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const run = await getRun(supabaseAdmin, userId, req.params.runId);

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    res.json({ ok: true, run });
  } catch (error) {
    console.error('[tasks] get run error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
