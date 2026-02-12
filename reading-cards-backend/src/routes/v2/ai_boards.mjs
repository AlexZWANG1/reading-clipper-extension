import express from "express";
import { requireAuth } from "../../middleware/auth.mjs";
import { runRootAnalysis, runEvidenceVerification } from "../../services/boardAgents.mjs";

const router = express.Router();

// Require auth for all AI routes
router.use(requireAuth);

/**
 * POST /api/v2/ai/analyze_root
 * Body: { root_question: string }
 */
router.post("/analyze_root", async (req, res) => {
    try {
        const { root_question } = req.body;
        if (!root_question) {
            return res.status(400).json({ ok: false, error: "Missing root_question" });
        }

        const result = await runRootAnalysis({
            userId: req.user.id,
            rootQuestion: root_question,
            supabase: req.supabase
        });

        res.json({ ok: true, data: result });
    } catch (error) {
        console.error("Root Analysis Error:", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/v2/ai/verify
 * Body: { hypothesis: string, card_content: string }
 */
router.post("/verify", async (req, res) => {
    try {
        const { hypothesis, card_content } = req.body;
        if (!hypothesis || !card_content) {
            return res.status(400).json({ ok: false, error: "Missing hypothesis or card_content" });
        }

        const result = await runEvidenceVerification({
            userId: req.user.id,
            hypothesis,
            evidence: card_content,
            supabase: req.supabase
        });

        res.json({ ok: true, data: result });
    } catch (error) {
        console.error("Verification Error:", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

export default router;
