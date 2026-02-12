// ========= 邀请码相关路由 =========

import express from "express";
import crypto from "crypto";
import { requireAuth } from "../../middleware/auth.mjs";
import { createSupabaseClient, supabaseAdmin } from "../../config/supabase.mjs";

const router = express.Router();

/**
 * 检查用户是否是管理员
 */
async function isAdmin(userId) {
  if (!supabaseAdmin) return false;
  
  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !data) return false;
    
    // 检查用户元数据中的role字段
    const role = data.user.user_metadata?.role;
    return role === "admin";
  } catch {
    return false;
  }
}

/**
 * GET /api/v2/invites/validate/:code
 * 验证邀请码（公开接口，不需要认证）
 */
router.get("/validate/:code", async (req, res) => {
  try {
    const { code } = req.params;

    if (!code) {
      return res.status(400).json({
        ok: false,
        error: "code_required",
        message: "邀请码不能为空",
      });
    }

    // 调用数据库函数验证邀请码
    const { data, error } = await supabaseAdmin.rpc("validate_invite_code", {
      p_code: code,
    });

    if (error) {
      console.error("验证邀请码失败:", error);
      return res.status(500).json({
        ok: false,
        error: "validation_failed",
        message: "验证邀请码失败",
      });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "invite_code_not_found",
        message: "邀请码不存在",
      });
    }

    const result = data[0];
    res.json({
      ok: result.is_valid,
      valid: result.is_valid,
      message: result.message,
      code_id: result.code_id,
    });
  } catch (error) {
    console.error("验证邀请码错误:", error);
    res.status(500).json({
      ok: false,
      error: "server_error",
      message: "服务器错误，请稍后重试",
    });
  }
});

/**
 * GET /api/v2/invites
 * 获取邀请码列表（仅管理员）
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    
    // 检查管理员权限
    if (!(await isAdmin(user.id))) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: "需要管理员权限",
      });
    }

    const { page = 1, limit = 50, is_active } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabaseAdmin
      .from("invite_codes")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (is_active !== undefined) {
      query = query.eq("is_active", is_active === "true");
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("获取邀请码列表失败:", error);
      return res.status(500).json({
        ok: false,
        error: "get_invites_failed",
        message: "获取邀请码列表失败",
      });
    }

    res.json({
      ok: true,
      invites: data || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
      },
    });
  } catch (error) {
    console.error("获取邀请码列表错误:", error);
    res.status(500).json({
      ok: false,
      error: "server_error",
      message: "服务器错误，请稍后重试",
    });
  }
});

/**
 * POST /api/v2/invites
 * 创建邀请码（仅管理员）
 * 
 * 请求体：
 * {
 *   code?: string,  // 可选，不提供则自动生成
 *   max_uses?: number,  // 最大使用次数，默认1
 *   expires_at?: string,  // 过期时间（ISO格式），可选
 *   notes?: string  // 备注，可选
 * }
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    
    // 检查管理员权限
    if (!(await isAdmin(user.id))) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: "需要管理员权限",
      });
    }

    const { code, max_uses = 1, expires_at, notes } = req.body || {};

    // 生成邀请码（如果未提供）
    const inviteCode = code || generateInviteCode();

    // 验证参数
    if (max_uses < 1) {
      return res.status(400).json({
        ok: false,
        error: "invalid_max_uses",
        message: "max_uses必须大于0",
      });
    }

    // 创建邀请码
    const { data, error } = await supabaseAdmin
      .from("invite_codes")
      .insert({
        code: inviteCode,
        created_by: user.id,
        max_uses: parseInt(max_uses),
        expires_at: expires_at || null,
        notes: notes || null,
        is_active: true,
        current_uses: 0,
      })
      .select()
      .single();

    if (error) {
      console.error("创建邀请码失败:", error);
      
      if (error.code === "23505") {
        // 唯一约束冲突
        return res.status(400).json({
          ok: false,
          error: "code_exists",
          message: "邀请码已存在",
        });
      }

      return res.status(500).json({
        ok: false,
        error: "create_invite_failed",
        message: "创建邀请码失败",
      });
    }

    res.json({
      ok: true,
      invite: data,
    });
  } catch (error) {
    console.error("创建邀请码错误:", error);
    res.status(500).json({
      ok: false,
      error: "server_error",
      message: "服务器错误，请稍后重试",
    });
  }
});

/**
 * PATCH /api/v2/invites/:id
 * 更新邀请码（仅管理员）
 */
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    
    // 检查管理员权限
    if (!(await isAdmin(user.id))) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: "需要管理员权限",
      });
    }

    const { is_active, max_uses, expires_at, notes } = req.body || {};
    const updates = {};

    if (is_active !== undefined) updates.is_active = is_active;
    if (max_uses !== undefined) {
      if (max_uses < 1) {
        return res.status(400).json({
          ok: false,
          error: "invalid_max_uses",
          message: "max_uses必须大于0",
        });
      }
      updates.max_uses = parseInt(max_uses);
    }
    if (expires_at !== undefined) updates.expires_at = expires_at || null;
    if (notes !== undefined) updates.notes = notes || null;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        ok: false,
        error: "no_updates",
        message: "没有提供要更新的字段",
      });
    }

    const { data, error } = await supabaseAdmin
      .from("invite_codes")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("更新邀请码失败:", error);
      return res.status(500).json({
        ok: false,
        error: "update_invite_failed",
        message: "更新邀请码失败",
      });
    }

    res.json({
      ok: true,
      invite: data,
    });
  } catch (error) {
    console.error("更新邀请码错误:", error);
    res.status(500).json({
      ok: false,
      error: "server_error",
      message: "服务器错误，请稍后重试",
    });
  }
});

/**
 * DELETE /api/v2/invites/:id
 * 删除邀请码（仅管理员）
 */
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    
    // 检查管理员权限
    if (!(await isAdmin(user.id))) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: "需要管理员权限",
      });
    }

    const { error } = await supabaseAdmin
      .from("invite_codes")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("删除邀请码失败:", error);
      return res.status(500).json({
        ok: false,
        error: "delete_invite_failed",
        message: "删除邀请码失败",
      });
    }

    res.json({
      ok: true,
      message: "邀请码已删除",
    });
  } catch (error) {
    console.error("删除邀请码错误:", error);
    res.status(500).json({
      ok: false,
      error: "server_error",
      message: "服务器错误，请稍后重试",
    });
  }
});

/**
 * 生成邀请码
 * 格式：RC-XXXX-XXXX-XXXX（12位随机字符）
 */
function generateInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 排除易混淆字符
  let code = "RC-";
  
  // 使用crypto生成更安全的随机数
  const randomBytes = crypto.randomBytes(12);
  
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) {
      code += "-";
    }
    code += chars[randomBytes[i] % chars.length];
  }
  
  return code;
}

export default router;

