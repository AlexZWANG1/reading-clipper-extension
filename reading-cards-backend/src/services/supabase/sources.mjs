// ========= 信息源服务 (Supabase 云端版) =========

import { supabaseAdmin } from "../../config/supabase.mjs";

/**
 * 列出信息源（支持筛选）
 * @param {Object} supabase - Supabase client
 * @param {string} userId - 用户 ID
 * @param {Object} filters - 筛选条件
 * @returns {Promise<Array>} 信息源数组
 */
export async function listSources(supabase, userId, filters = {}) {
  let query = supabase
    .from("sources")
    .select("*")
    .eq("user_id", userId)
    .order("importance_level", { ascending: true })
    .order("created_at", { ascending: false });

  if (filters.category) {
    query = query.eq("category", filters.category);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.importance_level !== undefined) {
    query = query.eq("importance_level", filters.importance_level);
  }

  const { data, error } = await query;

  if (error) {
    console.error("获取信息源列表失败:", error);
    throw new Error(error.message);
  }

  return data || [];
}
