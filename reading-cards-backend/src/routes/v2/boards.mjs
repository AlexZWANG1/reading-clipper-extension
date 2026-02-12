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

export default router;
