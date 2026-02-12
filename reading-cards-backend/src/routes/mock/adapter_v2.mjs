
import express from 'express';
import {
    listCards,
    addCard,
    findCardById,
    updateCard,
    softDeleteCard
} from '../../services/cards.mjs';
import * as DocumentService from '../../services/documents.mjs';

const router = express.Router();

// Helper: Generate stable topic ID from title
function generateTopicId(title) {
    if (!title) return null;
    // Simple hash or slug
    return 'topic_' + Buffer.from(title).toString('hex').slice(0, 16);
}

// Helper: Mock User (in Local Mode, we assume a single user context)
const MOCK_USER_ID = 'local-user-id';

// ========= Topic API Adapter =========

/**
 * GET /api/v2/topics
 * V1 doesn't have explicit topics, so we aggregate them from cards.
 */
router.get('/topics', (req, res) => {
    try {
        const cards = listCards({ includeDeleted: false });
        const topicMap = new Map();

        cards.forEach(card => {
            if (!card.topic_title) return;
            const title = card.topic_title.trim();
            if (!title) return;

            if (!topicMap.has(title)) {
                topicMap.set(title, {
                    id: generateTopicId(title),
                    title: title,
                    description: "Local Topic",
                    card_count: 0,
                    created_at: new Date().toISOString(),
                    user_id: MOCK_USER_ID
                });
            }
            topicMap.get(title).card_count++;
        });

        const topics = Array.from(topicMap.values()).sort((a, b) => a.title.localeCompare(b.title));
        res.json({ ok: true, topics });
    } catch (err) {
        console.error('[AdapterV2] List Topics Error:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/v2/topics/:id
 */
router.get('/topics/:id', (req, res) => {
    // Because we generate IDs from titles on the fly, finding by ID is inefficient 
    // without scanning all cards or cache. For now, we scan.
    try {
        const cards = listCards({ includeDeleted: false });
        let targetTopic = null;

        // Find if this ID corresponds to any topic title
        const uniqueTitles = [...new Set(cards.map(c => c.topic_title).filter(Boolean))];

        for (const title of uniqueTitles) {
            if (generateTopicId(title) === req.params.id) {
                // Found it, now need count
                const count = cards.filter(c => c.topic_title === title).length;
                targetTopic = {
                    id: req.params.id,
                    title: title,
                    description: "Local Topic",
                    card_count: count,
                    created_at: new Date().toISOString(), // Mock
                    user_id: MOCK_USER_ID
                };
                break;
            }
        }

        if (!targetTopic) return res.status(404).json({ ok: false, error: 'Topic not found' });
        res.json({ ok: true, topic: targetTopic });

    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/v2/topics
 * Creating a topic in V1 logic basically means "ready to use this string".
 * Since V1 doesn't store empty topics, we can just mock-return a success
 * so the frontend UI updates.
 */
router.post('/topics', (req, res) => {
    const { title, description } = req.body;
    // In V1, topics are implicit. We can't really "create" one without a card.
    // OPTIONAL: We could create a dummy file or just Return success.
    // Returning success to satisfy frontend.
    const id = generateTopicId(title);
    res.json({
        ok: true,
        topic: {
            id,
            title,
            description,
            card_count: 0,
            user_id: MOCK_USER_ID,
            created_at: new Date().toISOString()
        }
    });
});

/**
 * DELETE /api/v2/topics/:id
 * In V1 this might strictly mean "Unset topic_title from all cards"
 */
router.delete('/topics/:id', (req, res) => {
    // 1. Find title from ID
    const cards = listCards({ includeDeleted: false });
    let targetTitle = null;
    const uniqueTitles = [...new Set(cards.map(c => c.topic_title).filter(Boolean))];
    for (const title of uniqueTitles) {
        if (generateTopicId(title) === req.params.id) {
            targetTitle = title;
            break;
        }
    }

    if (!targetTitle) return res.status(404).json({ ok: false, error: 'Topic not found' });

    // 2. "Delete" -> Remove topic_title from all cards? Or just block?
    // User request says "update/delete". Let's perform a "rename to null" or just pretend.
    // Better implementation: Set topic_title = null for these cards? 
    // Or just return ok (since if we don't nullify, it reappears).
    // Let's NULLIFY.
    const cardsToUpdate = cards.filter(c => c.topic_title === targetTitle);
    cardsToUpdate.forEach(c => {
        updateCard(c.id, { topic_title: null });
    });

    res.json({ ok: true });
});

// ========= Cards API Adapter =========

/**
 * GET /api/v2/cards
 */
// Import source service dynamically to avoid circular deps if needed, 
// but since we are in mock/adapter_v2, we can try static or keep dynamic pattern.
// Let's use dynamic inside the route to be safe and consistent with routes/cards.mjs

router.get('/cards', async (req, res) => {
    try {
        const { topic_id, topic_title, include_deleted, source_id, importance } = req.query;

        // Resolve topic_id to topic_title if needed
        let effectiveTopicTitle = topic_title;

        if (!effectiveTopicTitle && topic_id) {
            // Scan to find title for this ID
            const allCards = listCards({ includeDeleted: true }); // optimize?
            const uniqueTitles = [...new Set(allCards.map(c => c.topic_title).filter(Boolean))];
            const match = uniqueTitles.find(t => generateTopicId(t) === topic_id);
            if (match) effectiveTopicTitle = match;
        }

        // 1. Get base list from cards service
        // We pass source_id here if supported by listCards (it is supported), 
        // but importance is NOT supported by listCards, so we filter later.
        let cards = listCards({
            includeDeleted: include_deleted === 'true',
            topic_title: effectiveTopicTitle,
            source_id: source_id // Pass source_id if present
        });

        // 2. Hydrate with Source Info
        const { findSourceById } = await import('../../services/sources.mjs');

        let v2Cards = cards.map(c => {
            let sourceInfo = null;
            if (c.source_id) {
                const source = findSourceById(c.source_id);
                if (source) {
                    sourceInfo = {
                        name: source.name,
                        category: source.category,
                        importance_level: source.importance_level,
                        region: source.region,
                        url: source.url
                    };
                }
            }

            return {
                ...c,
                user_id: MOCK_USER_ID,
                topic_id: generateTopicId(c.topic_title),
                source: sourceInfo
            };
        });

        // 3. Apply Filters that listCards couldn't handle (Importance)
        if (importance) {
            const importanceVal = parseInt(importance);
            if (!isNaN(importanceVal)) {
                v2Cards = v2Cards.filter(c => c.source?.importance_level === importanceVal);
            }
        }

        res.json({ ok: true, cards: v2Cards });
    } catch (err) {
        console.error("Adapter V2 List Cards Error:", err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Import Agent Service
import { runAgent1 } from '../../services/agents.mjs';

/**
 * POST /api/v2/cards/capture
 * (Reuses V1 capture logic but formats result for V2)
 */
router.post('/cards/capture', async (req, res) => {
    try {
        const { snippet, imageData, preSummary, sourceUrl, sourceName, topic_title, topicTitle, note } = req.body;

        let processedData = {
            summary: preSummary || "",
            key_points: [],
            source_name: sourceName,
            source_url: sourceUrl,
            raw_snippet: snippet || "[图片卡片]",
            image_url: imageData
        };

        // Try running Agent1 even in local mode
        // Note: verify if runAgent1 works without Supabase (it usually just hits OpenAI)
        try {
            console.log("🤖 [LocalAdapter] Calling Agent1...");
            const agentResult = await runAgent1({
                snippet: (snippet || "").trim(),
                imageData: imageData,
                preSummary,
                sourceName,
                sourceUrl
            });
            processedData = { ...processedData, ...agentResult };
        } catch (agentErr) {
            console.warn("⚠️ [LocalAdapter] Agent1 failed, using raw data:", agentErr.message);
        }

        // V1 addCard expects specific fields
        const card = addCard({
            ...processedData,
            topic_title: topic_title || topicTitle,
            note: note || ""
        });

        res.json({ ok: true, card: { ...card, user_id: MOCK_USER_ID } });
    } catch (err) {
        console.error("Capture Error:", err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * PATCH /api/v2/cards/:id
 */
router.patch('/cards/:id', (req, res) => {
    try {
        const updated = updateCard(req.params.id, req.body);
        if (!updated) return res.status(404).json({ ok: false, error: 'Card not found' });
        res.json({ ok: true, card: { ...updated, user_id: MOCK_USER_ID } });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * DELETE /api/v2/cards/:id
 */
router.delete('/cards/:id', (req, res) => {
    try {
        const success = softDeleteCard(req.params.id);
        if (!success) return res.status(404).json({ ok: false, error: 'Card not found' });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/v2/cards/search
 */
router.post('/cards/search', (req, res) => {
    // Basic Local Search (filter by snippet/summary)
    try {
        const { query } = req.body;
        const allCards = listCards({ includeDeleted: false });
        if (!query) return res.json({ ok: true, cards: [], card_ids: [] });

        const lowerQ = query.toLowerCase();
        const matches = allCards.filter(c =>
            (c.raw_snippet && c.raw_snippet.toLowerCase().includes(lowerQ)) ||
            (c.summary && c.summary.toLowerCase().includes(lowerQ)) ||
            (c.note && c.note.toLowerCase().includes(lowerQ))
        );

        res.json({
            ok: true,
            cards: matches,
            card_ids: matches.map(c => c.id)
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ========= Document API Adapter (Basic) =========
// Redirect to documents service
router.get('/documents', async (req, res) => { // async just in case
    try {
        // V1 documents service likely lists from file
        // We might need to implement listDocuments in service/documents.mjs if not exposed
        // Assuming it's similar to cards
        res.json({ ok: true, documents: [] }); // TODO: Hook up real doc service if needed
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ========= Settings API Adapter (Local Mode) =========

/**
 * GET /api/v2/settings
 * Local mode: 返回默认设置
 */
router.get('/settings', (req, res) => {
    console.log('🔧 [Adapter] GET /api/v2/settings');
    res.json({
        ok: true,
        settings: {
            provider: 'openai',
            model: 'gpt-5-mini',
            api_endpoint: null,
            has_custom_api_key: false,
        },
    });
});

/**
 * PATCH /api/v2/settings
 * Local mode: 模拟保存（实际不保存）
 */
router.patch('/settings', (req, res) => {
    console.log('🔧 [Adapter] PATCH /api/v2/settings');
    const { provider, model, api_key, api_endpoint } = req.body || {};
    res.json({
        ok: true,
        settings: {
            provider: provider || 'openai',
            model: model || 'gpt-5-mini',
            api_endpoint: api_endpoint || null,
            has_custom_api_key: !!api_key,
        },
    });
});

/**
 * POST /api/v2/settings/test-api
 * Local mode: 模拟测试（总是成功）
 */
router.post('/settings/test-api', (req, res) => {
    console.log('🔧 [Adapter] POST /api/v2/settings/test-api');
    res.json({
        ok: true,
        message: 'Local mode: API连接测试模拟成功',
    });
});

/**
 * GET /api/v2/settings/providers
 * Local mode: 返回提供商列表
 */
router.get('/settings/providers', (req, res) => {
    console.log('🔧 [Adapter] GET /api/v2/settings/providers');
    res.json({
        ok: true,
        providers: [
            {
                id: 'openai',
                name: 'OpenAI',
                description: 'OpenAI官方API',
            },
            {
                id: 'anthropic',
                name: 'Anthropic',
                description: 'Anthropic Claude API',
            },
            {
                id: 'custom',
                name: '自定义API',
                description: '使用自己的API端点（需兼容OpenAI格式）',
            },
        ],
    });
});

/**
 * GET /api/v2/settings/models/:provider
 * Local mode: 返回模型列表
 */
router.get('/settings/models/:provider', (req, res) => {
    console.log('🔧 [Adapter] GET /api/v2/settings/models/:provider');
    const { provider } = req.params;
    
    const modelsMap = {
        openai: [
            { id: 'gpt-5-mini', name: 'GPT-5 Mini', description: '成本优化的推理模型' },
            { id: 'gpt-5.1', name: 'GPT-5.1', description: '最新的旗舰模型' },
            { id: 'gpt-5-nano', name: 'GPT-5 Nano', description: '高吞吐量、简单指令跟随' },
        ],
        anthropic: [
            { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: '平衡性能和成本' },
            { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: '最强性能' },
        ],
        custom: [
            { id: '*', name: '自定义模型', description: '使用自定义模型名称' },
        ],
    };

    const models = modelsMap[provider] || [];
    res.json({
        ok: true,
        models,
    });
});

// ========= Invites API Adapter (Local Mode) =========

/**
 * GET /api/v2/invites/validate/:code
 * Local mode: 总是返回有效（跳过验证）
 */
router.get('/invites/validate/:code', (req, res) => {
    console.log('🔧 [Adapter] GET /api/v2/invites/validate/:code');
    const { code } = req.params;
    console.log('🔧 [Adapter] Local mode - invite code validation skipped:', code);
    res.json({
        ok: true,
        valid: true,
        message: 'Local mode: 邀请码验证已跳过',
        code_id: 'local-mock-code-id',
    });
});

/**
 * GET /api/v2/invites
 * Local mode: 返回空列表
 */
router.get('/invites', (req, res) => {
    console.log('🔧 [Adapter] GET /api/v2/invites');
    res.json({
        ok: true,
        invites: [],
        pagination: {
            page: 1,
            limit: 50,
            total: 0,
        },
    });
});

/**
 * POST /api/v2/invites
 * Local mode: 模拟创建（不实际保存）
 */
router.post('/invites', (req, res) => {
    console.log('🔧 [Adapter] POST /api/v2/invites');
    res.json({
        ok: true,
        invite: {
            id: 'local-mock-invite-id',
            code: req.body.code || 'RC-MOCK-CODE',
            created_by: 'local-user-id',
            max_uses: req.body.max_uses || 1,
            current_uses: 0,
            is_active: true,
            created_at: new Date().toISOString(),
        },
    });
});

/**
 * PATCH /api/v2/invites/:id
 * Local mode: 模拟更新
 */
router.patch('/invites/:id', (req, res) => {
    console.log('🔧 [Adapter] PATCH /api/v2/invites/:id');
    res.json({
        ok: true,
        invite: {
            id: req.params.id,
            ...req.body,
        },
    });
});

/**
 * DELETE /api/v2/invites/:id
 * Local mode: 模拟删除
 */
router.delete('/invites/:id', (req, res) => {
    console.log('🔧 [Adapter] DELETE /api/v2/invites/:id');
    res.json({
        ok: true,
        message: '邀请码已删除（Local mode模拟）',
    });
});

export default router;
