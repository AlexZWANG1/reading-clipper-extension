// ========= 信息源自动匹配服务 =========
// 根据 card 的 source_url 自动匹配到 Source

import { listSources } from "./sources.mjs";

/**
 * 从 URL 提取域名
 * @param {string} url 
 * @returns {string|null}
 */
function extractDomain(url) {
    if (!url) return null;
    try {
        const parsed = new URL(url);
        return parsed.hostname.toLowerCase();
    } catch {
        return null;
    }
}

/**
 * 根据卡片的 source_url 匹配信息源
 * 匹配策略（混合方案）：
 * 1. URL 前缀匹配 → 精确命中
 * 2. 域名匹配 → 若有多个候选，按 importance_level 排序取最重要的
 * 3. 未匹配 → 返回 null
 * 
 * @param {string} sourceUrl - 卡片来源 URL
 * @returns {string|null} - 匹配到的 source_id，或 null
 */
import { runSourceMatchingAgent } from "./agents.mjs";

/**
 * 根据卡片的 source_url 匹配信息源
 * 匹配策略（混合方案）：
 * 1. URL 前缀匹配 → 精确命中
 * 2. 域名匹配 → 若有多个候选，按 importance_level 排序取最重要的
 * 3. AI 匹配 → 调用 Source Matching Agent
 * 4. 未匹配 → 返回 null
 * 
 * @param {Object} params
 * @param {string} params.sourceUrl - 卡片来源 URL
 * @param {string} params.sourceName - 卡片来源名称
 * @param {string} params.summary - 卡片摘要
 * @returns {Promise<string|null>} - 匹配到的 source_id，或 null
 */
export async function matchSourceForCard({ sourceUrl, sourceName, summary }) {
    const sources = listSources();
    if (!sources || sources.length === 0) return null;

    // === Step 1 & 2: 规则匹配 (同步且快速) ===
    if (sourceUrl) {
        const normalizedUrl = sourceUrl.toLowerCase();

        // 1. URL 前缀匹配
        for (const src of sources) {
            if (src.url) {
                const srcUrl = src.url.toLowerCase();
                if (normalizedUrl.startsWith(srcUrl) || normalizedUrl.includes(srcUrl.replace(/^https?:\/\//, ''))) {
                    return src.source_id;
                }
            }
        }

        // 2. 域名匹配
        const cardDomain = extractDomain(sourceUrl);
        if (cardDomain) {
            const candidates = sources.filter(src => {
                if (!src.url) return false;
                const srcDomain = extractDomain(src.url);
                return srcDomain && (
                    cardDomain === srcDomain ||
                    cardDomain.endsWith('.' + srcDomain) ||
                    srcDomain.endsWith('.' + cardDomain)
                );
            });

            if (candidates.length > 0) {
                // 按 importance_level 排序（1=最重要），取第一个
                candidates.sort((a, b) => (a.importance_level || 3) - (b.importance_level || 3));
                return candidates[0].source_id;
            }
        }
    }

    // === Step 3: AI 匹配 (Fallback) ===
    console.log("🔍 规则匹配失败，尝试调用 AI Source Matching Agent...");

    // 构造简化版的 knownSources
    const knownSources = sources.map(s => ({
        source_id: s.source_id,
        name: s.name,
        url: s.url,
        description: s.description
    }));

    const aiSourceId = await runSourceMatchingAgent({
        sourceName,
        sourceUrl,
        summary,
        knownSources
    });

    if (aiSourceId) {
        console.log(`✅ AI 匹配成功: ${aiSourceId}`);
        return aiSourceId;
    }

    return null;
}

/**
 * 批量匹配信息源（用于现有卡片的迁移）
 * @param {Array} cards - 卡片数组
 * @returns {Map} - cardId -> source_id 映射
 */
export function batchMatchSources(cards) {
    const result = new Map();
    for (const card of cards) {
        const sourceId = matchSourceForCard(card.source_url);
        if (sourceId) {
            result.set(card.id, sourceId);
        }
    }
    return result;
}
