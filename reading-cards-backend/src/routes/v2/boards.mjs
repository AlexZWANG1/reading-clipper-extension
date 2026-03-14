// ========= 思维画板路由 V2（云端存储）=========

import express from "express";
import { requireAuth } from "../../middleware/auth.mjs";
import {
    listBoards,
    getBoardById,
    createBoard,
    updateBoard,
    deleteBoard,
    listNodes,
    createNode,
    updateNode,
    deleteNode,
    listEdges,
    createEdge,
    updateEdge,
    deleteEdge,
    getFullBoard,
    getOrCreateBoardByTopic,
} from "../../services/supabase/boards.mjs";
import { listPendingDrafts, commitDraft, rejectDraft } from "../../agents/draftEngine.mjs";
import { getResearchState, loadUserMethodology } from "../../agents/researchContext.mjs";

const router = express.Router();

// 所有路由都需要认证
router.use(requireAuth);

// ========= 画板 CRUD =========

/**
 * GET /api/v2/boards
 * 获取用户所有画板列表
 */
router.get("/", async (req, res) => {
    try {
        const boards = await listBoards(req.supabase, req.user.id);
        res.json({ ok: true, boards });
    } catch (error) {
        console.error("获取画板列表失败：", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/v2/boards/:id
 * 获取单个画板（含节点和边）
 */
router.get("/:id", async (req, res) => {
    try {
        const board = await getFullBoard(req.supabase, req.params.id);
        if (!board) {
            return res.status(404).json({ ok: false, error: "画板不存在" });
        }
        res.json({ ok: true, board });
    } catch (error) {
        console.error("获取画板失败：", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/v2/boards
 * 创建新画板
 */
router.post("/", async (req, res) => {
    try {
        const { title, description } = req.body || {};
        const board = await createBoard(req.supabase, req.user.id, {
            title,
            description,
        });
        res.json({ ok: true, board });
    } catch (error) {
        console.error("创建画板失败：", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * PATCH /api/v2/boards/:id
 * 更新画板
 */
router.patch("/:id", async (req, res) => {
    try {
        const board = await updateBoard(req.supabase, req.params.id, req.body);
        res.json({ ok: true, board });
    } catch (error) {
        console.error("更新画板失败：", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * DELETE /api/v2/boards/:id
 * 删除画板
 */
router.delete("/:id", async (req, res) => {
    try {
        await deleteBoard(req.supabase, req.params.id);
        res.json({ ok: true });
    } catch (error) {
        console.error("删除画板失败：", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

// ========= 节点 CRUD =========

/**
 * GET /api/v2/boards/:boardId/nodes
 * 获取画板所有节点
 */
router.get("/:boardId/nodes", async (req, res) => {
    try {
        const nodes = await listNodes(req.supabase, req.params.boardId);
        res.json({ ok: true, nodes });
    } catch (error) {
        console.error("获取节点失败：", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/v2/boards/:boardId/nodes
 * 创建节点
 */
router.post("/:boardId/nodes", async (req, res) => {
    try {
        const node = await createNode(req.supabase, req.params.boardId, req.body);
        res.json({ ok: true, node });
    } catch (error) {
        console.error("创建节点失败：", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * PATCH /api/v2/boards/:boardId/nodes/:nodeId
 * 更新节点
 */
router.patch("/:boardId/nodes/:nodeId", async (req, res) => {
    try {
        const node = await updateNode(req.supabase, req.params.nodeId, req.body);
        res.json({ ok: true, node });
    } catch (error) {
        console.error("更新节点失败：", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * DELETE /api/v2/boards/:boardId/nodes/:nodeId
 * 删除节点
 */
router.delete("/:boardId/nodes/:nodeId", async (req, res) => {
    try {
        await deleteNode(req.supabase, req.params.nodeId);
        res.json({ ok: true });
    } catch (error) {
        console.error("删除节点失败：", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

// ========= 边 CRUD =========

/**
 * GET /api/v2/boards/:boardId/edges
 * 获取画板所有边
 */
router.get("/:boardId/edges", async (req, res) => {
    try {
        const edges = await listEdges(req.supabase, req.params.boardId);
        res.json({ ok: true, edges });
    } catch (error) {
        console.error("获取边失败：", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/v2/boards/:boardId/edges
 * 创建边
 */
router.post("/:boardId/edges", async (req, res) => {
    try {
        const edge = await createEdge(req.supabase, req.params.boardId, req.body);
        res.json({ ok: true, edge });
    } catch (error) {
        console.error("创建边失败：", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * PATCH /api/v2/boards/:boardId/edges/:edgeId
 * 更新边
 */
router.patch("/:boardId/edges/:edgeId", async (req, res) => {
    try {
        const edge = await updateEdge(req.supabase, req.params.edgeId, req.body);
        res.json({ ok: true, edge });
    } catch (error) {
        console.error("更新边失败：", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * DELETE /api/v2/boards/:boardId/edges/:edgeId
 * 删除边
 */
router.delete("/:boardId/edges/:edgeId", async (req, res) => {
    try {
        await deleteEdge(req.supabase, req.params.edgeId);
        res.json({ ok: true });
    } catch (error) {
        console.error("删除边失败：", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

// ========= Board Health =========

/**
 * GET /api/v2/boards/:boardId/health
 * Get research health state for the board's topic.
 * Recomputes if stale (>5 min).
 */
router.get("/:boardId/health", async (req, res) => {
    try {
        const board = await getBoardById(req.supabase, req.params.boardId);
        if (!board) {
            return res.status(404).json({ ok: false, error: "画板不存在" });
        }
        if (!board.topic_id) {
            return res.json({ ok: true, health: null, message: "画板未关联主题" });
        }

        let methodologyConfig = null;
        try {
            const methodology = await loadUserMethodology(req.supabase, req.user.id);
            methodologyConfig = methodology?.config || null;
        } catch { /* ignore */ }

        const state = await getResearchState(req.supabase, board.topic_id, methodologyConfig);
        res.json({ ok: true, health: state });
    } catch (error) {
        console.error("获取画板健康状态失败：", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

// ========= Board Drafts =========

/**
 * GET /api/v2/boards/:boardId/drafts
 * List pending drafts for a board.
 */
router.get("/:boardId/drafts", async (req, res) => {
    try {
        const drafts = await listPendingDrafts(req.supabase, req.params.boardId);
        res.json({ ok: true, drafts });
    } catch (error) {
        console.error("获取草稿列表失败：", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/v2/boards/:boardId/drafts/:draftId/commit
 * Commit (accept) a draft — creates real nodes/edges.
 * Body: { accepted_indices?: number[] } — optional partial acceptance
 */
router.post("/:boardId/drafts/:draftId/commit", async (req, res) => {
    try {
        const { accepted_indices } = req.body || {};
        const result = await commitDraft(
            req.supabase,
            req.params.draftId,
            accepted_indices || null
        );
        res.json({ ok: true, ...result });
    } catch (error) {
        console.error("提交草稿失败：", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/v2/boards/:boardId/drafts/:draftId/reject
 * Reject a draft.
 */
router.post("/:boardId/drafts/:draftId/reject", async (req, res) => {
    try {
        await rejectDraft(req.supabase, req.params.draftId);
        res.json({ ok: true });
    } catch (error) {
        console.error("拒绝草稿失败：", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/v2/boards/:boardId/quick-link
 * One-click link a card as evidence to a hypothesis.
 * Body: { card_id, hypothesis_id, relation_type? }
 */
router.post("/:boardId/quick-link", async (req, res) => {
    try {
        const { card_id, hypothesis_id, relation_type } = req.body || {};
        if (!card_id || !hypothesis_id) {
            return res.status(400).json({ ok: false, error: "card_id and hypothesis_id are required" });
        }

        // Create evidence node linked to the hypothesis
        const node = await createNode(req.supabase, req.params.boardId, {
            node_type: 'evidence',
            parent_id: hypothesis_id,
            card_id,
            evidence_type: 'fact',
            strength: 3,
            content: { text: '' },
        });

        // Create edge from evidence to hypothesis
        const edge = await createEdge(req.supabase, req.params.boardId, {
            source_node_id: node.id,
            target_node_id: hypothesis_id,
            relation_type: relation_type || 'supports',
        });

        res.json({ ok: true, node, edge });
    } catch (error) {
        console.error("快速链接失败：", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

export default router;
