// ========= Shared Validation Helpers =========
// Pure validation helpers used by toolExecutor and draftEngine.

function buildHierarchyError(message, suggestion, currentState = null) {
  return {
    error: "hierarchy_violation",
    message,
    ...(currentState ? { current_state: currentState } : {}),
    suggestion,
  };
}

/**
 * Validate Q -> H -> E hierarchy.
 * @param {string} nodeType
 * @param {string|null|undefined} parentId
 * @param {string|null|undefined} parentNodeType
 * @returns {object|null}
 */
export function validateNodeHierarchy(nodeType, parentId, parentNodeType) {
  if (nodeType === "question") return null;

  if ((nodeType === "hypothesis" || nodeType === "evidence") && !parentId) {
    return buildHierarchyError(
      `${nodeType} 节点必须提供 parent_id。`,
      nodeType === "hypothesis"
        ? "请先选择一个问题节点(question)作为父节点。"
        : "请先选择一个假说节点(hypothesis)作为父节点。",
      { node_type: nodeType, parent_id: parentId || null }
    );
  }

  if (!parentId || !parentNodeType) return null;

  if (nodeType === "hypothesis" && parentNodeType !== "question") {
    return buildHierarchyError(
      `hypothesis 的父节点必须是 question，但当前 parent(${parentId}) 是 ${parentNodeType}。`,
      "请改用 question 节点作为 parent_id。",
      { node_type: nodeType, parent_id: parentId, parent_node_type: parentNodeType }
    );
  }

  if (nodeType === "evidence" && parentNodeType !== "hypothesis") {
    return buildHierarchyError(
      `evidence 的父节点必须是 hypothesis，但当前 parent(${parentId}) 是 ${parentNodeType}。`,
      "请改用 hypothesis 节点作为 parent_id。",
      { node_type: nodeType, parent_id: parentId, parent_node_type: parentNodeType }
    );
  }

  return null;
}

/**
 * Validate create_card input.
 * @param {object} args
 * @returns {object|null}
 */
export function validateCardData(args) {
  const topicTitle = String(args?.topic_title || "").trim();
  const summary = String(args?.summary || "").trim();
  const rawSnippet = String(args?.raw_snippet || "").trim();

  if (!topicTitle) {
    return {
      error: "card_validation_failed",
      message: "topic_title 不能为空。",
      suggestion: "请先确认卡片所属主题，再调用 create_card。",
      current_state: { topic_title: topicTitle || null },
    };
  }

  if (!summary) {
    return {
      error: "card_validation_failed",
      message: "summary 不能为空。",
      suggestion: "请基于材料内容填写 1-3 句摘要。",
      current_state: { summary: summary || null },
    };
  }

  if (!rawSnippet || rawSnippet.length < 10) {
    return {
      error: "card_validation_failed",
      message: "raw_snippet 必须是至少 10 个字符的原文摘录。",
      suggestion: "请先用 semantic_search 搜索原文，再复制 text 字段作为 raw_snippet。",
      current_state: { raw_snippet_length: rawSnippet.length },
    };
  }

  if (summary === rawSnippet) {
    return {
      error: "card_validation_failed",
      message: "summary 不能与 raw_snippet 完全相同。",
      suggestion: "summary 请写成简洁概述，raw_snippet 保持原文引用。",
    };
  }

  return null;
}

/**
 * Validate edge relation type.
 * @param {string} relationType
 * @returns {object|null}
 */
export function validateEdgeRelation(relationType) {
  const allowed = ["supports", "refutes", "neutral"];
  if (!allowed.includes(relationType)) {
    return {
      error: "edge_validation_failed",
      message: `relation_type 只能是 supports/refutes/neutral，收到 "${relationType}"。`,
      available_options: allowed,
      suggestion: "请改用 supports、refutes 或 neutral。",
    };
  }
  return null;
}

