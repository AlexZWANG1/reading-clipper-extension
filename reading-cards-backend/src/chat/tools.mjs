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
        "Semantic search across the user's ingested documents using vector similarity. This searches through all document chunks (from materials) and returns the most relevant passages based on meaning, not just keywords. Use this when the user asks questions about their documents or wants to find information across their knowledge base.",
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
  },
  {
    type: "function",
    function: {
      name: "search_cards",
      description:
        "Search the user's reading cards by keyword. Returns cards whose summary, raw_snippet, or note match the query. Use this for finding specific cards, not for searching document content.",
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
  },
  {
    type: "function",
    function: {
      name: "list_topics",
      description: "List all of the user's topics with card counts.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    side_effect: "read_only",
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
          status: { type: "string", enum: ["active", "paused", "archived"], description: "Filter by source status" },
        },
        required: [],
      },
    },
    side_effect: "read_only",
  },
  {
    type: "function",
    function: {
      name: "list_boards",
      description: "List the user's thinking boards.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    side_effect: "read_only",
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
  },

  // ── Write tools (cards + board mutations) ─────────
  {
    type: "function",
    function: {
      name: "create_card",
      description:
        "Create a new reading card in the user's global card pool. Use this when the user asks to generate, create, or save a card. The card is associated with a topic (auto-created if needed). Returns the card with its ID, which can later be used as card_id when creating evidence nodes on boards.",
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
    confirm_template: "更新节点 {node_id}",
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
    confirm_template: "删除节点 {node_id}（含所有子节点）",
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
