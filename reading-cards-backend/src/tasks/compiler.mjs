// ========= Task Compiler =========
// Converts natural language intent into a structured task_spec.

import { createAIClientConfig, callChatAPI } from '../services/aiClient.mjs';
import { listTopicsWithCardCount } from '../services/supabase/topics.mjs';

const COMPILER_SYSTEM_PROMPT = `You are a research task compiler for Verity, an evidence-driven research workbench.

Given a user's natural language research intent, produce a structured task specification.

Output JSON with these fields:
{
  "title": "short task title (Chinese, 10-20 chars)",
  "task_spec": {
    "version": 1,
    "task_type": "monitor_research",
    "intent_summary": "one-line summary of the intent",
    "scope": {
      "keywords": ["keyword1", "keyword2"],
      "source_types": ["rss"]
    },
    "phases": ["collect", "filter", "materialize", "cardify"],
    "policies": {
      "auto_create_materials": true,
      "auto_create_cards": true,
      "auto_attach_existing_topic": true,
      "proposal_for_new_topic": true,
      "proposal_for_hypothesis": true
    },
    "source_config": {
      "rss_feeds": ["https://..."],
      "max_items_per_run": 20
    }
  },
  "schedule": { "type": "manual" },
  "suggested_topic_title": "matching existing topic title or null"
}

Rules:
- task_type is always "monitor_research" for Phase 1
- phases should always include collect, filter, materialize, cardify
- For RSS feeds, suggest relevant feeds based on the research topic (e.g., Hacker News RSS for tech topics)
- If the user mentions a specific domain or topic, set appropriate keywords
- schedule.type is always "manual" for Phase 1
- suggested_topic_title: if the intent mentions a topic that matches an existing topic, include it; otherwise null
- Output valid JSON only, no markdown fences`;

/**
 * Compile a natural language intent into a task spec.
 * @param {string} intent - User's natural language intent
 * @param {string} userId
 * @param {Object} supabase
 * @returns {{ title, task_spec, schedule, suggested_topic_id }}
 */
export async function compile(intent, userId, supabase) {
  // Get existing topics for matching
  let existingTopics = [];
  try {
    existingTopics = await listTopicsWithCardCount(supabase, userId);
  } catch {}

  const topicNames = existingTopics.map((t) => t.title).join(', ');

  const aiConfig = await createAIClientConfig();
  const messages = [
    { role: 'system', content: COMPILER_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `User's existing topics: [${topicNames}]\n\nResearch intent:\n${intent}`,
    },
  ];

  const response = await callChatAPI(aiConfig, messages, {
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI returned empty response');

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('AI returned invalid JSON');
  }

  // Resolve topic
  let suggestedTopicId = null;
  if (parsed.suggested_topic_title) {
    const match = existingTopics.find(
      (t) => t.title.toLowerCase() === parsed.suggested_topic_title.toLowerCase()
    );
    if (match) suggestedTopicId = match.id;
  }

  return {
    title: parsed.title || intent.slice(0, 50),
    task_spec: parsed.task_spec || {},
    schedule: parsed.schedule || { type: 'manual' },
    suggested_topic_id: suggestedTopicId,
  };
}
