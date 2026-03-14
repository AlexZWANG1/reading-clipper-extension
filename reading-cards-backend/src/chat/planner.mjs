// ========= Plan Generator =========
// Generates structured execution plans from user intent.
// Called when the AI invokes the request_plan tool.
// Returns { planSpec, planDisplay }.

import { createAIClientConfig, callChatAPI } from "../services/aiClient.mjs";
import { listTopicsWithCardCount } from "../services/supabase/topics.mjs";
import { TOOL_DEFINITIONS } from "./tools.mjs";

// ── Plan Generation ──

const PLAN_OUTPUT_SCHEMA = `Output JSON schema:
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
}`;

function buildPlanSystemPrompt() {
  const toolDescriptions = TOOL_DEFINITIONS
    .filter(t => t.task_auto)
    .map(t => {
      const params = Object.keys(t.function.parameters?.properties || {}).join(', ');
      return `- ${t.function.name}: ${t.function.description.slice(0, 100)}... Params: {${params}}`;
    })
    .join('\n');

  return `You are a research task planner for Verity, an evidence-driven research workbench.

Given a user's research intent, produce TWO outputs as a single JSON object:

1. "plan_spec" — the machine-executable plan
2. "plan_display" — the human-readable explanation

可用工具（可在步骤中使用）:
${toolDescriptions}

重要：优先使用用户已有的 RSS 源和信息来源，不要编造 URL。如果用户没有相关信息源，在计划中说明需要用户提供。

${PLAN_OUTPUT_SCHEMA}

规则:
- 步骤 ID 必须递增: step_1, step_2, ...
- 每步只用一个工具
- 后续步骤可以引用前序步骤结果（$ref:step_id）
- 最后一步应生成总结
- 用户可见文本用中文
- 计划 3-8 步
- 只输出 JSON`;
}

/**
 * Generate a structured execution plan from user intent.
 * @param {string} intent - User's natural language intent
 * @param {string} userId
 * @param {Object} supabase
 * @param {Object} [options]
 * @param {string|null} [options.conversationSummary] - Recent conversation context summary
 * @param {Array} [options.userSources] - User's information sources
 * @param {Object|null} [options.researchState] - Current research state (hypotheses, evidence, blind spots)
 * @returns {{ planSpec: Object, planDisplay: Object, suggestedTopicId: string|null, title: string }}
 */
export async function generatePlan(intent, userId, supabase, {
  conversationSummary = null,
  userSources = [],
  researchState = null,
} = {}) {
  // Fetch existing topics for context
  let existingTopics = [];
  try {
    existingTopics = await listTopicsWithCardCount(supabase, userId);
  } catch {}

  const topicNames = existingTopics.map((t) => `${t.title} (${t.card_count || 0} cards)`).join(", ");

  // Build rich context for planner
  const contextParts = [];
  contextParts.push(`用户已有主题: [${topicNames || '无'}]`);

  if (userSources.length > 0) {
    const sourceList = userSources
      .filter(s => s.status === 'active')
      .slice(0, 10)
      .map(s => `- ${s.name}${s.rss_url ? ` (RSS: ${s.rss_url})` : ''}${s.url ? ` (${s.url})` : ''}`)
      .join('\n');
    contextParts.push(`用户已有信息源:\n${sourceList}`);
  }

  if (conversationSummary) {
    contextParts.push(`最近对话上下文:\n${conversationSummary}`);
  }

  if (researchState && researchState.total_hypotheses > 0) {
    contextParts.push(`当前研究状态: 假说 ${researchState.total_hypotheses} 个, 证据 ${researchState.total_evidence} 个, 盲点 ${researchState.blind_spots} 个`);
  }

  contextParts.push(`研究意图:\n${intent}`);

  const aiConfig = await createAIClientConfig(userId, supabase);
  const messages = [
    { role: "system", content: buildPlanSystemPrompt() },
    {
      role: "user",
      content: contextParts.join('\n\n'),
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
