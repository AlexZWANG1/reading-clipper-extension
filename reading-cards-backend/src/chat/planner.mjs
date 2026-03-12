// ========= Plan Generator =========
// Classifies user intent and generates structured execution plans.
// Normal Q&A → returns null (orchestrator handles directly).
// Task-type → returns { planSpec, planDisplay }.

import { createAIClientConfig, callChatAPI } from "../services/aiClient.mjs";
import { listTopicsWithCardCount } from "../services/supabase/topics.mjs";

// ── Intent Classification (heuristic + AI fallback) ──

const TASK_KEYWORDS = [
  "每天", "每周", "定期", "跟踪", "追踪", "监控", "调研",
  "收集", "整理", "分析", "深度", "对比", "自动",
  "track", "monitor", "research", "collect", "analyze",
  "investigate", "survey", "compile", "digest",
];

/**
 * Classify whether a user message is a task-type request or normal Q&A.
 * Returns "task" or "chat".
 */
export function classifyIntent(message) {
  const text = message.toLowerCase();
  const matchCount = TASK_KEYWORDS.filter((kw) => text.includes(kw)).length;
  // 2+ keyword matches → likely a task
  if (matchCount >= 2) return "task";
  // 1 keyword + message length > 30 chars → likely a task
  if (matchCount >= 1 && text.length > 30) return "task";
  return "chat";
}

// ── Plan Generation ──

const PLAN_SYSTEM_PROMPT = `You are a research task planner for Verity, an evidence-driven research workbench.

Given a user's research intent, produce TWO outputs as a single JSON object:

1. "plan_spec" — the machine-executable plan
2. "plan_display" — the human-readable explanation

Available tools you can use in steps:
- fetch_rss: Fetch items from RSS feeds. Input: { feeds: [url, ...], max_items: number }
- semantic_search: Search user's ingested documents. Input: { query: string, limit: number }
- search_cards: Search user's existing cards. Input: { query: string }
- ingest_url: Ingest a URL into the knowledge base. Input: { url: string, title: string }
- create_card: Create a knowledge card. Input: { topic_title: string, summary: string, key_points: [...] }
- list_cards: List user's cards. Input: { topic_id?: string }
- list_topics: List user's topics. Input: {}

Output JSON schema:
{
  "plan_spec": {
    "intent_summary": "one-line summary of what the user wants",
    "task_type": "research_monitor | deep_research | competitive_analysis | literature_review | news_digest",
    "success_criteria": "what defines success for this task",
    "steps": [
      {
        "id": "step_1",
        "title": "short step title (Chinese)",
        "goal": "what this step achieves",
        "tool": "tool_name",
        "input_hint": { ... tool-specific input parameters ... }
      }
    ],
    "output_format": "cards | digest | report",
    "scope": {
      "keywords": ["keyword1", "keyword2"],
      "source_types": ["rss", "search"]
    },
    "source_config": {
      "rss_feeds": ["https://..."],
      "max_items_per_run": 20
    }
  },
  "plan_display": {
    "summary": "1-2 sentence summary of the plan (Chinese)",
    "why_this_plan": "explanation of why this approach was chosen (Chinese)",
    "selected_sources": ["source name 1", "source name 2"],
    "selected_tools": ["tool1", "tool2"],
    "step_explanations": [
      { "step_id": "step_1", "explanation": "human-readable explanation (Chinese)" }
    ]
  }
}

Rules:
- Step IDs must be sequential: step_1, step_2, ...
- Each step must use exactly one tool
- Steps are executed in order; later steps can reference earlier step results
- Always include a final summarization step (create_card or a dedicated summary)
- Prefer Chinese for all user-facing text
- For RSS feeds, suggest relevant feeds based on the topic
- Keep plans between 3-8 steps
- Output valid JSON only, no markdown fences`;

/**
 * Generate a structured execution plan from user intent.
 * @param {string} intent - User's natural language intent
 * @param {string} userId
 * @param {Object} supabase
 * @returns {{ planSpec: Object, planDisplay: Object }}
 */
export async function generatePlan(intent, userId, supabase) {
  // Fetch existing topics for context
  let existingTopics = [];
  try {
    existingTopics = await listTopicsWithCardCount(supabase, userId);
  } catch {}

  const topicNames = existingTopics.map((t) => `${t.title} (${t.card_count || 0} cards)`).join(", ");

  const aiConfig = await createAIClientConfig(userId, supabase);
  const messages = [
    { role: "system", content: PLAN_SYSTEM_PROMPT },
    {
      role: "user",
      content: `User's existing topics: [${topicNames || "none"}]\n\nResearch intent:\n${intent}`,
    },
  ];

  const response = await callChatAPI(aiConfig, messages, {
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI returned empty response");

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("AI returned invalid JSON for plan");
  }

  const planSpec = parsed.plan_spec;
  const planDisplay = parsed.plan_display;

  if (!planSpec || !planSpec.steps || planSpec.steps.length === 0) {
    throw new Error("AI generated an empty plan");
  }

  // Resolve suggested topic
  let suggestedTopicId = null;
  if (planSpec.scope?.keywords?.length > 0) {
    const firstKeyword = planSpec.scope.keywords[0].toLowerCase();
    const match = existingTopics.find((t) => t.title.toLowerCase().includes(firstKeyword));
    if (match) suggestedTopicId = match.id;
  }

  return {
    planSpec,
    planDisplay,
    suggestedTopicId,
    title: planSpec.intent_summary || intent.slice(0, 50),
  };
}

// ── Plan Templates ──

export const PLAN_TEMPLATES = [
  {
    id: "tech_trends",
    label: "技术趋势追踪",
    description: "从 RSS 源收集技术领域最新进展并沉淀为知识卡片",
    prompt: "跟踪 {topic} 领域最新技术进展，从技术博客和新闻源收集文章，筛选出有价值的内容并沉淀为知识卡片",
    variables: ["topic"],
  },
  {
    id: "competitive_watch",
    label: "竞品动态监控",
    description: "监控竞争对手的产品发布、融资、技术动态",
    prompt: "监控 {company} 的最新动态，包括产品发布、技术博客、融资消息，生成竞品分析卡片",
    variables: ["company"],
  },
  {
    id: "literature_review",
    label: "学术文献追踪",
    description: "追踪特定领域的最新论文和研究进展",
    prompt: "追踪 {field} 领域的最新研究论文，重点关注 {keywords}，整理关键发现为知识卡片",
    variables: ["field", "keywords"],
  },
  {
    id: "industry_news",
    label: "行业新闻监控",
    description: "收集行业新闻和分析报告",
    prompt: "收集 {industry} 行业的最新新闻和分析报告，提取关键趋势并生成摘要",
    variables: ["industry"],
  },
  {
    id: "deep_research",
    label: "深度调研",
    description: "对特定主题进行多源深度调研",
    prompt: "对 {topic} 进行深度调研，收集多方观点和数据，分析现状和趋势，生成研究摘要",
    variables: ["topic"],
  },
];

/**
 * Generate auto-title for a conversation based on the first message.
 */
export async function generateConversationTitle(firstMessage, userId, supabase) {
  try {
    const aiConfig = await createAIClientConfig(userId, supabase);
    const messages = [
      {
        role: "system",
        content: "Generate a very short title (5-15 Chinese characters) for a conversation that starts with the following message. Output ONLY the title text, nothing else.",
      },
      { role: "user", content: firstMessage },
    ];

    const response = await callChatAPI(aiConfig, messages, {
      temperature: 0.3,
      max_tokens: 30,
    });

    const title = response.choices?.[0]?.message?.content?.trim();
    return title || firstMessage.slice(0, 20);
  } catch {
    return firstMessage.slice(0, 20);
  }
}
