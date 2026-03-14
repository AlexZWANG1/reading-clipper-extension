// ========= Methodology Routes =========
// CRUD for user research methodologies + preset templates

import { Router } from "express";
import { requireAuth } from "../../middleware/auth.mjs";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, "../../config/methodology-templates");

const methodologyRouter = Router();
methodologyRouter.use(requireAuth);

// ── Default configs for each template ──

const DEFAULT_CONFIGS = {
  mece: {
    bias_warning: { enabled: true, min_support_for_warning: 3, max_oppose_for_warning: 0 },
    evidence_sufficiency: { min_evidence_per_hypothesis: 3 },
    ai_proactivity: "medium",
    card_style: { max_key_points: 5, summary_length: "concise" },
    decomposition_method: "mece",
    counter_evidence_search: "auto",
  },
  first_principles: {
    bias_warning: { enabled: true, min_support_for_warning: 2, max_oppose_for_warning: 0 },
    evidence_sufficiency: { min_evidence_per_hypothesis: 2 },
    ai_proactivity: "medium",
    card_style: { max_key_points: 5, summary_length: "concise" },
    decomposition_method: "first_principles",
    counter_evidence_search: "auto",
  },
  "5whys": {
    bias_warning: { enabled: true, min_support_for_warning: 2, max_oppose_for_warning: 0 },
    evidence_sufficiency: { min_evidence_per_hypothesis: 2 },
    ai_proactivity: "medium",
    card_style: { max_key_points: 3, summary_length: "concise" },
    decomposition_method: "5whys",
    counter_evidence_search: "manual",
  },
};

// ── Load template file ──

function loadTemplate(templateId) {
  const fileMap = { mece: "mece.md", first_principles: "first-principles.md", "5whys": "5whys.md" };
  const filename = fileMap[templateId];
  if (!filename) return null;
  try {
    return readFileSync(join(TEMPLATES_DIR, filename), "utf-8");
  } catch {
    return null;
  }
}

// ── Routes ──

/**
 * GET /api/v2/methodology
 * Returns the user's active methodology, or null if none set.
 */
methodologyRouter.get("/", async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from("user_methodologies")
      .select("*")
      .eq("user_id", req.user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;
    res.json({ ok: true, methodology: data });
  } catch (err) {
    console.error("[methodology] GET error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * PUT /api/v2/methodology
 * Create or update the user's active methodology.
 * Body: { name?, document?, config?, base_template? }
 */
methodologyRouter.put("/", async (req, res) => {
  try {
    const { name, document, config, base_template } = req.body;

    // Check if user already has an active methodology
    const { data: existing } = await req.supabase
      .from("user_methodologies")
      .select("id")
      .eq("user_id", req.user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (existing) {
      // Update existing
      const updates = {};
      if (name !== undefined) updates.name = name;
      if (document !== undefined) updates.document = document;
      if (config !== undefined) updates.config = config;
      if (base_template !== undefined) updates.base_template = base_template;

      const { data, error } = await req.supabase
        .from("user_methodologies")
        .update(updates)
        .eq("id", existing.id)
        .select()
        .single();

      if (error) throw error;
      res.json({ ok: true, methodology: data });
    } else {
      // Create new
      const templateDoc = base_template ? loadTemplate(base_template) : "";
      const templateConfig = base_template ? (DEFAULT_CONFIGS[base_template] || {}) : {};

      const { data, error } = await req.supabase
        .from("user_methodologies")
        .insert({
          user_id: req.user.id,
          name: name || "默认方法论",
          document: document ?? templateDoc ?? "",
          config: config ?? templateConfig,
          base_template: base_template || "mece",
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      res.json({ ok: true, methodology: data, created: true });
    }
  } catch (err) {
    console.error("[methodology] PUT error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/v2/methodology/templates
 * Returns available preset methodology templates.
 */
methodologyRouter.get("/templates", (req, res) => {
  const templates = [
    {
      id: "mece",
      name: "MECE 分析法",
      description: "互斥穷尽分解，适用于商业分析、政策研究",
      document: loadTemplate("mece") || "",
      config: DEFAULT_CONFIGS.mece,
    },
    {
      id: "first_principles",
      name: "第一性原理",
      description: "从基本事实逆推，适用于技术研究、创新探索",
      document: loadTemplate("first_principles") || "",
      config: DEFAULT_CONFIGS.first_principles,
    },
    {
      id: "5whys",
      name: "5 Whys 追问法",
      description: "连续追问根因，适用于问题诊断、事故分析",
      document: loadTemplate("5whys") || "",
      config: DEFAULT_CONFIGS["5whys"],
    },
  ];

  res.json({ ok: true, templates });
});

export default methodologyRouter;
