// ========= 信息源相关路由 =========

import express from "express";
import {
    addSource,
    listSources,
    findSourceById,
    updateSource,
    deleteSource
} from "../services/sources.mjs";

const sourcesRouter = express.Router();

/**
 * POST /api/sources
 * 创建信息源
 * 
 * 请求体：
 * {
 *   name: string,              // 必填：展示名
 *   category: string,          // 必填：分类
 *   importance_level: 1|2|3,   // 必填：重要度
 *   url?: string,              // 可选：入口页
 *   region?: string,           // 可选：国别
 *   description?: string       // 可选：描述
 * }
 */
sourcesRouter.post("/", (req, res) => {
    try {
        const { name, category, importance_level, url, region, description } = req.body || {};

        // 校验必填字段
        if (!name || !name.trim()) {
            return res.status(400).json({
                ok: false,
                error: "name is required"
            });
        }

        if (!category || !category.trim()) {
            return res.status(400).json({
                ok: false,
                error: "category is required"
            });
        }

        if (importance_level === undefined || ![1, 2, 3].includes(importance_level)) {
            return res.status(400).json({
                ok: false,
                error: "importance_level must be 1, 2, or 3"
            });
        }

        const source = addSource({
            name: name.trim(),
            category: category.trim(),
            importance_level,
            url: url || null,
            region: region || null,
            description: description || null
        });

        res.json({ ok: true, source });
    } catch (error) {
        console.error("创建信息源失败：", error);
        res.status(500).json({
            ok: false,
            error: error.message || "服务器内部错误"
        });
    }
});

/**
 * GET /api/sources
 * 获取信息源列表
 * 
 * 查询参数：
 * - category?: string
 * - status?: string
 * - importance_level?: number
 */
sourcesRouter.get("/", (req, res) => {
    try {
        const { category, status, importance_level } = req.query;

        const filters = {};
        if (category) filters.category = category;
        if (status) filters.status = status;
        if (importance_level) filters.importance_level = parseInt(importance_level, 10);

        const sources = listSources(filters);

        res.json({ ok: true, sources });
    } catch (error) {
        console.error("获取信息源列表失败：", error);
        res.status(500).json({
            ok: false,
            error: error.message || "服务器内部错误"
        });
    }
});

/**
 * GET /api/sources/:id
 * 获取单个信息源详情
 */
sourcesRouter.get("/:id", (req, res) => {
    try {
        const { id } = req.params;
        const source = findSourceById(id);

        if (!source) {
            return res.status(404).json({
                ok: false,
                error: "source not found"
            });
        }

        res.json({ ok: true, source });
    } catch (error) {
        console.error("获取信息源详情失败：", error);
        res.status(500).json({
            ok: false,
            error: error.message || "服务器内部错误"
        });
    }
});

/**
 * PATCH /api/sources/:id
 * 更新信息源
 */
sourcesRouter.patch("/:id", (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body || {};

        // 校验 importance_level
        if (updates.importance_level !== undefined && ![1, 2, 3].includes(updates.importance_level)) {
            return res.status(400).json({
                ok: false,
                error: "importance_level must be 1, 2, or 3"
            });
        }

        const source = updateSource(id, updates);

        if (!source) {
            return res.status(404).json({
                ok: false,
                error: "source not found"
            });
        }

        res.json({ ok: true, source });
    } catch (error) {
        console.error("更新信息源失败：", error);
        res.status(500).json({
            ok: false,
            error: error.message || "服务器内部错误"
        });
    }
});

/**
 * DELETE /api/sources/:id
 * 删除信息源
 */
sourcesRouter.delete("/:id", (req, res) => {
    try {
        const { id } = req.params;
        const success = deleteSource(id);

        if (!success) {
            return res.status(404).json({
                ok: false,
                error: "source not found"
            });
        }

        res.json({ ok: true });
    } catch (error) {
        console.error("删除信息源失败：", error);
        res.status(500).json({
            ok: false,
            error: error.message || "服务器内部错误"
        });
    }
});

export default sourcesRouter;
