// ========= AI Chat Tool Definitions =========
// Canonical tool specs — single source of truth for all tools the AI can invoke.
// Each tool has a `side_effect` metadata used by the orchestrator's confirmation gate.

// side_effect values:
//   "read_only"   — auto-execute, no confirmation needed
//   "write"       — requires user confirmation before execution
//   "destructive" — requires user confirmation + warning

export const TOOL_DEFINITIONS = [
  // ── Read-only tools ────────────────────────────────
  {
    type: "function",
    function: {
      name: "semantic_search",
      description:
        "语义搜索用户已摄入的文档内容（基于向量相似度）。用于查找文档中的具体信息。返回: {results: [{chunk_text, score, source_title, material_id}], total: number}",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query or question" },
          limit: { type: "number", description: "Max results to return (default 10, max 20)" },
          min_score: { type: "number", description: "Minimum similarity score 0-1 (default 0.3)" },
          topic_id: { type: "string", description: "Optional: limit search to a specific topic" },
          material_id: { type: "string", description: "Optional: limit search to chunks from a specific material (useful for reading a specific document)" },
        },
        required: ["query"],
      },
    },
    side_effect: "read_only",
    plan_allowed: true,
    task_auto: true,
    task_phases: ["filter"],
    task_capability: "search",
  },
  {
    type: "function",
    function: {
      name: "search_cards",
      description:
        "按关键词搜索用户的知识卡片。搜索范围是已提取的卡片摘要，不是原始文档。返回: {cards: [{id, title, summary, topic_id}], count: number}",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search keyword or phrase" },
          topic_id: { type: "string", description: "Optional: limit search to a specific topic" },
        },
        required: ["query"],
      },
    },
    side_effect: "read_only",
    plan_allowed: true,
    task_auto: true,
    task_phases: ["filter"],
    task_capability: "search",
  },
  {
    type: "function",
    function: {
      name: "list_cards",
      description: "列出用户的知识卡片，可按主题筛选。返回: {cards: [{id, title, summary, topic_id, fact_or_view}], total: number}",
      parameters: {
        type: "object",
        properties: {
          topic_id: { type: "string", description: "Optional: filter by topic ID" },
          limit: { type: "number", description: "Max cards to return (default 20, max 50)" },
        },
        required: [],
      },
    },
    side_effect: "read_only",
    plan_allowed: true,
    task_auto: true,
    task_phases: [],
    task_capability: "knowledge_read",
  },
  {
    type: "function",
    function: {
      name: "get_card",
      description: "获取单张卡片的详细信息。返回: {card: {id, title, summary, key_points, raw_snippet, fact_or_view, source_name, source_url}}",
      parameters: {
        type: "object",
        properties: {
          card_id: { type: "string", description: "The card ID" },
        },
        required: ["card_id"],
      },
    },
    side_effect: "read_only",
    plan_allowed: true,
    task_auto: true,
    task_phases: [],
    task_capability: "knowledge_read",
  },
  {
    type: "function",
    function: {
      name: "list_topics",
      description: "列出用户的所有主题及卡片数量。返回: {topics: [{id, title, card_count}]}",
      parameters: { type: "object", properties: {}, required: [] },
    },
    side_effect: "read_only",
    plan_allowed: true,
    task_auto: true,
    task_phases: [],
    task_capability: "knowledge_read",
  },
  {
    type: "function",
    function: {
      name: "list_materials",
      description:
        "列出用户已摄入的材料（文档、URL、文本）。可按 topic 筛选。返回: {materials: [{id, title, source_type, url, ingestion_status, word_count, chunk_count, topic_id, created_at}], total: number}",
      parameters: {
        type: "object",
        properties: {
          topic_id: { type: "string", description: "Optional: filter by topic ID" },
          status: { type: "string", enum: ["pending", "processing", "completed", "failed"], description: "Optional: filter by ingestion status" },
          limit: { type: "number", description: "Max materials to return (default 20, max 50)" },
        },
        required: [],
      },
    },
    side_effect: "read_only",
    plan_allowed: true,
    task_auto: true,
    task_phases: [],
    task_capability: "knowledge_read",
  },
  {
    type: "function",
    function: {
      name: "get_material",
      description:
        "获取单个材料的详情，包括标题、来源、状态和摘要（前500字）。如需深入查看文档内容，请用 semantic_search 并传入 material_id 参数进行针对性搜索。返回: {material: {id, title, source_type, url, ingestion_status, word_count, chunk_count, topic_id, excerpt, created_at}}",
      parameters: {
        type: "object",
        properties: {
          material_id: { type: "string", description: "The material ID" },
        },
        required: ["material_id"],
      },
    },
    side_effect: "read_only",
    plan_allowed: true,
    task_auto: true,
    task_phases: [],
    task_capability: "knowledge_read",
  },
  {
    type: "function",
    function: {
      name: "list_sources",
      description: "列出用户的信息来源，可按类别或状态筛选。返回: {sources: [{id, name, url, category, status}]}",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", description: "Filter by source category" },
          status: { type: "string", enum: ["active", "inactive", "archived"], description: "Filter by source status" },
        },
        required: [],
      },
    },
    side_effect: "read_only",
    plan_allowed: true,
    task_auto: true,
    task_phases: [],
    task_capability: "knowledge_read",
  },
  {
    type: "function",
    function: {
      name: "list_boards",
      description: "列出用户的所有思维画板。返回: {boards: [{id, title, topic_id}]}",
      parameters: { type: "object", properties: {}, required: [] },
    },
    side_effect: "read_only",
    plan_allowed: true,
    task_auto: true,
    task_phases: [],
    task_capability: "knowledge_read",
  },
  {
    type: "function",
    function: {
      name: "get_board",
      description: "获取思维画板的完整节点和边数据。返回: {board: {id, title, nodes: [{id, node_type, content, parent_id, status}], edges: [{source_node_id, target_node_id, relation_type}]}}",
      parameters: {
        type: "object",
        properties: {
          board_id: { type: "string", description: "The board ID" },
        },
        required: ["board_id"],
      },
    },
    side_effect: "read_only",
    plan_allowed: true,
    task_auto: true,
    task_phases: [],
    task_capability: "knowledge_read",
  },
  {
    type: "function",
    function: {
      name: "list_documents",
      description: "列出用户的研究文档，可按主题筛选。返回: {documents: [{id, title, topic_id}]}",
      parameters: {
        type: "object",
        properties: {
          topic_id: { type: "string", description: "Optional: filter by topic ID" },
        },
        required: [],
      },
    },
    side_effect: "read_only",
    plan_allowed: true,
    task_auto: true,
    task_phases: [],
    task_capability: "knowledge_read",
  },
  {
    type: "function",
    function: {
      name: "get_document",
      description: "获取单个文档的完整内容，包括问题、假说和章节。返回: {document: {id, title, content, topic_id}}",
      parameters: {
        type: "object",
        properties: {
          doc_id: { type: "string", description: "The document ID" },
        },
        required: ["doc_id"],
      },
    },
    side_effect: "read_only",
    plan_allowed: true,
    task_auto: true,
    task_phases: [],
    task_capability: "knowledge_read",
  },

  // ── Task-oriented tools (used by plan executor + chat) ────
  {
    type: "function",
    function: {
      name: "fetch_rss",
      description:
        "从 RSS 源抓取文章列表，返回标题、URL、摘要和发布时间。可用关键词过滤。",
      parameters: {
        type: "object",
        properties: {
          feeds: {
            type: "array",
            items: { type: "string" },
            description: "Array of RSS feed URLs to fetch",
          },
          max_items: { type: "number", description: "Maximum items to return (default 20)" },
          keywords: {
            type: "array",
            items: { type: "string" },
            description: "Optional: filter items by keywords (title/summary must contain at least one)",
          },
        },
        required: ["feeds"],
      },
    },
    side_effect: "read_only",
    plan_allowed: true,
    task_auto: true,
    task_phases: ["collect"],
    task_capability: "content_fetch",
  },
  {
    type: "function",
    function: {
      name: "ingest_url",
      description:
        "将 URL 内容摄入知识库。提取内容、创建材料记录并触发分块和嵌入。",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL to ingest" },
          title: { type: "string", description: "Optional: override the article title" },
          topic_id: { type: "string", description: "Optional: associate with a topic" },
        },
        required: ["url"],
      },
    },
    side_effect: "write",
    plan_allowed: true,
    confirm_template: "摄入 URL: {url}",
    task_auto: true,
    task_phases: ["materialize"],
    task_capability: "content_ingest",
  },

  // ── Write tools (cards + board mutations) ─────────
  {
    type: "function",
    function: {
      name: "create_card",
      description:
        `从源材料中提取并保存知识卡片。\n\n触发条件（必须全部满足）：\n1. 用户使用了"保存""创建卡片""提取""摘录"等明确存储意图的词\n2. 有明确的源材料（URL、文章、或对话中引用的文档）\n3. summary 和 key_points 基于源材料原文，不是 AI 的推理\n\n不触发：用户说"总结/分析/解释" → 用文字回复，不创建卡片`,
      parameters: {
        type: "object",
        properties: {
          topic_title: {
            type: "string",
            description: "Topic name for the card. Auto-created if it doesn't exist.",
          },
          title: {
            type: "string",
            description: "A short, catchy title (3-8 words).",
          },
          fact_or_view: {
            type: "string",
            enum: ["fact", "view"],
            description: "Whether the card is an objective fact/data or a subjective view/opinion. Default: fact.",
          },
          summary: {
            type: "string",
            description: "A concise 1-3 sentence summary of what the source says. Must paraphrase the source material, not your own analysis or inference.",
          },
          key_points: {
            type: "array",
            items: { type: "string" },
            description: "Key takeaways from the source material (2-5 items). Each point must derive from what the source says, not your reasoning about it.",
          },
          raw_snippet: {
            type: "string",
            description: "MUST be an exact substring copied from the source material. Do not paraphrase, summarize, or rewrite. This is the verbatim quote the card is based on.",
          },
          note: {
            type: "string",
            description: "Optional annotation or note about this card.",
          },
          source_name: {
            type: "string",
            description: "Name of the information source (e.g., article title, book name).",
          },
          source_url: {
            type: "string",
            description: "URL of the information source.",
          },
        },
        required: ["topic_title", "summary"],
      },
    },
    side_effect: "write",
    plan_allowed: true,
    confirm_template: "创建卡片到主题「{topic_title}」: \"{summary}\"",
    task_auto: true,
    task_phases: ["cardify"],
    task_capability: "knowledge_capture",
  },
  {
    type: "function",
    function: {
      name: "create_board_node",
      description: "在思维画板上创建新节点。节点类型：question、hypothesis、evidence。",
      parameters: {
        type: "object",
        properties: {
          board_id: { type: "string", description: "The board ID" },
          node_type: { type: "string", enum: ["question", "hypothesis", "evidence"], description: "Type of node" },
          text: { type: "string", description: "Node content text (used as content.text for questions, claim for hypotheses)" },
          parent_id: { type: "string", description: "Optional: parent node ID for decomposition tree" },
          card_id: { type: "string", description: "Optional: linked card ID (for evidence nodes)" },
        },
        required: ["board_id", "node_type", "text"],
      },
    },
    side_effect: "write",
    plan_allowed: true,
    confirm_template: "创建{node_type}节点: \"{text}\"",
    task_auto: false,
    task_phases: ["synthesize"],
    task_capability: "structure_mutation",
  },
  {
    type: "function",
    function: {
      name: "update_board_node",
      description: "更新画板上已有节点的文本、状态、置信度等属性。",
      parameters: {
        type: "object",
        properties: {
          node_id: { type: "string", description: "The node ID to update" },
          text: { type: "string", description: "New text content" },
          status: { type: "string", enum: ["open", "resolved", "blocked"], description: "Question status" },
          hypo_state: { type: "string", enum: ["pending", "validated", "falsified"], description: "Hypothesis state" },
          confidence: { type: "number", description: "Hypothesis confidence 0-1" },
          priority: { type: "string", enum: ["normal", "critical"], description: "Question priority" },
        },
        required: ["node_id"],
      },
    },
    side_effect: "write",
    plan_allowed: false,
    confirm_template: "更新节点内容",
    task_auto: false,
    task_phases: ["synthesize"],
    task_capability: "structure_mutation",
  },
  {
    type: "function",
    function: {
      name: "delete_board_node",
      description: "删除画板节点及其所有子节点和连接的边。",
      parameters: {
        type: "object",
        properties: {
          node_id: { type: "string", description: "The node ID to delete" },
        },
        required: ["node_id"],
      },
    },
    side_effect: "destructive",
    plan_allowed: false,
    confirm_template: "删除节点及其所有子节点",
    task_auto: false,
    task_phases: [],
    task_capability: "structure_mutation",
  },
  {
    type: "function",
    function: {
      name: "create_board_edge",
      description: "在画板节点之间创建关系边（supports/refutes/neutral）。",
      parameters: {
        type: "object",
        properties: {
          board_id: { type: "string", description: "The board ID" },
          source_node_id: { type: "string", description: "Source node ID (usually hypothesis)" },
          target_node_id: { type: "string", description: "Target node ID (usually evidence)" },
          relation_type: { type: "string", enum: ["supports", "refutes", "neutral"], description: "Relation type" },
        },
        required: ["board_id", "source_node_id", "target_node_id", "relation_type"],
      },
    },
    side_effect: "write",
    plan_allowed: true,
    confirm_template: "创建{relation_type}关系边",
    task_auto: false,
    task_phases: ["synthesize"],
    task_capability: "structure_mutation",
  },

  {
    type: "function",
    function: {
      name: "delete_board_edge",
      description: "删除画板上的关系边。",
      parameters: {
        type: "object",
        properties: {
          edge_id: { type: "string", description: "The edge ID to delete" },
        },
        required: ["edge_id"],
      },
    },
    side_effect: "destructive",
    plan_allowed: false,
    confirm_template: "删除关系边",
    task_auto: false,
    task_phases: [],
    task_capability: "structure_mutation",
  },

  // ── Draft tools (auto-execute, creates preview not real data) ──
  {
    type: "function",
    function: {
      name: "propose_board_changes",
      description:
        "提议对思维画板的批量更改，创建可视化草稿供用户在画板上审批。使用此工具代替逐个 create_board_node/create_board_edge 调用。changes 数组中每项：create_node 必须提供 action, node_type, text（hypothesis/evidence 还必须提供 parent_id）；create_edge 必须提供 action, source_node_id, target_node_id, relation_type。返回: {draft_id, changes_count, message}",
      parameters: {
        type: "object",
        properties: {
          board_id: { type: "string", description: "The board ID" },
          changes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                action: { type: "string", enum: ["create_node", "create_edge"], description: "Action type" },
                temp_id: { type: "string", description: "Temp ID for cross-referencing (e.g. 't1')" },
                node_type: { type: "string", enum: ["question", "hypothesis", "evidence"], description: "Node type (for create_node)" },
                text: { type: "string", description: "Node content text" },
                parent_id: { type: "string", description: "Real UUID or $temp_id reference (e.g. '$t1')" },
                card_id: { type: "string", description: "Card UUID for evidence nodes" },
                source_node_id: { type: "string", description: "Source node for edges" },
                target_node_id: { type: "string", description: "Target node for edges" },
                relation_type: { type: "string", enum: ["supports", "refutes", "neutral"], description: "Edge relation type" },
              },
              required: ["action"],
            },
            description: "Array of change operations",
          },
          reasoning: { type: "string", description: "Why these changes are proposed" },
        },
        required: ["board_id", "changes", "reasoning"],
      },
    },
    side_effect: "draft",
    plan_allowed: false,
    task_auto: false,
    task_phases: ["synthesize"],
    task_capability: "structure_mutation",
  },

  // ── Health tool (read-only) ──
  {
    type: "function",
    function: {
      name: "get_board_health",
      description:
        "获取主题的论证健康状态。返回: {total_hypotheses, total_evidence, blind_spots, hypotheses_summary: [{text, support, refute, status}], unanswered_questions}。纯数据计算，无 AI 调用。",
      parameters: {
        type: "object",
        properties: {
          topic_id: { type: "string", description: "The topic ID to check health for" },
        },
        required: ["topic_id"],
      },
    },
    side_effect: "read_only",
    plan_allowed: true,
    task_auto: true,
    task_phases: [],
    task_capability: "knowledge_read",
  },

  // ── Meta tool (plan request) ──
  {
    type: "function",
    function: {
      name: "request_plan",
      description: "当用户描述的任务需要 4 步以上、涉及多个数据源、或需要定期执行时，调用此工具请求生成执行计划。不要自己尝试逐步执行多步骤任务。返回: {plan_requested: true}",
      parameters: {
        type: "object",
        properties: {
          intent: {
            type: "string",
            description: "用一段话描述用户想要完成的任务，包含关键细节（数据源、筛选条件、输出格式等）"
          }
        },
        required: ["intent"]
      }
    },
    side_effect: "read_only",
    plan_allowed: false,
    task_auto: false,
    task_phases: [],
    task_capability: "meta",
  },
];

// Quick lookup map: tool name → full definition (including side_effect)
export const TOOL_MAP = Object.fromEntries(
  TOOL_DEFINITIONS.map((t) => [t.function.name, t])
);

// Get side_effect for a tool name. Defaults to "read_only" if unknown.
export function getToolSideEffect(name) {
  return TOOL_MAP[name]?.side_effect || "read_only";
}

// Build confirmation message from template + args
export function buildConfirmMessage(name, args) {
  const tmpl = TOOL_MAP[name]?.confirm_template;
  if (!tmpl) return `执行 ${name}`;
  return tmpl.replace(/\{(\w+)\}/g, (_, key) => args[key] ?? key);
}

/**
 * Summarize a tool result into a short display string.
 * Single source of truth — used by orchestrator and executor.
 */
export function summarizeToolResult(tool, result) {
  if (!result) return "无结果";
  if (result.error) return `错误: ${result.error}`;

  switch (tool) {
    case "fetch_rss":
      return `抓取了 ${result.items?.length || 0} 条 RSS 条目`;
    case "semantic_search":
      return `找到 ${result.total || result.results?.length || 0} 条相关内容`;
    case "search_cards":
      return `找到 ${result.count || result.cards?.length || 0} 张相关卡片`;
    case "ingest_url":
      return `已摄入: ${result.title || result.material_id || "unknown"}`;
    case "create_card": {
      const summary = `已创建卡片: ${result.card?.title || result.message || ""}`;
      return result.snippet_warning ? `${summary} ⚠ ${result.snippet_warning}` : summary;
    }
    case "list_cards":
      return `列出 ${result.total || result.cards?.length || 0} 张卡片`;
    case "list_topics":
      return `列出 ${result.topics?.length || 0} 个主题`;
    case "list_materials":
      return `列出 ${result.total || result.materials?.length || 0} 个材料`;
    case "get_material":
      return result.material ? `材料: ${result.material.title || ""}` : "未找到";
    case "list_boards":
      return `列出 ${result.boards?.length || 0} 个论证板`;
    case "get_board":
      return `加载论证板: ${result.board?.title || ""}`;
    case "list_documents":
      return `列出 ${result.documents?.length || 0} 份文档`;
    case "get_document":
      return `加载文档: ${result.document?.title || ""}`;
    case "list_sources":
      return `列出 ${result.sources?.length || 0} 个来源`;
    case "get_card":
      return result.card ? `卡片: ${result.card.title || result.card.summary?.slice(0, 30) || ""}` : "未找到";
    case "create_board_node":
      return result.message || "节点已创建";
    case "update_board_node":
      return result.message || "节点已更新";
    case "delete_board_node":
      return result.message || "节点已删除";
    case "create_board_edge":
      return result.message || "关系已创建";
    case "delete_board_edge":
      return result.message || "关系已删除";
    case "propose_board_changes":
      return `草拟了 ${result.changes_count || 0} 个更改`;
    case "get_board_health":
      return `假说: ${result.total_hypotheses || 0}, 盲点: ${result.blind_spots || 0}`;
    default:
      return JSON.stringify(result).slice(0, 80);
  }
}
