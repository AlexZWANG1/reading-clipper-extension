// ========= 信息源 V2 API (云端版本) =========
// 使用 Supabase 存储

import { Router } from "express";
import { requireAuth } from "../../middleware/auth.mjs";
import { supabaseAdmin } from "../../config/supabase.mjs";

const sourcesRouterV2 = Router();

// 所有路由都需要认证
sourcesRouterV2.use(requireAuth);

/**
 * POST /api/v2/sources
 * 创建信息源
 */
sourcesRouterV2.post("/", async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, category, importance_level, url, region, description } = req.body || {};

        // 校验必填字段
        if (!name || !name.trim()) {
            return res.status(400).json({
                ok: false,
                error: "name_required",
                message: "信息源名称不能为空",
            });
        }

        if (!category || !category.trim()) {
            return res.status(400).json({
                ok: false,
                error: "category_required",
                message: "分类不能为空",
            });
        }

        if (importance_level === undefined || ![1, 2, 3].includes(importance_level)) {
            return res.status(400).json({
                ok: false,
                error: "invalid_importance_level",
                message: "重要度必须是 1、2 或 3",
            });
        }

        const supabase = supabaseAdmin;

        const { data: source, error } = await supabase
            .from("sources")
            .insert({
                user_id: userId,
                name: name.trim(),
                category: category.trim(),
                importance_level,
                url: url || null,
                region: region || null,
                description: description || null,
            })
            .select()
            .single();

        if (error) {
            console.error("创建信息源失败:", error);
            throw new Error(error.message);
        }

        res.json({ ok: true, source });
    } catch (error) {
        console.error("创建信息源失败:", error);
        res.status(500).json({
            ok: false,
            error: error.message || "服务器内部错误",
        });
    }
});

/**
 * GET /api/v2/sources
 * 获取信息源列表
 */
sourcesRouterV2.get("/", async (req, res) => {
    try {
        const userId = req.user.id;
        const { category, status, importance_level } = req.query;

        const supabase = supabaseAdmin;

        let query = supabase
            .from("sources")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });

        // 应用筛选条件
        if (category) {
            query = query.eq("category", category);
        }
        if (status) {
            query = query.eq("status", status);
        }
        if (importance_level) {
            query = query.eq("importance_level", parseInt(importance_level, 10));
        }

        const { data: sources, error } = await query;

        if (error) {
            console.error("获取信息源列表失败:", error);
            throw new Error(error.message);
        }

        res.json({ ok: true, sources });
    } catch (error) {
        console.error("获取信息源列表失败:", error);
        res.status(500).json({
            ok: false,
            error: error.message || "服务器内部错误",
        });
    }
});

/**
 * GET /api/v2/sources/:id
 * 获取单个信息源详情
 */
sourcesRouterV2.get("/:id", async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        const supabase = supabaseAdmin;

        const { data: source, error } = await supabase
            .from("sources")
            .select("*")
            .eq("id", id)
            .eq("user_id", userId)
            .single();

        if (error || !source) {
            return res.status(404).json({
                ok: false,
                error: "source_not_found",
                message: "信息源不存在",
            });
        }

        res.json({ ok: true, source });
    } catch (error) {
        console.error("获取信息源详情失败:", error);
        res.status(500).json({
            ok: false,
            error: error.message || "服务器内部错误",
        });
    }
});

/**
 * PATCH /api/v2/sources/:id
 * 更新信息源
 */
sourcesRouterV2.patch("/:id", async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const updates = req.body || {};

        // 校验 importance_level
        if (updates.importance_level !== undefined && ![1, 2, 3].includes(updates.importance_level)) {
            return res.status(400).json({
                ok: false,
                error: "invalid_importance_level",
                message: "重要度必须是 1、2 或 3",
            });
        }

        // 只允许更新特定字段
        const allowedFields = ["name", "category", "importance_level", "url", "region", "description", "status"];
        const updateData = {};
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                updateData[field] = updates[field];
            }
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                ok: false,
                error: "no_updates",
                message: "没有提供要更新的字段",
            });
        }

        const supabase = supabaseAdmin;

        const { data: source, error } = await supabase
            .from("sources")
            .update(updateData)
            .eq("id", id)
            .eq("user_id", userId)
            .select()
            .single();

        if (error || !source) {
            return res.status(404).json({
                ok: false,
                error: "source_not_found",
                message: "信息源不存在",
            });
        }

        res.json({ ok: true, source });
    } catch (error) {
        console.error("更新信息源失败:", error);
        res.status(500).json({
            ok: false,
            error: error.message || "服务器内部错误",
        });
    }
});

/**
 * DELETE /api/v2/sources/:id
 * 删除信息源
 */
sourcesRouterV2.delete("/:id", async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        const supabase = supabaseAdmin;

        const { error, count } = await supabase
            .from("sources")
            .delete()
            .eq("id", id)
            .eq("user_id", userId);

        if (error) {
            console.error("删除信息源失败:", error);
            throw new Error(error.message);
        }

        res.json({ ok: true });
    } catch (error) {
        console.error("删除信息源失败:", error);
        res.status(500).json({
            ok: false,
            error: error.message || "服务器内部错误",
        });
    }
});

export default sourcesRouterV2;
