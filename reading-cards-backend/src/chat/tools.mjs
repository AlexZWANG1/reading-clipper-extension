// ========= AI Chat Tool Definitions (Harness V2) =========
// Single source of truth for tools and their runtime risk levels.

export const TOOL_DEFINITIONS = [
  // ── Read / Search ─────────────────────────────────────
  {
    type: "function",
    function: {
      name: "semantic_search",
      description:
        "在已摄入材料中做语义检索。适用：用户要求找原文证据、具体数据、段落出处。不适用：仅凭已有上下文即可回答。返回 results[{text,score,source,material_id}]。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "检索问题或关键词" },
          limit: { type: "number", description: "返回数量，默认 10，最大 20" },
          min_score: { type: "number", description: "最小相似度，默认 0.3" },
          topic_id: { type: "string", description: "可选：限定主题" },
          material_id: { type: "string", description: "可选：限定材料" },
        },
        required: ["query"],
      },
    },
    risk_level: "auto",
  },
  {
    type: "function",
    function: {
      name: "search_cards",
      description:
        "按关键词检索卡片摘要。适用：查找已沉淀知识。不适用：查找材料原文段落（请用 semantic_search）。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "关键词或短语" },
          topic_id: { type: "string", description: "可选：限定主题" },
        },
        required: ["query"],
      },
    },
    risk_level: "auto",
  },
  {
    type: "function",
    function: {
      name: "list_cards",
      description: "列出卡片，可按 topic_id 过滤。适用：用户要浏览已有证据。",
      parameters: {
        type: "object",
        properties: {
          topic_id: { type: "string", description: "可选：主题 ID" },
          limit: { type: "number", description: "数量上限，默认 20，最大 50" },
        },
        required: [],
      },
    },
    risk_level: "auto",
  },
  {
    type: "function",
    function: {
      name: "get_card",
      description: "读取单张卡片详情。适用：需要核对 raw_snippet、来源、关键点。",
      parameters: {
        type: "object",
        properties: {
          card_id: { type: "string", description: "卡片 ID" },
        },
        required: ["card_id"],
      },
    },
    risk_level: "auto",
  },
  {
    type: "function",
    function: {
      name: "list_topics",
      description: "列出用户所有研究主题及卡片数量。",
      parameters: { type: "object", properties: {}, required: [] },
    },
    risk_level: "auto",
  },
  {
    type: "function",
    function: {
      name: "list_materials",
      description: "列出已摄入材料。适用：确认材料是否存在、状态是否完成。",
      parameters: {
        type: "object",
        properties: {
          topic_id: { type: "string", description: "可选：主题 ID" },
          status: {
            type: "string",
            enum: ["pending", "processing", "completed", "failed", "retrying"],
            description: "可选：摄入状态",
          },
          limit: { type: "number", description: "数量上限，默认 20，最大 50" },
        },
        required: [],
      },
    },
    risk_level: "auto",
  },
  {
    type: "function",
    function: {
      name: "get_material",
      description: "读取单个材料详情（含 excerpt）。适用：确认材料元信息或快速预览内容。",
      parameters: {
        type: "object",
        properties: {
          material_id: { type: "string", description: "材料 ID" },
        },
        required: ["material_id"],
      },
    },
    risk_level: "auto",
  },
  {
    type: "function",
    function: {
      name: "list_sources",
      description: "列出信息源，可按 category/status 过滤。",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", description: "来源类别" },
          status: { type: "string", enum: ["active", "inactive", "archived"], description: "来源状态" },
        },
        required: [],
      },
    },
    risk_level: "auto",
  },
  {
    type: "function",
    function: {
      name: "list_boards",
      description: "列出用户所有思维画板。",
      parameters: { type: "object", properties: {}, required: [] },
    },
    risk_level: "auto",
  },
  {
    type: "function",
    function: {
      name: "get_board",
      description:
        "获取画板完整结构（nodes/edges）。适用：任何画板改动前先读取现状。不适用：直接盲改结构。",
      parameters: {
        type: "object",
        properties: {
          board_id: { type: "string", description: "画板 ID" },
        },
        required: ["board_id"],
      },
    },
    risk_level: "auto",
  },
  {
    type: "function",
    function: {
      name: "list_documents",
      description: "列出研究文档，可按 topic_id 过滤。",
      parameters: {
        type: "object",
        properties: {
          topic_id: { type: "string", description: "可选：主题 ID" },
        },
        required: [],
      },
    },
    risk_level: "auto",
  },
  {
    type: "function",
    function: {
      name: "get_document",
      description: "读取单个文档完整内容。",
      parameters: {
        type: "object",
        properties: {
          doc_id: { type: "string", description: "文档 ID" },
        },
        required: ["doc_id"],
      },
    },
    risk_level: "auto",
  },

  // ── Fetch / Ingest ─────────────────────────────────
  {
    type: "function",
    function: {
      name: "fetch_rss",
      description: "抓取 RSS 条目。适用：用户明确要求看订阅源更新或新闻候选集合。",
      parameters: {
        type: "object",
        properties: {
          feeds: { type: "array", items: { type: "string" }, description: "RSS/Atom 链接数组" },
          max_items: { type: "number", description: "最大条目数，默认 20" },
          keywords: { type: "array", items: { type: "string" }, description: "可选：关键词过滤" },
        },
        required: ["feeds"],
      },
    },
    risk_level: "auto",
  },
  {
    type: "function",
    function: {
      name: "ingest_url",
      description:
        "摄入 URL 到知识库并触发分块与嵌入。适用：用户明确要求导入/摄入链接。不适用：仅做内容解释时。参数规则：必须提供 url。",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "目标 URL" },
          title: { type: "string", description: "可选：覆盖标题" },
          topic_id: { type: "string", description: "可选：关联主题" },
        },
        required: ["url"],
      },
    },
    risk_level: "auto",
  },

  // ── Cards / Board Mutations ────────────────────────
  {
    type: "function",
    function: {
      name: "create_card",
      description: [
        "创建知识卡片（证据沉淀）。",
        "什么时候该用：用户明确表达“保存/提取/摘录/创建卡片”。",
        "什么时候不该用：用户只是“总结/分析/解释”时，不要创建卡片，直接文字回答。",
        "参数规则：raw_snippet 必须是来源原文摘录；如果不确定原文，先 semantic_search 再复制 text 字段。",
        "违反规则会返回结构化校验错误，需要按 suggestion 修正后重试。",
      ].join("\n"),
      parameters: {
        type: "object",
        properties: {
          topic_title: { type: "string", description: "卡片所属主题名称（必填）" },
          title: { type: "string", description: "可选：短标题" },
          fact_or_view: { type: "string", enum: ["fact", "view"], description: "事实或观点，默认 fact" },
          summary: { type: "string", description: "1-3 句摘要（必填）" },
          key_points: { type: "array", items: { type: "string" }, description: "2-5 条要点" },
          raw_snippet: { type: "string", description: "原文摘录（必填，且需可追溯）" },
          note: { type: "string", description: "可选：备注" },
          source_name: { type: "string", description: "可选：来源名称" },
          source_url: { type: "string", description: "可选：来源 URL" },
        },
        required: ["topic_title", "summary", "raw_snippet"],
      },
    },
    risk_level: "auto",
  },
  {
    type: "function",
    function: {
      name: "create_board_node",
      description:
        "创建画板节点（question/hypothesis/evidence）。参数规则：hypothesis 必须挂在 question 下，evidence 必须挂在 hypothesis 下。",
      parameters: {
        type: "object",
        properties: {
          board_id: { type: "string", description: "画板 ID" },
          node_type: { type: "string", enum: ["question", "hypothesis", "evidence"], description: "节点类型" },
          text: { type: "string", description: "节点文本" },
          parent_id: { type: "string", description: "父节点 ID（hypothesis/evidence 必填）" },
          card_id: { type: "string", description: "可选：证据节点关联卡片 ID" },
        },
        required: ["board_id", "node_type", "text"],
      },
    },
    risk_level: "confirm",
  },
  {
    type: "function",
    function: {
      name: "update_board_node",
      description: "更新画板节点文本/状态/置信度等属性。",
      parameters: {
        type: "object",
        properties: {
          node_id: { type: "string", description: "节点 ID" },
          text: { type: "string", description: "可选：新文本" },
          status: { type: "string", enum: ["open", "resolved", "blocked"], description: "question 状态" },
          hypo_state: { type: "string", enum: ["pending", "validated", "falsified"], description: "hypothesis 状态" },
          confidence: { type: "number", description: "置信度 0-1" },
          priority: { type: "string", enum: ["normal", "critical"], description: "优先级" },
        },
        required: ["node_id"],
      },
    },
    risk_level: "confirm",
  },
  {
    type: "function",
    function: {
      name: "delete_board_node",
      description: "删除节点（会级联删除其子节点与边）。高风险操作。",
      parameters: {
        type: "object",
        properties: {
          node_id: { type: "string", description: "节点 ID" },
        },
        required: ["node_id"],
      },
    },
    risk_level: "confirm_warn",
  },
  {
    type: "function",
    function: {
      name: "create_board_edge",
      description:
        "创建节点关系边。relation_type 只能是 supports/refutes/neutral。",
      parameters: {
        type: "object",
        properties: {
          board_id: { type: "string", description: "画板 ID" },
          source_node_id: { type: "string", description: "源节点 ID" },
          target_node_id: { type: "string", description: "目标节点 ID" },
          relation_type: { type: "string", enum: ["supports", "refutes", "neutral"], description: "关系类型" },
        },
        required: ["board_id", "source_node_id", "target_node_id", "relation_type"],
      },
    },
    risk_level: "confirm",
  },
  {
    type: "function",
    function: {
      name: "delete_board_edge",
      description: "删除关系边。高风险操作。",
      parameters: {
        type: "object",
        properties: {
          edge_id: { type: "string", description: "边 ID" },
        },
        required: ["edge_id"],
      },
    },
    risk_level: "confirm_warn",
  },
  {
    type: "function",
    function: {
      name: "propose_board_changes",
      description: [
        "批量提议画板变更，创建草稿供前端预览审批（不直接写入真实节点）。",
        "什么时候该用：用户要求批量增改画板结构。",
        "什么时候不该用：仅查询画板状态时。",
        "参数规则：hypothesis/evidence 的 create_node 必须提供 parent_id；edge 的 relation_type 必须合法。",
        "可以使用 $temp_id 引用同一草稿内新建节点。",
      ].join("\n"),
      parameters: {
        type: "object",
        properties: {
          board_id: { type: "string", description: "画板 ID" },
          changes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                action: { type: "string", enum: ["create_node", "create_edge"], description: "操作类型" },
                temp_id: { type: "string", description: "临时引用 ID（如 t1）" },
                node_type: { type: "string", enum: ["question", "hypothesis", "evidence"], description: "节点类型" },
                text: { type: "string", description: "节点文本" },
                parent_id: { type: "string", description: "父节点 ID，可用 $temp_id" },
                card_id: { type: "string", description: "证据卡片 ID" },
                source_node_id: { type: "string", description: "边起点 ID，可用 $temp_id" },
                target_node_id: { type: "string", description: "边终点 ID，可用 $temp_id" },
                relation_type: { type: "string", enum: ["supports", "refutes", "neutral"], description: "关系类型" },
              },
              required: ["action"],
            },
            description: "变更数组",
          },
          reasoning: { type: "string", description: "提议理由" },
        },
        required: ["board_id", "changes", "reasoning"],
      },
    },
    risk_level: "auto",
  },

  // ── Topic Health / Methodology ──────────────────────
  {
    type: "function",
    function: {
      name: "get_board_health",
      description: "获取主题论证健康状态（假说数、证据数、盲点等）。需 topic_id。",
      parameters: {
        type: "object",
        properties: {
          topic_id: { type: "string", description: "主题 ID" },
        },
        required: ["topic_id"],
      },
    },
    risk_level: "auto",
  },
  {
    type: "function",
    function: {
      name: "get_methodology",
      description:
        "按需读取用户当前启用的方法论文档和结构化配置。适用：在执行研究分析前需要了解用户偏好与方法论约束。",
      parameters: { type: "object", properties: {}, required: [] },
    },
    risk_level: "auto",
  },
];

export const LLM_TOOL_DEFINITIONS = TOOL_DEFINITIONS.map((t) => ({
  type: t.type,
  function: t.function,
}));

export const TOOL_MAP = Object.fromEntries(
  TOOL_DEFINITIONS.map((t) => [t.function.name, t])
);

export function getToolRiskLevel(name) {
  return TOOL_MAP[name]?.risk_level || "auto";
}

const CHAT_MODE_BLOCKED_TOOLS = new Set([
  "propose_board_changes",
  "create_card",
  "ingest_url",
]);

export function isWriteCapableTool(name) {
  return CHAT_MODE_BLOCKED_TOOLS.has(name);
}

export function buildConfirmMessage(name, args = {}) {
  switch (name) {
    case "create_board_node":
      return `创建 ${args.node_type || "节点"}: "${String(args.text || "").slice(0, 80)}"`;
    case "update_board_node":
      return `更新节点 ${args.node_id || ""}`;
    case "delete_board_node":
      return `删除节点 ${args.node_id || ""}（将级联删除子节点）`;
    case "create_board_edge":
      return `创建 ${args.relation_type || "关系"} 边`;
    case "delete_board_edge":
      return `删除关系边 ${args.edge_id || ""}`;
    default:
      return `执行 ${name}`;
  }
}

export function summarizeToolResult(tool, result) {
  if (!result) return "无结果";
  if (result.error) return `错误: ${result.error}`;
  if (result.warning) return `警告: ${result.warning}`;

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
    case "get_methodology":
      return result.methodology ? "已加载方法论" : "未设置方法论";
    default:
      return JSON.stringify(result).slice(0, 120);
  }
}

