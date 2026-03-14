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
        },
        required: ["query"],
      },
    },
    side_effect: "read_only",
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
    task_auto: true,
    task_phases: ["filter"],
    task_capability: "search",
  },
  {
    type: "function",
    function: {
      name: "list_cards",
      description: "List the user's reading cards, optionally filtered by topic.",
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
    task_auto: true,
    task_phases: [],
    task_capability: "knowledge_read",
  },
  {
    type: "function",
    function: {
      name: "get_card",
      description: "Get a single card by its ID.",
      parameters: {
        type: "object",
        properties: {
          card_id: { type: "string", description: "The card ID" },
        },
        required: ["card_id"],
      },
    },
    side_effect: "read_only",
    task_auto: true,
    task_phases: [],
    task_capability: "knowledge_read",
  },
  {
    type: "function",
    function: {
      name: "list_topics",
      description: "List all of the user's topics with card counts.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    side_effect: "read_only",
    task_auto: true,
    task_phases: [],
    task_capability: "knowledge_read",
  },
  {
    type: "function",
    function: {
      name: "list_sources",
      description: "List the user's information sources, optionally filtered by category or status.",
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
    task_auto: true,
    task_phases: [],
    task_capability: "knowledge_read",
  },
  {
    type: "function",
    function: {
      name: "list_boards",
      description: "List the user's thinking boards.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    side_effect: "read_only",
    task_auto: true,
    task_phases: [],
    task_capability: "knowledge_read",
  },
  {
    type: "function",
    function: {
      name: "get_board",
      description: "Get a thinking board with all its nodes and edges.",
      parameters: {
        type: "object",
        properties: {
          board_id: { type: "string", description: "The board ID" },
        },
        required: ["board_id"],
      },
    },
    side_effect: "read_only",
    task_auto: true,
    task_phases: [],
    task_capability: "knowledge_read",
  },
  {
    type: "function",
    function: {
      name: "list_documents",
      description: "List the user's documents (stories), optionally filtered by topic.",
      parameters: {
        type: "object",
        properties: {
          topic_id: { type: "string", description: "Optional: filter by topic ID" },
        },
        required: [],
      },
    },
    side_effect: "read_only",
    task_auto: true,
    task_phases: [],
    task_capability: "knowledge_read",
  },
  {
    type: "function",
    function: {
      name: "get_document",
      description: "Get a single document by its ID, including questions, hypotheses, and story units.",
      parameters: {
        type: "object",
        properties: {
          doc_id: { type: "string", description: "The document ID" },
        },
        required: ["doc_id"],
      },
    },
    side_effect: "read_only",
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
        "Fetch items from one or more RSS feeds. Returns a list of articles with title, URL, summary, and publish date. Use this to collect fresh content from RSS sources.",
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
    task_auto: true,
    task_phases: ["collect"],
    task_capability: "content_fetch",
  },
  {
    type: "function",
    function: {
      name: "ingest_url",
      description:
        "Ingest a URL into the user's knowledge base. Extracts content, creates a material record, and triggers chunking + embedding. Returns the material ID.",
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
        "从源材料（文章、论文、文档）中提取并保存知识卡片。仅在用户明确要求提取、保存或创建卡片时使用。不要用此工具存储你自己的分析、总结或回答——那些属于你的文字回复。返回: {card: {id, title, summary}, message: string}",
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
            description: "A concise 1-3 sentence summary of the card content.",
          },
          key_points: {
            type: "array",
            items: { type: "string" },
            description: "List of key takeaways or bullet points (2-5 items).",
          },
          raw_snippet: {
            type: "string",
            description: "The original text snippet or quote this card is based on.",
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
    confirm_template: "创建卡片到主题「{topic_title}」: \"{summary}\"",
    task_auto: true,
    task_phases: ["cardify"],
    task_capability: "knowledge_capture",
  },
  {
    type: "function",
    function: {
      name: "create_board_node",
      description: "Create a new node on a thinking board. Node types: question, hypothesis, evidence.",
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
    confirm_template: "创建{node_type}节点: \"{text}\"",
    task_auto: false,
    task_phases: ["synthesize"],
    task_capability: "structure_mutation",
  },
  {
    type: "function",
    function: {
      name: "update_board_node",
      description: "Update an existing node on a thinking board. Can update text, status, confidence, priority, hypo_state.",
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
    confirm_template: "更新节点内容",
    task_auto: false,
    task_phases: ["synthesize"],
    task_capability: "structure_mutation",
  },
  {
    type: "function",
    function: {
      name: "delete_board_node",
      description: "Delete a node from a thinking board. This also removes all child nodes and connected edges.",
      parameters: {
        type: "object",
        properties: {
          node_id: { type: "string", description: "The node ID to delete" },
        },
        required: ["node_id"],
      },
    },
    side_effect: "destructive",
    confirm_template: "删除节点及其所有子节点",
    task_auto: false,
    task_phases: [],
    task_capability: "structure_mutation",
  },
  {
    type: "function",
    function: {
      name: "create_board_edge",
      description: "Create an edge between two nodes on a thinking board. Typically links a hypothesis to an evidence node with a relation type.",
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
    confirm_template: "创建{relation_type}关系边",
    task_auto: false,
    task_phases: ["synthesize"],
    task_capability: "structure_mutation",
  },

  {
    type: "function",
    function: {
      name: "delete_board_edge",
      description: "Delete an edge (relationship) from a thinking board.",
      parameters: {
        type: "object",
        properties: {
          edge_id: { type: "string", description: "The edge ID to delete" },
        },
        required: ["edge_id"],
      },
    },
    side_effect: "destructive",
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
        "Get the argument health status for a topic's thinking board. Returns per-hypothesis evidence balance (supports vs refutes), bias warnings, blind spots, and orphan card count. No AI call needed — pure data computation.",
      parameters: {
        type: "object",
        properties: {
          topic_id: { type: "string", description: "The topic ID to check health for" },
        },
        required: ["topic_id"],
      },
    },
    side_effect: "read_only",
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
