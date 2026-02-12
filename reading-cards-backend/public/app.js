// ========= 前端应用逻辑 =========

const API_BASE = "/api/cards";
const TOPICS_API = "/api/topics";
const DOCUMENTS_API = "/api/documents";

// DOM 元素
const cardsContainer = document.getElementById("cardsContainer");
const topicFilter = document.getElementById("topicFilter");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const refreshBtn = document.getElementById("refreshBtn");
const cardStats = document.getElementById("cardStats");
const selectedCount = document.getElementById("selectedCount");
const cardCount = document.getElementById("cardCount");
const docTopicInput = document.getElementById("docTopicInput");
const generateFromSelectedBtn = document.getElementById("generateFromSelectedBtn");

// DOM 元素 - 文档视图
const cardsView = document.getElementById("cardsView");
const documentsView = document.getElementById("documentsView");
const viewTabs = document.querySelectorAll(".view-tab");
const docTopicFilter = document.getElementById("docTopicFilter");
const refreshDocsBtn = document.getElementById("refreshDocsBtn");
const documentsList = document.getElementById("documentsList");
const documentDetail = document.getElementById("documentDetail");

// ========= 状态管理 =========

// 存储当前卡片列表，用于事件处理
let currentCards = [];
let isSearchMode = false; // 标记当前是否为搜索模式

// 存储选中的卡片 ID（使用 Set 避免重复）
let selectedCardIds = new Set();

// 视图状态
let currentView = "cards"; // "cards" | "documents"
let currentDocId = null; // 当前选中的文档 ID
let allDocuments = []; // 文档列表缓存

// 文档视图状态（新增）
let docViewState = {
  currentTopic: null,
  documents: [],
  currentDoc: null,
  cardsForTopic: [],
  dirty: false
};

// ========= 工具函数 =========

/**
 * HTML 转义，防止 XSS
 */
function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Topic 颜色哈希 - 将 Topic 文本映射到 1-6 的颜色类
 */
function getTopicColorClass(topicTitle) {
  if (!topicTitle) return "topic-color-1";
  let hash = 0;
  for (let i = 0; i < topicTitle.length; i++) {
    const char = topicTitle.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  const colorIndex = (Math.abs(hash) % 6) + 1;
  return `topic-color-${colorIndex}`;
}

/**
 * HTML 属性转义，防止引号打断属性
 */
function escapeHtmlAttr(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * 格式化时间
 */
function formatTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/**
 * 截断文本
 */
function truncateText(text, maxLength = 200) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

/**
 * 更新选中卡片统计
 */
function updateSelectedCount() {
  const count = selectedCardIds.size;
  selectedCount.textContent = count > 0 ? `已选中 ${count} 张卡片` : "暂未选择卡片";
}

// ========= 数据获取 =========

/**
 * 从服务器获取 Topic 列表
 */
async function loadTopics() {
  try {
    const resp = await fetch(TOPICS_API);
    const data = await resp.json();

    if (!data.ok) {
      console.error("获取 Topic 列表失败：", data.error);
      return [];
    }

    return data.topics || [];
  } catch (error) {
    console.error("获取 Topic 列表失败：", error);
    return [];
  }
}

/**
 * 更新 Topic 下拉框（统一数据源，包含卡片和文档的 topics）
 */
async function updateTopicFilter() {
  // 获取卡片 topics
  const cardTopics = await loadTopics();

  // 获取文档 topics（合并到同一个集合）
  const allTopics = new Set(cardTopics);

  // 如果文档列表已加载，也包含文档的 topics
  if (allDocuments && allDocuments.length > 0) {
    allDocuments.forEach(doc => {
      if (doc.topic_title && doc.topic_title.trim()) {
        allTopics.add(doc.topic_title.trim());
      }
    });
  }

  // 转换为排序数组
  const topics = Array.from(allTopics).sort();

  // 保存当前选中的值
  const currentValue = topicFilter.value;

  // 填充下拉框
  topicFilter.innerHTML = '<option value="">全部 Topic</option>' +
    topics.map(t => `<option value="${escapeHtmlAttr(t)}">${escapeHtml(t)}</option>`).join("");

  // 恢复选中值
  if (currentValue) {
    topicFilter.value = currentValue;
  }
}

/**
 * 从服务器获取卡片列表
 */
async function fetchCards() {
  try {
    const params = new URLSearchParams();

    // 使用 topic_title 过滤
    if (topicFilter.value) {
      params.append("topic_title", topicFilter.value);
    }

    const url = `${API_BASE}?${params.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.error || "获取卡片失败");
    }

    return data.cards || [];
  } catch (error) {
    console.error("获取卡片失败：", error);
    showError("获取卡片失败：" + error.message);
    return [];
  }
}

/**
 * 语义搜索卡片
 */
async function searchCards(query) {
  try {
    if (!query || !query.trim()) {
      return await fetchCards(); // 如果搜索为空，返回普通列表
    }

    const response = await fetch(`${API_BASE}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query: query.trim(),
        topic_title: topicFilter.value || undefined
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.error || "搜索失败");
    }

    return data.cards || [];
  } catch (error) {
    console.error("搜索卡片失败：", error);
    showError("搜索失败：" + error.message);
    return [];
  }
}

// ========= 渲染 =========

/**
 * 渲染卡片列表
 */
const sourceFilter = document.getElementById("sourceFilter");
const importanceFilter = document.getElementById("importanceFilter");

// ... (existing code)

// 加载时获取 Sources
document.addEventListener("DOMContentLoaded", () => {
  loadTopics();
  loadSourcesForFilter(); // NEW
  refreshCards();
  // ...
});

// Listener updates
if (sourceFilter) {
  sourceFilter.addEventListener("change", () => updateFilteredView());
}
if (importanceFilter) {
  importanceFilter.addEventListener("change", () => updateFilteredView());
}

/**
 * 加载 Source 列表用于筛选
 */
async function loadSourcesForFilter() {
  try {
    const res = await fetch("/api/sources");
    const data = await res.json();
    const sources = data.sources || [];

    // Sort by name
    sources.sort((a, b) => a.name.localeCompare(b.name));

    sourceFilter.innerHTML = '<option value="">全部信息源</option>' +
      sources.map(s => `<option value="${s.source_id}">${escapeHtml(s.name)}</option>`).join("");

  } catch (e) {
    console.error("Failed to load sources for filter", e);
  }
}

/**
 * 应用前端筛选并渲染
 */
function updateFilteredView() {
  if (!currentCards) return;

  let filtered = [...currentCards];
  const sourceId = sourceFilter.value;
  const importance = importanceFilter.value;

  // 1. Source Filter
  if (sourceId) {
    filtered = filtered.filter(c => c.source_id === sourceId);
  }

  // 2. Importance Filter
  if (importance) {
    const imp = parseInt(importance);
    filtered = filtered.filter(c => c.source?.importance_level === imp);
  }

  // 3. Render
  renderCardsInternal(filtered);
}

/**
 * 实际渲染 DOM 的函数 (原 renderCards 改名)
 */
async function renderCardsInternal(cards) {
  // 更新统计信息
  const topicText = topicFilter.value ? `Topic: "${topicFilter.value}"` : "全部 Topic";
  const searchText = isSearchMode ? `（语义搜索模式）` : "";
  const filterText = (sourceFilter.value || importanceFilter.value) ? ` [已筛选]` : "";

  cardCount.textContent = `共 ${cards.length} 张卡片（${topicText}${searchText}${filterText}）`;

  updateSelectedCount();

  if (cards.length === 0) {
    cardsContainer.innerHTML = '<div class="empty-state">暂无卡片</div>';
    await updateDocTopicDisplay();
    return;
  }

  cardsContainer.innerHTML = cards.map(card => renderCard(card)).join("");
  await updateDocTopicDisplay();
}

/**
 * 原始 renderCards 保持签名兼容，但改为只是更新 currentCards 并调用 filtering
 */
async function renderCards(cards) {
  currentCards = cards; // 仅更新数据源
  updateFilteredView(); // 触发筛选和渲染
}


/**
 * 渲染单个卡片（新版 UI）
 */
function renderCard(card) {
  // 1. 信息源徽章
  let sourceBadgeHtml = '';
  if (card.source) {
    // 已匹配信息源：显示完整徽章
    const importanceDot = getImportanceDot(card.source.importance_level);
    const regionIcon = card.source.region === 'domestic' ? '🇨🇳' : '🌍';
    sourceBadgeHtml = `
      <div class="card-source-badge">
        <span class="source-importance-dot">${importanceDot}</span>
        <span class="source-name">${escapeHtml(card.source.name)}</span>
        <span class="source-category-tag">${escapeHtml(card.source.category)}</span>
        <span class="source-region-icon">${regionIcon}</span>
      </div>
    `;
  } else {
    // 未匹配信息源：兜底显示
    // 优先使用 source_name，如果没有则尝试从 URL 提取域名，最后才显示“未分类”
    let fallbackName = "未分类信息源";
    if (card.source_name) {
      fallbackName = card.source_name;
    } else if (card.source_url) {
      try {
        fallbackName = new URL(card.source_url).hostname.replace('www.', '');
      } catch (e) {
        // ignore invalid url
      }
    }

    sourceBadgeHtml = `
      <div class="card-source-badge unmatched">
        <span class="source-importance-dot">⚪</span>
        <span class="source-name">${escapeHtml(fallbackName)}</span>
      </div>
    `;
  }

  // 2. 文章标题
  const titleHtml = card.title
    ? `<h3 class="card-title">${escapeHtml(card.title)}</h3>`
    : '';

  // 3. 摘要
  const summary = card.summary || "";

  // 4. 批注
  const note = card.note || "";
  const noteHtml = note
    ? `<div class="card-note"><span class="card-note-label">批注</span>${escapeHtml(note)}</div>`
    : '';

  // 5. Topic 标签
  const topicColorClass = getTopicColorClass(card.topic_title);
  const topicTag = card.topic_title
    ? `<span class="topic-tag ${topicColorClass}">${escapeHtml(card.topic_title)}</span>`
    : "";

  // 6. 要点列表
  const keyPointsHtml = card.key_points && Array.isArray(card.key_points) && card.key_points.length > 0
    ? `<ul class="card-key-points">${card.key_points.map(kp => `<li>${escapeHtml(String(kp))}</li>`).join("")}</ul>`
    : "";

  // 7. 来源链接
  const sourceUrlHtml = card.source_url
    ? `<div class="card-source-url"><a href="${escapeHtml(card.source_url)}" target="_blank">${escapeHtml(truncateText(card.source_url, 60))}</a></div>`
    : '';

  // 8. 原始片段
  const rawSnippet = card.raw_snippet || "";

  // 9. 图片
  const imageHtml = card.image_url
    ? `<div class="card-image-thumb"><img src="${escapeHtmlAttr(card.image_url)}" alt="卡片图片" /></div>`
    : "";

  // 10. 复选框
  const isChecked = selectedCardIds.has(card.id);
  const checkboxHtml = `<input type="checkbox" class="card-checkbox" data-id="${escapeHtmlAttr(card.id)}" ${isChecked ? 'checked' : ''}>`;

  // 11. Data 属性
  const editTopicBtnDataAttrs = `data-id="${escapeHtmlAttr(card.id)}" data-topic-title="${escapeHtmlAttr(card.topic_title || "")}"`;
  const editNoteBtnDataAttrs = `data-id="${escapeHtmlAttr(card.id)}" data-note="${escapeHtmlAttr(card.note || "")}"`;

  return `
    <article class="card" data-id="${escapeHtmlAttr(card.id)}">
      <div class="card-header">
        <div class="card-meta">
          ${checkboxHtml}
          ${sourceBadgeHtml}
        </div>
        <div class="card-actions">
          ${topicTag}
          <span class="time-tag">${formatTime(card.created_at)}</span>
        </div>
      </div>
      ${titleHtml}
      <div class="card-content">
        <div class="card-summary">${escapeHtml(summary)}</div>
        ${keyPointsHtml}
        ${sourceUrlHtml}
        ${imageHtml}
        <details class="card-snippet-details">
          <summary>显示原文</summary>
          <div class="card-snippet">${escapeHtml(rawSnippet)}</div>
        </details>
        ${noteHtml}
      </div>
      <div class="card-footer">
        <button class="btn-small edit-topic-btn" ${editTopicBtnDataAttrs}>编辑 Topic</button>
        <button class="btn-small edit-note-btn" ${editNoteBtnDataAttrs}>编辑批注</button>
        <button class="card-delete-btn" data-id="${escapeHtmlAttr(card.id)}">删除</button>
      </div>
    </article>
  `;
}

/**
 * 获取重要度指示灯
 */
function getImportanceDot(level) {
  switch (level) {
    case 1: return '🔴';
    case 2: return '🟠';
    case 3: return '⚪';
    default: return '⚪';
  }
}

/**
 * 显示错误信息
 */
function showError(message) {
  const errorDiv = document.createElement("div");
  errorDiv.className = "error";
  errorDiv.textContent = message;
  cardsContainer.insertBefore(errorDiv, cardsContainer.firstChild);

  // 3秒后自动移除
  setTimeout(() => {
    errorDiv.remove();
  }, 3000);
}

// ========= 事件处理 =========

/**
 * 处理卡片复选框变化
 */
async function handleCardCheckboxChange(cardId, isChecked) {
  if (isChecked) {
    selectedCardIds.add(cardId);
  } else {
    selectedCardIds.delete(cardId);
  }
  updateSelectedCount();
  // 勾选变化后，重新生成文档主题（如果未选择 Topic）
  await updateDocTopicDisplay();
}

/**
 * 编辑卡片批注
 */
async function handleEditCardNote(btn) {
  const cardId = btn.dataset.id;
  if (!cardId) {
    console.error("编辑批注按钮缺少 data-id 属性");
    return;
  }

  const currentNote = btn.dataset.note || "";
  const newNote = prompt("编辑这张卡片的批注：", currentNote);
  if (newNote === null) {
    // 用户取消
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/${cardId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ note: newNote })
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || `更新失败：${response.status}`);
    }

    // 更新成功后刷新列表（保持当前筛选）
    await refreshCards();
  } catch (error) {
    console.error("更新卡片批注失败：", error);
    alert("更新批注失败：" + error.message);
  }
}

/**
 * 编辑卡片 Topic
 */
async function handleEditCardTopic(btn) {
  const cardId = btn.dataset.id;
  if (!cardId) {
    console.error("编辑按钮缺少 data-id 属性");
    return;
  }

  const currentTopicTitle = btn.dataset.topicTitle || "";

  // 获取所有 Topic 列表
  const topics = await loadTopics();

  // 创建选择对话框：下拉框 + 输入框
  let topicInput = document.createElement("div");
  topicInput.innerHTML = `
    <label style="display: block; margin-bottom: 8px;">选择或输入 Topic：</label>
    <select id="topicSelect" style="width: 100%; margin-bottom: 8px; padding: 8px;">
      <option value="">（新建 Topic）</option>
      ${topics.map(t => `<option value="${escapeHtmlAttr(t)}" ${t === currentTopicTitle ? 'selected' : ''}>${escapeHtml(t)}</option>`).join("")}
    </select>
    <input type="text" id="topicTextInput" placeholder="输入新 Topic 名称" style="width: 100%; padding: 8px;" value="${escapeHtmlAttr(currentTopicTitle)}">
  `;

  // 使用自定义对话框
  const dialog = document.createElement("div");
  dialog.className = "topic-edit-dialog";
  dialog.innerHTML = `
    <div class="dialog-content">
      <h3>编辑卡片 Topic</h3>
      ${topicInput.innerHTML}
      <div style="margin-top: 16px; display: flex; gap: 8px; justify-content: flex-end;">
        <button id="cancelTopicBtn" class="btn-small">取消</button>
        <button id="saveTopicBtn" class="btn-small primary">保存</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  const topicSelect = dialog.querySelector("#topicSelect");
  const topicTextInput = dialog.querySelector("#topicTextInput");
  const saveBtn = dialog.querySelector("#saveTopicBtn");
  const cancelBtn = dialog.querySelector("#cancelTopicBtn");

  // 下拉框变化时更新输入框
  topicSelect.addEventListener("change", () => {
    if (topicSelect.value) {
      topicTextInput.value = topicSelect.value;
    }
  });

  // 保存
  const saveHandler = async () => {
    const newTopicTitle = topicTextInput.value.trim() || null;

    try {
      const response = await fetch(`${API_BASE}/${cardId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          topic_title: newTopicTitle
        })
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || `更新失败：${response.status}`);
      }

      // 更新成功后重新加载 Topic 列表和卡片列表
      // 更新两个 topic 筛选器（确保同步）
      await updateTopicFilter();
      await updateDocTopicFilter();
      await refreshCards();

      // 如果当前在文档视图，也需要刷新文档列表和当前文档详情
      if (currentView === "documents") {
        await refreshDocuments();
        // 如果当前正在查看某个文档，重新加载文档详情以确保topic_title同步
        if (docViewState.currentDoc && docViewState.currentDoc.doc_id) {
          await loadDocumentDetail(docViewState.currentDoc.doc_id);
        }
      }

      document.body.removeChild(dialog);
    } catch (error) {
      console.error("更新卡片 Topic 失败：", error);
      alert("更新失败：" + error.message);
    }
  };

  // 取消
  const cancelHandler = () => {
    document.body.removeChild(dialog);
  };

  saveBtn.addEventListener("click", saveHandler);
  cancelBtn.addEventListener("click", cancelHandler);

  // 回车保存
  topicTextInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      saveHandler();
    }
  });
}

/**
 * 删除卡片
 */
async function handleDeleteCard(cardId) {
  if (!cardId) return;

  if (!confirm("确定删除这张卡片吗？")) return;

  try {
    const resp = await fetch(`${API_BASE}/${cardId}`, { method: "DELETE" });
    const data = await resp.json();

    if (!data.ok) {
      alert("删除失败：" + (data.error || "未知错误"));
      return;
    }

    // 从选中列表中移除
    selectedCardIds.delete(cardId);
    updateSelectedCount();

    // 刷新列表和 Topic 列表
    await updateTopicFilter();
    await refreshCards();
  } catch (error) {
    console.error("删除卡片失败：", error);
    alert("删除失败：" + error.message);
  }
}

/**
 * 处理语义搜索
 */
async function handleSearch() {
  const query = searchInput.value.trim();
  if (!query) {
    // 如果搜索框为空，恢复普通列表
    isSearchMode = false;
    await refreshCards();
    return;
  }

  isSearchMode = true;
  cardsContainer.innerHTML = '<div class="loading">搜索中...</div>';
  const cards = await searchCards(query);
  await renderCards(cards);
}

/**
 * 刷新卡片列表
 */
async function refreshCards() {
  isSearchMode = false;
  searchInput.value = ""; // 清空搜索框
  cardsContainer.innerHTML = '<div class="loading">加载中...</div>';
  const cards = await fetchCards();
  await renderCards(cards);
}

// ========= 文档视图相关函数 =========

/**
 * 切换视图
 */
function switchView(view) {
  currentView = view;

  // 更新 Tab 状态
  viewTabs.forEach(tab => {
    if (tab.dataset.view === view) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }
  });

  // 显示/隐藏视图
  if (view === "cards") {
    cardsView.style.display = "block";
    documentsView.style.display = "none";
    // 同步文档视图的筛选器值到卡片视图
    if (docTopicFilter && topicFilter && docTopicFilter.value) {
      topicFilter.value = docTopicFilter.value;
    }
    // 更新卡片视图的筛选器选项（确保包含所有 topics）
    updateTopicFilter();
  } else {
    cardsView.style.display = "none";
    documentsView.style.display = "block";
    // 同步卡片视图的筛选器值到文档视图
    if (topicFilter && docTopicFilter && topicFilter.value) {
      docTopicFilter.value = topicFilter.value;
    }
    // 更新文档视图的筛选器选项（确保包含所有 topics）
    updateDocTopicFilter();
    // 懒加载：首次切换到文档视图时加载数据
    if (allDocuments.length === 0) {
      loadDocumentsView();
    }
  }
}

/**
 * 切换到文档视图并加载指定文档（全局函数，供生成结果中的按钮调用）
 */
window.switchToDocumentView = async function (docId) {
  switchView("documents");
  // 等待文档列表加载完成
  if (allDocuments.length === 0) {
    await loadDocumentsView();
  }
  // 加载指定文档详情
  if (docId) {
    await loadDocumentDetail(docId);
  }
};

/**
 * 加载文档视图数据
 */
async function loadDocumentsView() {
  // 先加载文档列表（这会更新 allDocuments 缓存）
  await refreshDocuments();
  // 然后基于缓存的文档列表更新 Topic 下拉框
  await updateDocTopicFilter(true);
}

/**
 * 更新文档视图的 Topic 下拉框（统一数据源，包含卡片和文档的 topics）
 */
async function updateDocTopicFilter(useCachedDocs = false) {
  // 获取卡片 topics
  const cardTopics = await loadTopics();

  // 合并文档 topics
  const allTopics = new Set(cardTopics);

  let allDocs;
  if (useCachedDocs && allDocuments.length > 0) {
    allDocs = allDocuments;
  } else {
    // 获取所有文档以提取 topics（不应用 topic 过滤）
    allDocs = await fetchDocuments();
  }

  // 从文档中提取唯一的 topic_title
  allDocs.forEach(doc => {
    if (doc.topic_title && doc.topic_title.trim()) {
      allTopics.add(doc.topic_title.trim());
    }
  });

  // 转换为排序数组
  const topics = Array.from(allTopics).sort();

  const currentValue = docTopicFilter.value;

  docTopicFilter.innerHTML = '<option value="">全部 Topic</option>' +
    topics.map(t => `<option value="${escapeHtmlAttr(t)}">${escapeHtml(t)}</option>`).join("");

  if (currentValue) {
    docTopicFilter.value = currentValue;
  }
}

/**
 * 从服务器获取文档列表
 */
async function fetchDocuments(topicTitle) {
  try {
    const params = new URLSearchParams();
    if (topicTitle) {
      params.append("topic_title", topicTitle);
    }

    const url = `${DOCUMENTS_API}?${params.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.error || "获取文档列表失败");
    }

    return data.documents || [];
  } catch (error) {
    console.error("获取文档列表失败：", error);
    showDocumentsError("获取文档列表失败：" + error.message);
    return [];
  }
}

/**
 * 渲染文档列表
 */
function renderDocumentsList(documents) {
  allDocuments = documents;

  if (documents.length === 0) {
    documentsList.innerHTML = '<div class="empty-state">暂无文档</div>';
    return;
  }

  documentsList.innerHTML = documents.map(doc => renderDocumentItem(doc)).join("");
}

/**
 * 渲染单个文档列表项
 */
function renderDocumentItem(doc) {
  const docIdShort = doc.doc_id.substring(0, 8) + "...";
  const createdDate = new Date(doc.created_at).toLocaleDateString("zh-CN");
  const updatedDate = new Date(doc.updated_at).toLocaleDateString("zh-CN");
  const isSelected = currentDocId === doc.doc_id ? "selected" : "";

  const activeClass = currentDocId === doc.doc_id ? "active" : "";
  return `
    <div class="doc-list-item ${activeClass}" data-doc-id="${escapeHtmlAttr(doc.doc_id)}">
      <div class="document-item-title">${escapeHtml(doc.topic_title)}</div>
      <div class="document-item-meta">
        <span class="document-item-id">ID: ${escapeHtml(docIdShort)}</span>
        <span class="document-item-date">更新: ${escapeHtml(updatedDate)}</span>
      </div>
      <div class="document-item-stats">
        <span>问题: ${doc.doc_questions.length}</span>
        <span>假设: ${doc.doc_hypotheses.length}</span>
        <span>单元: ${doc.story_units.length}</span>
      </div>
    </div>
  `;
}

/**
 * 刷新文档列表
 */
async function refreshDocuments() {
  documentsList.innerHTML = '<div class="loading">加载中...</div>';
  const topicTitle = docTopicFilter.value || undefined;
  const documents = await fetchDocuments(topicTitle);
  renderDocumentsList(documents);

  // 注意：不在这里更新 topic filter，避免循环调用
  // topic filter 会在需要时单独更新（如切换视图时）
}

/**
 * 显示文档列表错误
 */
function showDocumentsError(message) {
  const errorDiv = document.createElement("div");
  errorDiv.className = "error";
  errorDiv.textContent = message;
  documentsList.insertBefore(errorDiv, documentsList.firstChild);

  setTimeout(() => {
    errorDiv.remove();
  }, 3000);
}

/**
 * 从服务器获取文档详情
 */
async function fetchDocumentDetail(docId) {
  try {
    const response = await fetch(`${DOCUMENTS_API}/${docId}`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.error || "获取文档详情失败");
    }

    return data.document;
  } catch (error) {
    console.error("获取文档详情失败：", error);
    alert("获取文档详情失败：" + error.message);
    return null;
  }
}


// ========= 事件处理（事件委托） =========

// 在容器上使用事件委托，处理所有卡片按钮点击
cardsContainer.addEventListener("click", async (e) => {
  // 处理复选框
  if (e.target.classList.contains("card-checkbox")) {
    const cardId = e.target.dataset.id;
    const isChecked = e.target.checked;
    await handleCardCheckboxChange(cardId, isChecked);
    return;
  }

  // 处理编辑 Topic 按钮
  if (e.target.classList.contains("edit-topic-btn")) {
    await handleEditCardTopic(e.target);
    return;
  }

  // 处理编辑批注按钮
  if (e.target.classList.contains("edit-note-btn")) {
    await handleEditCardNote(e.target);
    return;
  }

  // 处理删除按钮
  if (e.target.classList.contains("card-delete-btn")) {
    const cardId = e.target.dataset.id;
    if (cardId) {
      await handleDeleteCard(cardId);
    }
    return;
  }
});

// ========= 初始化 =========

// 绑定事件
refreshBtn.addEventListener("click", refreshCards);
topicFilter.addEventListener("change", async () => {
  isSearchMode = false;
  searchInput.value = "";

  // 同步文档视图的筛选器值
  if (docTopicFilter && topicFilter.value) {
    docTopicFilter.value = topicFilter.value;
  } else if (docTopicFilter && !topicFilter.value) {
    docTopicFilter.value = "";
  }

  await refreshCards();
});
searchBtn.addEventListener("click", handleSearch);
searchInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    handleSearch();
  }
});
generateFromSelectedBtn.addEventListener("click", handleGenerateFromSelected);

// ========= 添加卡片功能 =========
let cardImageData = null; // 存储粘贴的图片数据

/**
 * 初始化添加卡片区域
 */
async function initAddCardSection() {
  const topicSelect = document.getElementById("cardTopicSelect");
  const snippetInput = document.getElementById("cardSnippetInput");

  if (!topicSelect || !snippetInput) return;

  // 监听粘贴事件（支持图片）
  snippetInput.addEventListener("paste", handleCardPaste);

  // 填充 Topic 选项
  const topics = await loadTopics();
  topicSelect.innerHTML = '<option value="">选择 Topic...</option>' +
    topics.map(t => `<option value="${escapeHtmlAttr(t)}">${escapeHtml(t)}</option>`).join("");

  // 如果当前有筛选的 topic，默认选中
  if (topicFilter && topicFilter.value) {
    topicSelect.value = topicFilter.value;
  }

  // 初始化文件上传功能
  initFileUpload();
}

/**
 * 初始化文件上传功能
 */
function initFileUpload() {
  const fileInput = document.getElementById("documentFileInput");
  const selectFileBtn = document.getElementById("selectFileBtn");
  const removeFileBtn = document.getElementById("removeFileBtn");
  const selectedFileName = document.getElementById("selectedFileName");
  const generateFromFileBtn = document.getElementById("generateFromFileBtn");

  if (!fileInput || !selectFileBtn) {
    console.log("文件上传元素未找到，跳过初始化");
    return;
  }

  // 显示"从文件生成卡片"按钮
  if (generateFromFileBtn) {
    generateFromFileBtn.style.display = "block";
  }

  // 点击选择文件按钮
  selectFileBtn.addEventListener("click", () => {
    fileInput.click();
  });

  // 文件选择变化
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      selectedFileName.textContent = file.name;
      if (removeFileBtn) {
        removeFileBtn.style.display = "inline-block";
      }
      selectFileBtn.textContent = "重新选择";
    }
  });

  // 移除文件
  if (removeFileBtn) {
    removeFileBtn.addEventListener("click", () => {
      fileInput.value = "";
      selectedFileName.textContent = "";
      removeFileBtn.style.display = "none";
      selectFileBtn.textContent = "选择文件";
    });
  }

  // 从文件生成卡片按钮
  if (generateFromFileBtn) {
    generateFromFileBtn.addEventListener("click", handleGenerateFromFile);
  }

  console.log("✅ 文件上传功能初始化完成");
}

/**
 * 处理从文件生成卡片
 */
async function handleGenerateFromFile() {
  const fileInput = document.getElementById("documentFileInput");
  const generateFromFileBtn = document.getElementById("generateFromFileBtn");
  const sourceNameInput = document.getElementById("cardSourceName");
  const sourceUrlInput = document.getElementById("cardSourceUrl");
  const topicSelect = document.getElementById("cardTopicSelect");

  if (!fileInput || !fileInput.files || !fileInput.files[0]) {
    alert("请先选择文件");
    return;
  }

  const file = fileInput.files[0];
  const sourceName = sourceNameInput ? sourceNameInput.value.trim() || file.name : file.name;
  const sourceUrl = sourceUrlInput ? sourceUrlInput.value.trim() || null : null;
  const topicTitle = topicSelect ? topicSelect.value || null : null;

  // 禁用按钮，显示加载状态
  generateFromFileBtn.disabled = true;
  generateFromFileBtn.textContent = "正在上传文件...";

  try {
    // 第一步：上传文件到 OpenAI
    console.log("=== 开始上传文件 ===");
    console.log("文件名:", file.name);
    console.log("文件大小:", file.size, "bytes");

    const formData = new FormData();
    formData.append("file", file);

    const uploadResponse = await fetch(`${API_BASE}/upload-file`, {
      method: "POST",
      body: formData
    });

    const contentType = uploadResponse.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await uploadResponse.text();
      throw new Error(`服务器返回了非 JSON 响应: ${text.substring(0, 200)}`);
    }

    const uploadData = await uploadResponse.json();

    if (!uploadResponse.ok || !uploadData.ok) {
      throw new Error(uploadData.error || uploadData.message || uploadData.detail || "文件上传失败");
    }

    const fileId = uploadData.file_id;
    console.log("✅ 文件上传成功，file_id:", fileId);

    // 第二步：生成卡片
    generateFromFileBtn.textContent = "正在生成卡片（可能需要1-2分钟）...";
    console.log("=== 开始生成卡片 ===");

    const generateResponse = await fetch(`${API_BASE}/generate-from-document`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_id: fileId,
        source_name: sourceName,
        source_url: sourceUrl,
        topic_title: topicTitle
      })
    });

    const generateContentType = generateResponse.headers.get("content-type");
    if (!generateContentType || !generateContentType.includes("application/json")) {
      const text = await generateResponse.text();
      throw new Error(`服务器返回了非 JSON 响应: ${text.substring(0, 200)}`);
    }

    const generateData = await generateResponse.json();

    if (!generateResponse.ok || !generateData.ok) {
      throw new Error(generateData.error || generateData.message || generateData.detail || "生成卡片失败");
    }

    const count = generateData.count || generateData.cards?.length || 0;
    console.log(`✅ 成功生成 ${count} 张卡片`);

    // 重置表单
    fileInput.value = "";
    document.getElementById("selectedFileName").textContent = "";
    document.getElementById("removeFileBtn").style.display = "none";
    document.getElementById("selectFileBtn").textContent = "选择文件";
    if (sourceNameInput) sourceNameInput.value = "";
    if (sourceUrlInput) sourceUrlInput.value = "";

    alert(`成功生成 ${count} 张卡片！`);

    // 刷新卡片列表
    await updateTopicFilter();
    await updateDocTopicFilter();
    await refreshCards();

    if (topicTitle && topicFilter) {
      topicFilter.value = topicTitle;
      await refreshCards();
    }
  } catch (error) {
    console.error("❌ 从文件生成卡片失败：", error);
    alert("从文件生成卡片失败：" + error.message);
  } finally {
    generateFromFileBtn.disabled = false;
    generateFromFileBtn.textContent = "从文件生成卡片";
  }
}

/**
 * 处理粘贴事件（支持图片和文字）
 */
function handleCardPaste(e) {
  const clipboardData = e.clipboardData || window.clipboardData;
  const items = clipboardData.items;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // 如果是图片
    if (item.type.indexOf("image") !== -1) {
      e.preventDefault();
      const file = item.getAsFile();
      const reader = new FileReader();

      reader.onload = (event) => {
        cardImageData = event.target.result; // base64 数据
        const imagePreview = document.getElementById("cardImagePreview");
        const imagePreviewImg = document.getElementById("cardImagePreviewImg");

        imagePreviewImg.src = cardImageData;
        imagePreview.style.display = "block";

        // 如果文本框中没有内容，添加图片描述
        const snippetInput = document.getElementById("cardSnippetInput");
        if (!snippetInput.value.trim()) {
          snippetInput.value = "[图片内容]";
        }
      };

      reader.readAsDataURL(file);
      break;
    }
  }
}

/**
 * 处理添加卡片确认
 */
async function handleAddCard() {
  const snippetInput = document.getElementById("cardSnippetInput");
  const sourceNameInput = document.getElementById("cardSourceName");
  const sourceUrlInput = document.getElementById("cardSourceUrl");
  const topicSelect = document.getElementById("cardTopicSelect");
  const confirmBtn = document.getElementById("confirmAddCardBtn");

  const rawSnippet = snippetInput.value.trim();
  const sourceName = sourceNameInput.value.trim() || null;
  const sourceUrl = sourceUrlInput.value.trim() || null;
  const topicTitle = topicSelect.value || null;

  // 校验必填字段：必须有文本或图片
  if (!rawSnippet && !cardImageData) {
    alert("请输入原文内容或粘贴图片");
    return;
  }

  // 如果只是占位文本，清空 snippet
  const snippet = (rawSnippet === "[图片内容]") ? "" : rawSnippet;

  // 禁用按钮，显示加载状态
  confirmBtn.disabled = true;
  confirmBtn.textContent = "正在生成...";

  try {
    const response = await fetch(`${API_BASE}/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        snippet: snippet,                    // 纯文本，没有 base64
        imageData: cardImageData || null,    // 图片单独字段
        sourceName: sourceName,
        sourceUrl: sourceUrl,
        topic_title: topicTitle
      })
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "生成卡片失败");
    }

    // 成功：重置表单
    snippetInput.value = "";
    sourceNameInput.value = "";
    sourceUrlInput.value = "";
    cardImageData = null;
    document.getElementById("cardImagePreview").style.display = "none";

    alert("卡片生成成功！");

    // 刷新卡片列表和 Topic 筛选器
    await updateTopicFilter();
    await updateDocTopicFilter();
    await refreshCards();

    // 如果选择了 topic，自动筛选
    if (topicTitle && topicFilter) {
      topicFilter.value = topicTitle;
      await refreshCards();
    }
  } catch (error) {
    console.error("添加卡片失败：", error);
    alert("添加卡片失败：" + error.message);
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = "生成并添加卡片";
  }
}

// 绑定添加卡片相关事件
const confirmAddCardBtn = document.getElementById("confirmAddCardBtn");
const removeImageBtn = document.getElementById("removeImageBtn");

if (confirmAddCardBtn) {
  confirmAddCardBtn.addEventListener("click", handleAddCard);
}
if (removeImageBtn) {
  removeImageBtn.addEventListener("click", () => {
    cardImageData = null;
    document.getElementById("cardImagePreview").style.display = "none";
    const snippetInput = document.getElementById("cardSnippetInput");
    if (snippetInput.value === "[图片内容]") {
      snippetInput.value = "";
    }
  });
}

// 初始化
initAddCardSection();

// 监听 topicFilter 变化，同步更新添加卡片区域的 topic
if (topicFilter) {
  topicFilter.addEventListener("change", () => {
    const topicSelect = document.getElementById("cardTopicSelect");
    if (topicSelect && topicFilter.value) {
      topicSelect.value = topicFilter.value;
    }
  });
}

// 绑定事件 - 文档视图
viewTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    switchView(tab.dataset.view);
  });
});

docTopicFilter.addEventListener("change", async () => {
  // 同步卡片视图的筛选器值
  if (topicFilter && docTopicFilter.value) {
    topicFilter.value = docTopicFilter.value;
  } else if (topicFilter && !docTopicFilter.value) {
    topicFilter.value = "";
  }

  // 切换 topic filter 时刷新文档列表
  await refreshDocuments();
  // 保持当前选中的文档（如果还在列表中）
  if (currentDocId) {
    const stillExists = allDocuments.some(doc => doc.doc_id === currentDocId);
    if (!stillExists) {
      // 如果当前文档不在过滤后的列表中，清空详情
      currentDocId = null;
      docViewState.currentDoc = null;
      documentDetail.innerHTML = '<div class="empty-state">请从左侧选择一个文档查看详情</div>';
      disableDocButtons();
      clearDirty();
    }
  }
});

refreshDocsBtn.addEventListener("click", refreshDocuments);

// 文档列表点击事件（事件委托）
documentsList.addEventListener("click", (e) => {
  const item = e.target.closest(".doc-list-item");
  if (item) {
    const docId = item.dataset.docId;
    if (docId) {
      loadDocumentDetail(docId);
    }
  }
});

// ========= Document Canvas Functions (New 3-Column Layout) =========

/**
 * Load cards for the current topic (or all cards if no topic)
 * When a document is loaded, we load all cards from the selected Topic filter
 * or all cards if no filter is selected
 */
async function loadCardsForTopic(topicTitle) {
  try {
    const params = new URLSearchParams();

    // If topicTitle is provided and not empty, filter by it
    // Otherwise load all cards
    if (topicTitle && topicTitle.trim() !== "") {
      params.append("topic_title", topicTitle);
    }

    const response = await fetch(`${API_BASE}?${params.toString()}`);
    const data = await response.json();

    if (data.ok) {
      docViewState.cardsForTopic = data.cards || [];
      renderCardPool();
    } else {
      console.error("加载卡片失败：", data.error);
      docViewState.cardsForTopic = [];
      renderCardPool();
    }
  } catch (error) {
    console.error("加载卡片池失败：", error);
    docViewState.cardsForTopic = [];
    renderCardPool();
  }
}

/**
 * Handle card drag start
 */
function handleCardDragStart(e) {
  const cardId = e.target.dataset.cardId;
  e.dataTransfer.setData("cardId", cardId);
  e.dataTransfer.effectAllowed = "copy";
}

/**
 * Render editable document detail
 */
async function renderEditableDocumentDetail(doc) {
  if (!doc) {
    documentDetail.innerHTML = '<div class="empty-state">请从左侧选择一个文档查看详情</div>';
    disableDocButtons();
    return;
  }

  docViewState.currentDoc = doc;
  docViewState.currentTopic = doc.topic_title;

  // Enable buttons
  enableDocButtons();

  // Render editable document - 添加编号到问题和假设
  const questionsText = doc.doc_questions.map((q, i) => `${i + 1}. ${q.text}`).join("\n");
  const hypothesesText = doc.doc_hypotheses.map((h, i) => `${i + 1}. ${h.text}`).join("\n");

  documentDetail.innerHTML = `
    <div class="doc-section-block">
      <h4>文档主题 (TOPIC)</h4>
      <input type="text" id="docTitleDisplay" class="doc-title-input" value="${escapeHtmlAttr(doc.topic_title)}" readonly>
    </div>
    
    <div class="doc-section-block">
      <h4>文档问题 (QUESTIONS)</h4>
      <textarea id="docQuestionsContainer" class="doc-textarea" placeholder="输入问题，每行一个（如：1. 问题内容）">${escapeHtml(questionsText)}</textarea>
    </div>
    
    <div class="doc-section-block">
      <div class="hypo-section-header">
        <h4 class="hypo-section-title">文档假设 (HYPOTHESES)</h4>
        <button id="btn-eval-hypotheses" class="btn-small primary" id="validateHypothesesBtn">验证假设</button>
      </div>
      <div id="hypothesesListContainer"></div>
      <textarea id="docHypothesesContainer" class="doc-textarea" placeholder="输入假设，每行一个（如：1. 假设内容）">${escapeHtml(hypothesesText)}</textarea>
      <div class="hypo-eval-status-row">
        <span id="hypo-eval-status" class="hypo-eval-status"></span>
      </div>
      <div id="hypo-eval-panel"></div>
    </div>
    
    <div class="doc-section-block ai-refine-section">
      <button id="aiRefineQHBtn" class="btn-secondary ai-refine-btn">🤖 AI 优化问题 & 假设</button>
    </div>
    
    <div class="doc-section-block">
      <h4>故事单元 (STORY UNITS)</h4>
      <div id="docStoryUnitsContainer"></div>
      <div class="add-unit-container">
        <button id="addUnitBtn" class="btn-small primary">+ 新增故事单元</button>
      </div>
    </div>
  `;

  // Render story units (initial render without cards, will re-render after cards load)
  renderStoryUnits(doc.story_units);

  // Add change listeners
  document.getElementById("docQuestionsContainer").addEventListener("input", markDirty);
  const hypothesesTextarea = document.getElementById("docHypothesesContainer");
  hypothesesTextarea.addEventListener("input", () => {
    markDirty();
    // 当假设文本变化时，更新 doc_hypotheses 并重新渲染列表
    updateHypothesesFromTextarea();
  });
  document.getElementById("addUnitBtn").addEventListener("click", handleAddUnit);

  // Hypothesis 验证台
  renderHypothesesList();
  document.getElementById("btn-eval-hypotheses")?.addEventListener("click", handleEvaluateHypothesesClick);

  // Add unified AI Q/H button listener
  document.getElementById("aiRefineQHBtn").addEventListener("click", handleAIRefineQH);

  // Load cards for this topic (load ALL cards, not filtered by topic_title)
  // Then re-render story units with correct card summaries
  await loadCardsForTopic("");  // Empty string = load all cards
  renderStoryUnits(doc.story_units);  // Re-render with card info now available
}

/**
 * Render story units with drag-and-drop and editable fields
 */
function renderStoryUnits(units) {
  const container = document.getElementById("docStoryUnitsContainer");
  if (!container) return;

  if (!units || units.length === 0) {
    container.innerHTML = '<div class="empty-state">暂无故事单元，点击下方按钮新增</div>';
    return;
  }

  container.innerHTML = units.map((unit, index) => {
    const cardIds = unit.card_ids || [];
    const cardsHtml = cardIds.length > 0
      ? cardIds.map(cardId => {
        const card = docViewState.cardsForTopic.find(c => c.id === cardId);
        const summary = card ? (card.summary || card.raw_snippet || cardId) : cardId;
        return `
            <div class="unit-card" draggable="true" data-card-id="${escapeHtmlAttr(cardId)}">
              <span>${escapeHtml(truncateText(summary, 50))}</span>
              <span class="unit-card-remove" data-unit-index="${index}" data-card-id="${escapeHtmlAttr(cardId)}">×</span>
            </div>
          `;
      }).join("")
      : '<div class="empty-hint" style="color: #aaa; font-size: 12px; text-align: center; padding: 10px;">拖拽卡片到此处</div>';

    return `
      <div class="story-unit" data-unit-id="${escapeHtmlAttr(unit.unit_id)}" data-unit-index="${index}" draggable="true">
        <div class="story-unit-header">
          <span class="unit-drag-handle" title="拖拽排序">⋮⋮</span>
          <input type="text" class="unit-title-input" data-index="${index}" value="${escapeHtmlAttr(unit.title || `单元 ${index + 1}`)}" placeholder="小节标题">
          <div class="unit-controls">
            <button class="ai-suggest-btn ai-refine-unit" data-unit-id="${escapeHtmlAttr(unit.unit_id)}" data-index="${index}" title="AI 改写此小节">✨</button>
            <button class="unit-btn delete" data-index="${index}" title="删除小节">×</button>
          </div>
        </div>
        <textarea class="unit-content-textarea" data-index="${index}" placeholder="输入核心论点/描述...">${escapeHtml(unit.core_point || "")}</textarea>
        <div class="unit-ai-notes" id="unitNotes_${escapeHtmlAttr(unit.unit_id)}" style="display: none;"></div>
        <div style="font-size: 11px; color: #888; margin-bottom: 4px;">${cardIds.length} 张卡片</div>
        <div class="unit-card-list" data-unit-index="${index}">
          ${cardsHtml}
        </div>
      </div>
    `;
  }).join("");

  // Add drop event listeners for cards
  container.querySelectorAll(".story-unit").forEach(unit => {
    unit.addEventListener("dragover", handleUnitDragOver);
    unit.addEventListener("drop", handleUnitDrop);
    unit.addEventListener("dragleave", handleUnitDragLeave);
  });

  // Add remove card listeners
  container.querySelectorAll(".unit-card-remove").forEach(btn => {
    btn.addEventListener("click", handleRemoveCardFromUnit);
  });

  // Add delete unit listeners
  container.querySelectorAll(".unit-btn.delete").forEach(btn => {
    btn.addEventListener("click", (e) => handleDeleteUnit(parseInt(e.target.dataset.index)));
  });

  // Add drag start listeners for unit cards
  container.querySelectorAll(".unit-card").forEach(card => {
    card.addEventListener("dragstart", handleCardDragStart);
    // Left click to show card details
    card.addEventListener("click", (e) => {
      if (e.target.classList.contains("unit-card-remove")) return; // Ignore remove button clicks
      showCardDetailPopup(card.dataset.cardId);
    });
    // Right click to show card details
    card.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showCardDetailPopup(card.dataset.cardId);
    });
  });

  // Add title input change listeners
  container.querySelectorAll(".unit-title-input").forEach(input => {
    input.addEventListener("input", (e) => {
      const index = parseInt(e.target.dataset.index);
      if (!isNaN(index) && docViewState.currentDoc) {
        docViewState.currentDoc.story_units[index].title = e.target.value;
        markDirty();
      }
    });
  });

  // Add core point textarea change listeners
  container.querySelectorAll(".unit-content-textarea").forEach(textarea => {
    textarea.addEventListener("input", (e) => {
      const index = parseInt(e.target.dataset.index);
      if (!isNaN(index) && docViewState.currentDoc) {
        docViewState.currentDoc.story_units[index].core_point = e.target.value;
        markDirty();
      }
    });
  });

  // Add AI refine unit button listeners
  container.querySelectorAll(".ai-refine-unit").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const unitId = e.target.dataset.unitId;
      const index = parseInt(e.target.dataset.index);
      handleAIRefineUnit(unitId, index);
    });
  });

  // Add story unit drag-and-drop for reordering
  container.querySelectorAll(".story-unit").forEach(unit => {
    unit.addEventListener("dragstart", handleUnitDragStart);
    unit.addEventListener("dragend", handleUnitDragEnd);
  });
}


/**
 * Handle add new unit
 */
function handleAddUnit() {
  if (!docViewState.currentDoc) return;

  const newUnit = {
    unit_id: `U${Date.now()}`,
    title: "新故事单元",
    core_point: "",
    card_ids: [],
    question_id: null,
    hypothesis_id: null
  };

  docViewState.currentDoc.story_units.push(newUnit);
  markDirty();
  renderStoryUnits(docViewState.currentDoc.story_units);
}

/**
 * Handle delete unit
 */
function handleDeleteUnit(index) {
  if (isNaN(index)) return;
  if (!confirm("确定删除这个故事单元吗？")) return;

  docViewState.currentDoc.story_units.splice(index, 1);
  markDirty();
  renderStoryUnits(docViewState.currentDoc.story_units);
}

/**
 * Handle move unit
 */
function handleMoveUnit(index, direction) {
  if (isNaN(index)) return;
  const units = docViewState.currentDoc.story_units;
  const newIndex = index + direction;

  if (newIndex < 0 || newIndex >= units.length) return;

  // Swap
  [units[index], units[newIndex]] = [units[newIndex], units[index]];
  markDirty();
  renderStoryUnits(units);
}

/**
 * Handle unit drag over
 */
function handleUnitDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add("drag-over");
}

/**
 * Handle unit drag leave
 */
function handleUnitDragLeave(e) {
  e.currentTarget.classList.remove("drag-over");
}

/**
 * Handle unit drop
 */
function handleUnitDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove("drag-over");

  const cardId = e.dataTransfer.getData("cardId");
  const unitIndex = parseInt(e.currentTarget.dataset.unitIndex);

  if (!cardId || isNaN(unitIndex)) return;

  const unit = docViewState.currentDoc.story_units[unitIndex];
  if (!unit.card_ids) {
    unit.card_ids = [];
  }

  // Add card if not already present
  if (!unit.card_ids.includes(cardId)) {
    unit.card_ids.push(cardId);
    // 移除本地的简单更新，交给 AI 处理，避免内容跳变
    // updateUnitTitle(unit); 

    markDirty();
    renderStoryUnits(docViewState.currentDoc.story_units);

    // 自动触发 AI 重写（不阻塞拖拽操作）
    triggerAutoRefineUnit(unit.unit_id, unitIndex);
  }
}

/**
 * 自动触发 Story Unit 的 AI 重写（用于拖入卡片后）
 */
async function triggerAutoRefineUnit(unitId, index) {
  // 1. 设置 UI 为 loading 状态 (按钮 + 文本域)
  const container = document.querySelector(`.story-unit[data-unit-id="${unitId}"]`);
  const btn = container ? container.querySelector(".ai-refine-unit") : null;
  const textarea = container ? container.querySelector(".unit-content-textarea") : null;
  const titleInput = container ? container.querySelector(".unit-title-input") : null;

  const originalText = btn ? btn.textContent : "✨";

  if (btn) {
    btn.textContent = "⏳";
    btn.disabled = true;
  }

  // 显示"思考中"状态
  let originalCorePoint = "";
  if (textarea) {
    originalCorePoint = textarea.value;
    textarea.value = "🤖 AI 正在阅读新卡片并重写本单元...";
    textarea.disabled = true;
    textarea.style.opacity = "0.7";
    textarea.style.fontStyle = "italic";
  }
  if (titleInput) {
    titleInput.style.opacity = "0.7";
  }

  try {
    const docId = docViewState.currentDoc.doc_id;
    // 2. 调用后端 API
    const response = await fetch(`${DOCUMENTS_API}/${docId}/story-units/${unitId}/ai-refine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });

    const data = await response.json();
    if (!data.ok) {
      throw new Error(data.error || "AI 请求失败");
    }

    // 3. 直接应用结果
    // 恢复样式以便显示新内容
    if (textarea) {
      textarea.style.opacity = "1";
      textarea.style.fontStyle = "normal";
      textarea.disabled = false;
    }
    if (titleInput) {
      titleInput.style.opacity = "1";
    }

    applyAIUnitDirectly(index, data.ai_title, data.ai_core_point);

  } catch (error) {
    console.error("自动 AI 重写失败:", error);

    // 恢复原始状态
    if (textarea) {
      textarea.value = originalCorePoint;
      textarea.style.opacity = "1";
      textarea.style.fontStyle = "normal";
      textarea.disabled = false;
    }
    if (titleInput) {
      titleInput.style.opacity = "1";
    }

    if (btn) {
      btn.textContent = "❌";
      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
      }, 2000);
      return;
    }
  }

  // 4. 恢复按钮状态（成功时）
  if (btn) {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

/**
 * Handle remove card from unit
 */
function handleRemoveCardFromUnit(e) {
  const unitIndex = parseInt(e.target.dataset.unitIndex);
  const cardId = e.target.dataset.cardId;

  if (isNaN(unitIndex) || !cardId) return;

  const unit = docViewState.currentDoc.story_units[unitIndex];
  if (unit.card_ids) {
    unit.card_ids = unit.card_ids.filter(id => id !== cardId);
    updateUnitTitle(unit);
    markDirty();
    renderStoryUnits(docViewState.currentDoc.story_units);
  }
}

/**
 * Update unit title based on linked cards
 */
function updateUnitTitle(unit) {
  if (!unit.card_ids || unit.card_ids.length === 0) {
    // If empty, keep current title/core_point or reset?
    // User requirement: "updateUnitTitle: Auto generate title/core_point from first card summary/snippet"
    // If no cards, we might want to leave it as is or set to default? 
    // Let's keep it as is if it has a title, or set to "空单元" if it was auto-generated.
    return;
  }

  const firstCard = docViewState.cardsForTopic.find(c => c.id === unit.card_ids[0]);
  if (firstCard) {
    const text = firstCard.summary || firstCard.raw_snippet || "";
    // Only auto-update if it looks like a default or empty title, or maybe always?
    // The prompt says "Auto generate...". Let's do it always for now when cards change.
    unit.title = text.substring(0, 30) + (text.length > 30 ? "..." : "");
    unit.core_point = text.substring(0, 100) + (text.length > 100 ? "..." : "");
  }
}

/**
 * Mark document as dirty
 */
function markDirty() {
  docViewState.dirty = true;
  const indicator = document.getElementById("unsavedIndicator");
  if (indicator) {
    indicator.classList.add("visible");
  }
}

/**
 * Clear dirty flag
 */
function clearDirty() {
  docViewState.dirty = false;
  const indicator = document.getElementById("unsavedIndicator");
  if (indicator) {
    indicator.classList.remove("visible");
  }
}

/**
 * Enable document buttons
 */
function enableDocButtons() {
  document.getElementById("saveDocBtn").disabled = false;
  document.getElementById("exportMarkdownBtn").disabled = false;
  document.getElementById("deleteDocBtn").disabled = false;
}

/**
 * Disable document buttons
 */
function disableDocButtons() {
  document.getElementById("saveDocBtn").disabled = true;
  document.getElementById("exportMarkdownBtn").disabled = true;
  document.getElementById("deleteDocBtn").disabled = true;
}

/**
 * 剥离文本前缀编号（如 "1. xxx" -> "xxx"）
 */
function stripNumberPrefix(text) {
  if (!text) return "";
  return text.replace(/^\d+\.\s*/, "").trim();
}

/**
 * Save document
 */
async function handleSaveDocument() {
  if (!docViewState.currentDoc) return;

  const questionsText = document.getElementById("docQuestionsContainer").value;
  const hypothesesText = document.getElementById("docHypothesesContainer").value;

  // Parse questions and hypotheses - 剥离前缀编号
  const questions = questionsText.split("\n").filter(t => t.trim()).map((text, i) => ({
    id: `Q${i + 1}`,
    text: stripNumberPrefix(text)
  }));

  const hypotheses = hypothesesText.split("\n").filter(t => t.trim()).map((text, i) => ({
    id: `H${i + 1}`,
    text: stripNumberPrefix(text),
    question_id: null
  }));

  try {
    const response = await fetch(`${DOCUMENTS_API}/${docViewState.currentDoc.doc_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        doc_questions: questions,
        doc_hypotheses: hypotheses,
        story_units: docViewState.currentDoc.story_units
      })
    });

    const data = await response.json();
    if (data.ok) {
      clearDirty();
      alert("保存成功！");
      // 刷新文档列表
      await refreshDocuments();
      // 更新两个 topic 下拉框（确保同步）
      await updateDocTopicFilter();
      await updateTopicFilter();
      // 如果卡片视图当前有筛选，也需要刷新卡片列表以反映变化
      if (currentView === "cards" || topicFilter.value) {
        await refreshCards();
      }
      // 重新加载当前文档以显示最新数据
      if (docViewState.currentDoc) {
        await loadDocumentDetail(docViewState.currentDoc.doc_id);
      }
    } else {
      throw new Error(data.error || "保存失败");
    }
  } catch (error) {
    console.error("保存文档失败：", error);
    alert("保存失败：" + error.message);
  }
}

/**
 * 处理 AI 优化问题 & 假设（统一按钮）
 * 调用后端 API，返回 AI 建议后在弹窗中显示让用户确认
 */
async function handleAIRefineQH() {
  if (!docViewState.currentDoc) {
    alert("请先选择一个文档");
    return;
  }

  const docId = docViewState.currentDoc.doc_id;
  const btn = document.getElementById("aiRefineQHBtn");
  const originalText = btn.textContent;
  btn.textContent = "⏳ AI 思考中...";
  btn.disabled = true;

  try {
    const response = await fetch(`${DOCUMENTS_API}/${docId}/ai-qh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "both" })
    });

    const data = await response.json();
    if (!data.ok) {
      throw new Error(data.error || "AI 请求失败");
    }

    // 直接应用 AI 建议（不再弹窗确认）
    applyAIQHDirectly(data.ai_doc_questions, data.ai_doc_hypotheses);
  } catch (error) {
    console.error("AI 优化 Q/H 失败：", error);
    alert("AI 优化失败：" + error.message);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

/**
 * 直接应用 AI 建议的问题和假设（不弹窗确认）
 */
function applyAIQHDirectly(aiQuestions, aiHypotheses) {
  if (!docViewState.currentDoc) return;

  // 更新问题
  const newQuestions = (aiQuestions || []).map((q, i) => ({
    id: `Q${i + 1}`,
    text: q.text || q
  }));

  // 更新假设
  const newHypotheses = (aiHypotheses || []).map((h, i) => ({
    id: `H${i + 1}`,
    text: h.text || h,
    question_id: h.question_id || null
  }));

  // 更新 textarea - 添加编号前缀
  const questionsContainer = document.getElementById("docQuestionsContainer");
  const hypothesesContainer = document.getElementById("docHypothesesContainer");

  if (questionsContainer) {
    questionsContainer.value = newQuestions.map((q, i) => `${i + 1}. ${q.text}`).join("\n");
  }
  if (hypothesesContainer) {
    hypothesesContainer.value = newHypotheses.map((h, i) => `${i + 1}. ${h.text}`).join("\n");
  }

  docViewState.currentDoc.doc_questions = newQuestions;
  docViewState.currentDoc.doc_hypotheses = newHypotheses;
  markDirty();

  // 重新渲染假设列表
  renderHypothesesList();

  console.log("✅ AI 建议已直接应用");
}

/**
 * 显示 AI 建议的问题和假设（弹窗确认）
 */
function showAIQHSuggestionDialog(aiQuestions, aiHypotheses) {
  const dialog = document.getElementById("aiSuggestionDialog");
  const container = document.getElementById("aiSuggestionContent");
  const dialogTitle = document.querySelector("#aiSuggestionDialog h3");

  dialogTitle.textContent = "AI 建议的问题 & 假设";

  // 构建内容
  let html = '<div style="max-height: 400px; overflow-y: auto;">';

  // 问题部分
  html += '<div style="margin-bottom: 16px;"><strong>📋 建议问题：</strong></div>';
  if (aiQuestions && aiQuestions.length > 0) {
    html += '<div style="margin-bottom: 16px;">';
    aiQuestions.forEach((q, i) => {
      const status = q.status || "new";
      const statusLabel = status === "keep" ? "保持" : status === "new" ? "新增" : status === "weaken" ? "弱化" : "";
      const statusColor = status === "keep" ? "#28a745" : status === "new" ? "#007bff" : status === "weaken" ? "#ffc107" : "#666";
      html += `
        <div class="ai-suggestion-item" style="margin-bottom: 8px; padding: 8px; background: #f8f9fa; border-radius: 4px; border-left: 3px solid ${statusColor};">
          <input type="checkbox" id="aiQ${i}" checked data-type="question" data-index="${i}">
          <label for="aiQ${i}" style="margin-left: 8px;">${escapeHtml(q.text)}</label>
          <span style="float: right; font-size: 11px; color: ${statusColor};">${statusLabel}</span>
        </div>
      `;
    });
    html += '</div>';
  } else {
    html += '<div style="color: #888; margin-bottom: 16px;">暂无问题建议</div>';
  }

  // 假设部分
  html += '<div style="margin-bottom: 16px;"><strong>💡 建议假设：</strong></div>';
  if (aiHypotheses && aiHypotheses.length > 0) {
    html += '<div>';
    aiHypotheses.forEach((h, i) => {
      const status = h.status || "new";
      const statusLabel = status === "keep" ? "保持" : status === "new" ? "新增" : status === "weaken" ? "弱化" : "";
      const statusColor = status === "keep" ? "#28a745" : status === "new" ? "#007bff" : status === "weaken" ? "#ffc107" : "#666";
      html += `
        <div class="ai-suggestion-item" style="margin-bottom: 8px; padding: 8px; background: #f8f9fa; border-radius: 4px; border-left: 3px solid ${statusColor};">
          <input type="checkbox" id="aiH${i}" checked data-type="hypothesis" data-index="${i}">
          <label for="aiH${i}" style="margin-left: 8px;">${escapeHtml(h.text)}</label>
          <span style="float: right; font-size: 11px; color: ${statusColor};">${statusLabel}</span>
        </div>
      `;
    });
    html += '</div>';
  } else {
    html += '<div style="color: #888;">暂无假设建议</div>';
  }

  html += '</div>';
  html += '<div style="margin-top: 16px; display: flex; gap: 8px; justify-content: flex-end;">';
  html += '<button id="applyAIQHBtn" class="btn-primary">✓ 应用选中建议</button>';
  html += '<button id="cancelAIQHBtn" class="btn-secondary">取消</button>';
  html += '</div>';

  container.innerHTML = html;
  dialog.style.display = "flex";

  // 保存 AI 建议数据供应用时使用
  dialog.dataset.aiQuestions = JSON.stringify(aiQuestions || []);
  dialog.dataset.aiHypotheses = JSON.stringify(aiHypotheses || []);

  // 绑定按钮事件
  document.getElementById("applyAIQHBtn").addEventListener("click", applyAIQHSuggestions);
  document.getElementById("cancelAIQHBtn").addEventListener("click", () => {
    dialog.style.display = "none";
  });
}

/**
 * 应用选中的 AI Q/H 建议
 */
function applyAIQHSuggestions() {
  const dialog = document.getElementById("aiSuggestionDialog");
  const aiQuestions = JSON.parse(dialog.dataset.aiQuestions || "[]");
  const aiHypotheses = JSON.parse(dialog.dataset.aiHypotheses || "[]");

  // 收集选中的问题
  const selectedQuestions = [];
  aiQuestions.forEach((q, i) => {
    const checkbox = document.getElementById(`aiQ${i}`);
    if (checkbox && checkbox.checked) {
      selectedQuestions.push(q);
    }
  });

  // 收集选中的假设
  const selectedHypotheses = [];
  aiHypotheses.forEach((h, i) => {
    const checkbox = document.getElementById(`aiH${i}`);
    if (checkbox && checkbox.checked) {
      selectedHypotheses.push(h);
    }
  });

  // 更新文档状态
  if (docViewState.currentDoc) {
    // 更新问题
    const newQuestions = selectedQuestions.map((q, i) => ({
      id: `Q${i + 1}`,
      text: q.text
    }));

    // 更新假设
    const newHypotheses = selectedHypotheses.map((h, i) => ({
      id: `H${i + 1}`,
      text: h.text,
      question_id: h.question_id || null
    }));

    // 更新 textarea - 添加编号前缀
    const questionsContainer = document.getElementById("docQuestionsContainer");
    const hypothesesContainer = document.getElementById("docHypothesesContainer");

    if (questionsContainer) {
      questionsContainer.value = newQuestions.map((q, i) => `${i + 1}. ${q.text}`).join("\n");
    }
    if (hypothesesContainer) {
      hypothesesContainer.value = newHypotheses.map((h, i) => `${i + 1}. ${h.text}`).join("\n");
    }

    docViewState.currentDoc.doc_questions = newQuestions;
    docViewState.currentDoc.doc_hypotheses = newHypotheses;
    markDirty();

    // 重新渲染假设列表
    renderHypothesesList();
  }

  dialog.style.display = "none";
}

/**
 * 处理 AI 改写单个 Story Unit
 */
async function handleAIRefineUnit(unitId, index) {
  if (!docViewState.currentDoc) {
    alert("请先选择一个文档");
    return;
  }

  const docId = docViewState.currentDoc.doc_id;
  const btn = document.querySelector(`.ai-refine-unit[data-unit-id="${unitId}"]`);
  const originalText = btn ? btn.textContent : "✨";
  if (btn) {
    btn.textContent = "⏳";
    btn.disabled = true;
  }

  try {
    const response = await fetch(`${DOCUMENTS_API}/${docId}/story-units/${unitId}/ai-refine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });

    const data = await response.json();
    if (!data.ok) {
      throw new Error(data.error || "AI 请求失败");
    }

    // 直接应用 AI 建议（不再弹窗确认）
    applyAIUnitDirectly(index, data.ai_title, data.ai_core_point);
  } catch (error) {
    console.error("AI 改写 Unit 失败：", error);
    alert("AI 改写失败：" + error.message);
  } finally {
    if (btn) {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }
}

/**
 * 直接应用 AI 建议的 Story Unit 改写（不弹窗确认）
 */
function applyAIUnitDirectly(index, aiTitle, aiCorePoint) {
  if (!docViewState.currentDoc || isNaN(index)) return;

  const unit = docViewState.currentDoc.story_units[index];
  if (!unit) return;

  // 直接更新标题和核心论点
  unit.title = aiTitle || unit.title;
  unit.core_point = aiCorePoint || unit.core_point;

  // 重新渲染 story units
  renderStoryUnits(docViewState.currentDoc.story_units);
  markDirty();

  console.log("✅ AI 建议已直接应用到故事单元", index);
}

/**
 * 显示 AI 建议的 Story Unit 改写（弹窗确认）
 */
function showAIUnitRefineDialog(unitId, index, aiTitle, aiCorePoint, aiNotes) {
  const dialog = document.getElementById("aiSuggestionDialog");
  const container = document.getElementById("aiSuggestionContent");
  const dialogTitle = document.querySelector("#aiSuggestionDialog h3");

  dialogTitle.textContent = "AI 建议改写 - 故事单元";

  const currentUnit = docViewState.currentDoc?.story_units?.[index];
  const currentTitle = currentUnit?.title || "";
  const currentCorePoint = currentUnit?.core_point || "";

  let html = '<div style="max-height: 400px; overflow-y: auto;">';

  // 标题对比
  html += `
    <div style="margin-bottom: 16px;">
      <strong>📌 标题：</strong>
      <div style="margin-top: 8px; padding: 8px; background: #fff3cd; border-radius: 4px;">
        <div style="color: #856404;">当前：${escapeHtml(currentTitle)}</div>
      </div>
      <div style="margin-top: 4px; padding: 8px; background: #d4edda; border-radius: 4px;">
        <input type="checkbox" id="applyAITitle" checked>
        <label for="applyAITitle" style="color: #155724; margin-left: 8px;">AI 建议：${escapeHtml(aiTitle)}</label>
      </div>
    </div>
  `;

  // 核心论点对比
  html += `
    <div style="margin-bottom: 16px;">
      <strong>💬 核心论点：</strong>
      <div style="margin-top: 8px; padding: 8px; background: #fff3cd; border-radius: 4px;">
        <div style="color: #856404; font-size: 13px;">${escapeHtml(currentCorePoint) || "(空)"}</div>
      </div>
      <div style="margin-top: 4px; padding: 8px; background: #d4edda; border-radius: 4px;">
        <input type="checkbox" id="applyAICorePoint" checked>
        <label for="applyAICorePoint" style="color: #155724; margin-left: 8px; font-size: 13px;">${escapeHtml(aiCorePoint)}</label>
      </div>
    </div>
  `;

  // AI 笔记
  if (aiNotes && aiNotes.length > 0) {
    html += `
      <div style="margin-bottom: 16px;">
        <strong>📝 AI 写作建议：</strong>
        <ul style="margin-top: 8px; padding-left: 20px; color: #666; font-size: 13px;">
          ${aiNotes.map(note => `<li>${escapeHtml(note)}</li>`).join("")}
        </ul>
      </div>
    `;
  }

  html += '</div>';
  html += '<div style="margin-top: 16px; display: flex; gap: 8px; justify-content: flex-end;">';
  html += '<button id="applyAIUnitBtn" class="btn-primary">✓ 应用选中建议</button>';
  html += '<button id="cancelAIUnitBtn" class="btn-secondary">取消</button>';
  html += '</div>';

  container.innerHTML = html;
  dialog.style.display = "flex";

  // 保存数据供应用时使用
  dialog.dataset.unitId = unitId;
  dialog.dataset.unitIndex = index;
  dialog.dataset.aiTitle = aiTitle;
  dialog.dataset.aiCorePoint = aiCorePoint;

  // 绑定按钮事件
  document.getElementById("applyAIUnitBtn").addEventListener("click", applyAIUnitRefine);
  document.getElementById("cancelAIUnitBtn").addEventListener("click", () => {
    dialog.style.display = "none";
  });
}

/**
 * 应用 AI 建议的 Story Unit 改写
 */
function applyAIUnitRefine() {
  const dialog = document.getElementById("aiSuggestionDialog");
  const index = parseInt(dialog.dataset.unitIndex);
  const aiTitle = dialog.dataset.aiTitle;
  const aiCorePoint = dialog.dataset.aiCorePoint;

  if (!docViewState.currentDoc || isNaN(index)) return;

  const unit = docViewState.currentDoc.story_units[index];
  if (!unit) return;

  // 检查选中的选项
  const applyTitle = document.getElementById("applyAITitle")?.checked;
  const applyCorePoint = document.getElementById("applyAICorePoint")?.checked;

  if (applyTitle) {
    unit.title = aiTitle;
  }
  if (applyCorePoint) {
    unit.core_point = aiCorePoint;
  }

  // 重新渲染 story units
  renderStoryUnits(docViewState.currentDoc.story_units);
  markDirty();

  dialog.style.display = "none";
}


/**
 * Delete document
 */
async function handleDeleteDocument() {
  if (!docViewState.currentDoc) return;

  if (!confirm(`确定删除文档 "${docViewState.currentDoc.topic_title}" 吗？`)) return;

  try {
    const response = await fetch(`${DOCUMENTS_API}/${docViewState.currentDoc.doc_id}`, {
      method: "DELETE"
    });

    const data = await response.json();
    if (data.ok) {
      alert("删除成功！");
      docViewState.currentDoc = null;
      currentDocId = null;
      documentDetail.innerHTML = '<div class="empty-state">请从左侧选择一个文档查看详情</div>';
      disableDocButtons();
      await refreshDocuments();
      // 更新两个 topic 下拉框（确保同步）
      await updateDocTopicFilter();
      await updateTopicFilter();
      // 如果卡片视图当前有筛选，也需要刷新卡片列表以反映变化
      if (currentView === "cards" || topicFilter.value) {
        await refreshCards();
      }
    } else {
      throw new Error(data.error || "删除失败");
    }
  } catch (error) {
    console.error("删除文档失败：", error);
    alert("删除失败：" + error.message);
  }
}

/**
 * Export markdown
 */
function handleExportMarkdown() {
  if (!docViewState.currentDoc) return;

  const doc = docViewState.currentDoc;
  let markdown = `# ${doc.topic_title}\n\n`;

  // Questions
  markdown += `## 文档问题\n\n`;
  doc.doc_questions.forEach(q => {
    markdown += `- ${q.text}\n`;
  });
  markdown += `\n`;

  // Hypotheses
  markdown += `## 文档假设\n\n`;
  doc.doc_hypotheses.forEach(h => {
    markdown += `- ${h.text}\n`;
  });
  markdown += `\n`;

  // Story Units
  markdown += `## 故事单元\n\n`;
  doc.story_units.forEach((unit, i) => {
    markdown += `### ${unit.title || `单元 ${i + 1}`}\n\n`;
    markdown += `${unit.core_point || ""}\n\n`;

    if (unit.card_ids && unit.card_ids.length > 0) {
      markdown += `**引用卡片：**\n\n`;
      unit.card_ids.forEach(cardId => {
        const card = docViewState.cardsForTopic.find(c => c.id === cardId);
        if (card) {
          markdown += `- ${card.summary || card.raw_snippet || cardId}\n`;
        }
      });
      markdown += `\n`;
    }
  });

  // Show in overlay
  const overlay = document.getElementById("markdownOverlay");
  const container = document.getElementById("markdownOutputContainer");
  const textarea = document.getElementById("docMarkdownOutput");

  textarea.value = markdown;
  overlay.classList.add("visible");
  container.classList.add("visible");
  textarea.select();
}

/**
 * Close markdown overlay
 */
function handleCloseMarkdown() {
  document.getElementById("markdownOverlay").classList.remove("visible");
  document.getElementById("markdownOutputContainer").classList.remove("visible");
}

// Bind document canvas events
document.getElementById("saveDocBtn").addEventListener("click", handleSaveDocument);
document.getElementById("deleteDocBtn").addEventListener("click", handleDeleteDocument);
document.getElementById("exportMarkdownBtn").addEventListener("click", handleExportMarkdown);
document.getElementById("closeMarkdownBtn").addEventListener("click", handleCloseMarkdown);
document.getElementById("markdownOverlay").addEventListener("click", handleCloseMarkdown);

// Override loadDocumentDetail to use new editable view
async function loadDocumentDetail(docId) {
  // Check if switching documents with unsaved changes
  if (docViewState.dirty && docViewState.currentDoc) {
    if (!confirm("当前文档有未保存的更改，确定要切换文档吗？")) {
      return;
    }
  }

  currentDocId = docId;
  clearDirty(); // Reset dirty flag when switching documents

  // Update list selection
  documentsList.querySelectorAll(".doc-list-item").forEach(item => {
    if (item.dataset.docId === docId) {
      item.classList.add("selected");
    } else {
      item.classList.remove("selected");
    }
  });

  documentDetail.innerHTML = '<div class="loading">加载中...</div>';
  const doc = await fetchDocumentDetail(docId);
  if (doc) {
    renderEditableDocumentDetail(doc);
  }
}

// 初始加载：先加载 Topic，再加载卡片
(async function init() {
  await updateTopicFilter();
  await refreshCards();
  await updateDocTopicDisplay();
})();

// ========= 新增功能函数 =========

/**
 * 获取当前文档使用的所有卡片 ID
 */
function getUsedCardIds() {
  if (!docViewState.currentDoc) return new Set();
  const usedIds = new Set();
  docViewState.currentDoc.story_units.forEach(unit => {
    (unit.card_ids || []).forEach(id => usedIds.add(id));
  });
  return usedIds;
}

/**
 * 渲染卡片池（增强版：支持标记已使用卡片）
 */
function renderCardPool() {
  const poolContainer = document.getElementById("cardPoolContainer");
  const poolCount = document.getElementById("poolCount");
  const searchInput = document.getElementById("cardPoolSearch");
  const showUnusedOnly = document.getElementById("showUnusedOnly");

  if (!poolContainer) return;

  let cards = docViewState.cardsForTopic;
  const usedIds = getUsedCardIds();

  // 应用搜索过滤
  const searchText = searchInput ? searchInput.value.trim().toLowerCase() : "";
  if (searchText) {
    cards = cards.filter(card => {
      const summary = (card.summary || "").toLowerCase();
      const snippet = (card.raw_snippet || "").toLowerCase();
      return summary.includes(searchText) || snippet.includes(searchText);
    });
  }

  // 应用"仅看未使用"过滤
  if (showUnusedOnly && showUnusedOnly.checked) {
    cards = cards.filter(card => !usedIds.has(card.id));
  }

  poolCount.textContent = cards.length;

  if (cards.length === 0) {
    poolContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">暂无卡片</div>';
    return;
  }

  poolContainer.innerHTML = cards.map(card => {
    const isUsed = usedIds.has(card.id);
    return `
      <div class="pool-card ${isUsed ? 'used' : ''}" draggable="true" data-card-id="${escapeHtmlAttr(card.id)}">
        <div class="pool-card-summary">${escapeHtml(card.summary || card.raw_snippet || "")}</div>
        <div class="pool-card-meta">
          <span>${escapeHtml(card.source_name || card.id.substring(0, 8))}</span>
        </div>
      </div>
    `;
  }).join("");

  // Add drag event listeners
  poolContainer.querySelectorAll(".pool-card").forEach(card => {
    card.addEventListener("dragstart", handleCardDragStart);
    card.addEventListener("click", () => showCardDetailPopup(card.dataset.cardId));
  });
}

/**
 * 显示卡片详情浮层
 */
function showCardDetailPopup(cardId) {
  const card = docViewState.cardsForTopic.find(c => c.id === cardId);
  if (!card) return;

  const popup = document.getElementById("cardDetailPopup");
  const content = document.getElementById("cardDetailContent");

  const imageHtml = card.image_url
    ? `<div class="detail-section">
        <div class="detail-label">图片</div>
        <div class="detail-text"><img src="${escapeHtmlAttr(card.image_url)}" alt="卡片图片" style="max-width: 100%; max-height: 400px; border-radius: 4px; margin-top: 8px;" /></div>
      </div>`
    : "";

  content.innerHTML = `
    <div class="detail-section">
      <div class="detail-label">摘要</div>
      <div class="detail-text">${escapeHtml(card.summary || "暂无")}</div>
    </div>
    ${imageHtml}
    <div class="detail-section">
      <div class="detail-label">原文片段</div>
      <div class="detail-text">${escapeHtml(card.raw_snippet || "暂无")}</div>
    </div>
    <div class="detail-section">
      <div class="detail-label">批注</div>
      <div class="detail-text">${escapeHtml(card.note || "暂无")}</div>
    </div>
    <div class="detail-section">
      <div class="detail-label">来源</div>
      <div class="detail-text">${escapeHtml(card.source_name || "未知")} ${card.source_url ? `<a href="${escapeHtmlAttr(card.source_url)}" target="_blank">↗</a>` : ""}</div>
    </div>
  `;

  popup.classList.add("visible");
}

/**
 * 隐藏卡片详情浮层
 */
function hideCardDetailPopup() {
  document.getElementById("cardDetailPopup").classList.remove("visible");
}

// 绑定卡片详情浮层关闭按钮
document.getElementById("closeCardDetailBtn").addEventListener("click", hideCardDetailPopup);

/**
 * AI 建议问题
 */
async function handleSuggestQuestions() {
  const cardSummaries = docViewState.cardsForTopic.slice(0, 10).map(c => c.summary || c.raw_snippet || "");
  const topicTitle = docViewState.currentDoc?.topic_title || "";

  showAISuggestionDialog("AI 建议问题", async () => {
    const resp = await fetch(`${DOCUMENTS_API}/suggest-questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic_title: topicTitle, card_summaries: cardSummaries })
    });
    const data = await resp.json();
    return data.ok ? data.questions : [];
  }, (text) => {
    const textarea = document.getElementById("docQuestionsContainer");
    if (textarea) {
      textarea.value = textarea.value ? textarea.value + "\n" + text : text;
      markDirty();
    }
  });
}

/**
 * AI 建议假设
 */
async function handleSuggestHypotheses() {
  const cardSummaries = docViewState.cardsForTopic.slice(0, 10).map(c => c.summary || c.raw_snippet || "");
  const topicTitle = docViewState.currentDoc?.topic_title || "";
  const questionsText = document.getElementById("docQuestionsContainer")?.value || "";
  const questions = questionsText.split("\n").filter(q => q.trim());

  showAISuggestionDialog("AI 建议假设", async () => {
    const resp = await fetch(`${DOCUMENTS_API}/suggest-hypotheses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic_title: topicTitle, questions, card_summaries: cardSummaries })
    });
    const data = await resp.json();
    return data.ok ? data.hypotheses : [];
  }, (text) => {
    const textarea = document.getElementById("docHypothesesContainer");
    if (textarea) {
      textarea.value = textarea.value ? textarea.value + "\n" + text : text;
      markDirty();
    }
  });
}

/**
 * AI 建议故事单元标题
 */
async function handleSuggestUnitTitle(unitIndex) {
  if (!docViewState.currentDoc || isNaN(unitIndex)) return;

  const unit = docViewState.currentDoc.story_units[unitIndex];
  if (!unit) return;

  const cardSummaries = (unit.card_ids || []).map(id => {
    const card = docViewState.cardsForTopic.find(c => c.id === id);
    return card ? (card.summary || card.raw_snippet || "") : "";
  }).filter(Boolean);

  showAISuggestionDialog("AI 建议标题", async () => {
    const resp = await fetch(`${DOCUMENTS_API}/suggest-unit-title`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ core_point: unit.core_point || "", card_summaries: cardSummaries })
    });
    const data = await resp.json();
    return data.ok ? data.titles : [];
  }, (text) => {
    const titleInput = document.querySelector(`.unit-title-input[data-index="${unitIndex}"]`);
    if (titleInput) {
      titleInput.value = text;
      docViewState.currentDoc.story_units[unitIndex].title = text;
      markDirty();
    }
  });
}

/**
 * 显示 AI 建议弹窗
 */
async function showAISuggestionDialog(title, fetchSuggestions, onSelect) {
  const dialog = document.getElementById("aiSuggestionDialog");
  const titleEl = document.getElementById("aiSuggestionTitle");
  const loading = document.getElementById("aiSuggestionLoading");
  const list = document.getElementById("aiSuggestionList");

  titleEl.textContent = title;
  loading.style.display = "block";
  list.innerHTML = "";
  dialog.classList.add("visible");

  try {
    const suggestions = await fetchSuggestions();
    loading.style.display = "none";

    if (suggestions.length === 0) {
      list.innerHTML = '<div style="color: #999; text-align: center;">暂无建议</div>';
      return;
    }

    list.innerHTML = suggestions.map((text, i) => `
      <div class="suggestion-item" data-index="${i}">
        <span class="suggestion-text">${escapeHtml(text)}</span>
        <button class="suggestion-add-btn" data-text="${escapeHtmlAttr(text)}">+</button>
      </div>
    `).join("");

    list.querySelectorAll(".suggestion-add-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        onSelect(btn.dataset.text);
        btn.closest(".suggestion-item").style.opacity = "0.5";
        btn.disabled = true;
      });
    });
  } catch (error) {
    loading.style.display = "none";
    list.innerHTML = `<div style="color: #c0392b;">获取建议失败: ${escapeHtml(error.message)}</div>`;
  }
}

// 绑定 AI 建议弹窗关闭按钮
document.getElementById("closeAiSuggestionBtn").addEventListener("click", () => {
  document.getElementById("aiSuggestionDialog").classList.remove("visible");
});

/**
 * 故事单元拖拽排序处理
 */
let draggedUnitIndex = null;

function handleUnitDragStart(e) {
  // 只有从拖拽手柄开始才允许拖拽整个单元
  if (!e.target.classList.contains("unit-drag-handle") &&
    !e.target.closest(".unit-drag-handle")) {
    // 如果不是从拖拽手柄开始，检查是否是卡片拖拽
    if (e.target.classList.contains("pool-card") ||
      e.target.classList.contains("unit-card")) {
      return; // 允许卡片拖拽
    }
    e.preventDefault();
    return;
  }

  const unit = e.target.closest(".story-unit");
  if (unit) {
    draggedUnitIndex = parseInt(unit.dataset.unitIndex);
    unit.classList.add("dragging");
    e.dataTransfer.setData("unitIndex", draggedUnitIndex.toString());
    e.dataTransfer.effectAllowed = "move";
  }
}

function handleUnitDragEnd(e) {
  const unit = e.target.closest(".story-unit");
  if (unit) {
    unit.classList.remove("dragging");
  }
  document.querySelectorAll(".story-unit").forEach(u => u.classList.remove("drop-target"));
  draggedUnitIndex = null;
}

/**
 * 显示新建文档对话框
 */
async function showCreateDocDialog() {
  const dialog = document.getElementById("createDocDialog");
  const topicSelect = document.getElementById("newDocTopic");
  const titleInput = document.getElementById("newDocTitle");

  // 加载 topic 列表
  const topics = await loadTopics();
  topicSelect.innerHTML = '<option value="">选择 Topic...</option>' +
    topics.map(t => `<option value="${escapeHtmlAttr(t)}">${escapeHtml(t)}</option>`).join("");

  // 如果当前已选择了 topic，默认选中
  if (docTopicFilter.value) {
    topicSelect.value = docTopicFilter.value;
  }

  titleInput.value = "未命名文档";
  dialog.classList.add("visible");
}

/**
 * 隐藏新建文档对话框
 */
function hideCreateDocDialog() {
  document.getElementById("createDocDialog").classList.remove("visible");
}

/**
 * 创建新文档
 */
async function handleCreateDocument() {
  const topicTitle = document.getElementById("newDocTopic").value;
  const docTitle = document.getElementById("newDocTitle").value.trim() || "未命名文档";
  const preloadCards = document.getElementById("preloadCards").checked;

  if (!topicTitle) {
    alert("请选择归属 Topic");
    return;
  }

  try {
    const resp = await fetch(DOCUMENTS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic_title: topicTitle, // 使用下拉选的 Topic
        preload_cards: preloadCards
      })
    });

    const data = await resp.json();
    if (!data.ok) {
      throw new Error(data.error || "创建失败");
    }

    hideCreateDocDialog();

    // 刷新文档列表
    await refreshDocuments();

    // 更新两个 topic 下拉框（确保同步，包含新文档的 topic）
    await updateDocTopicFilter();
    await updateTopicFilter();

    // 如果卡片视图当前有筛选，也需要刷新卡片列表以反映变化
    if (currentView === "cards" || topicFilter.value) {
      await refreshCards();
    }

    // 加载新文档
    await loadDocumentDetail(data.document.doc_id);

    // 如果预加载卡片，更新卡片池
    if (preloadCards && data.cards) {
      docViewState.cardsForTopic = data.cards;
      renderCardPool();
    }
  } catch (error) {
    alert("创建文档失败: " + error.message);
  }
}

// 绑定新建文档对话框按钮
document.getElementById("createDocBtn").addEventListener("click", showCreateDocDialog);
document.getElementById("cancelCreateDocBtn").addEventListener("click", hideCreateDocDialog);
document.getElementById("confirmCreateDocBtn").addEventListener("click", handleCreateDocument);

// 绑定卡片池搜索和过滤
document.getElementById("cardPoolSearch").addEventListener("input", renderCardPool);
document.getElementById("showUnusedOnly").addEventListener("change", renderCardPool);

/**
 * 切换视图时加载所有卡片到卡片池
 */
const originalSwitchView = switchView;
window.switchView = function (view) {
  // 检查是否有未保存的更改
  if (currentView === "documents" && docViewState.dirty && docViewState.currentDoc) {
    const choice = confirm("当前文档有未保存的更改，是否保存后再切换？\n\n点击「确定」保存并切换，点击「取消」直接切换（放弃更改）");
    if (choice) {
      handleSaveDocument().then(() => {
        originalSwitchView(view);
        loadAllCardsToPool();
      });
      return;
    }
    clearDirty();
  }

  originalSwitchView(view);

  // 切换到文档视图时，加载所有卡片（如果未选择文档）
  if (view === "documents") {
    loadAllCardsToPool();
  }
};

/**
 * 加载所有卡片到卡片池
 */
async function loadAllCardsToPool() {
  try {
    // 获取当前选中的 topic 或全部卡片
    const topicTitle = docTopicFilter.value || undefined;
    const params = new URLSearchParams();
    if (topicTitle) {
      params.append("topic_title", topicTitle);
    }

    const resp = await fetch(`${API_BASE}?${params.toString()}`);
    const data = await resp.json();

    if (data.ok) {
      docViewState.cardsForTopic = data.cards || [];
      renderCardPool();
    }
  } catch (error) {
    console.error("加载卡片池失败:", error);
  }
}

/**
 * 增强的 Markdown 导出
 */
function handleExportMarkdownEnhanced() {
  if (!docViewState.currentDoc) return;

  const doc = docViewState.currentDoc;
  let markdown = `# ${doc.topic_title}\n\n`;

  // Questions
  markdown += `## 文档问题\n\n`;
  doc.doc_questions.forEach(q => {
    markdown += `- ${q.text}\n`;
  });
  markdown += `\n`;

  // Hypotheses
  markdown += `## 文档假设\n\n`;
  doc.doc_hypotheses.forEach(h => {
    markdown += `- ${h.text}\n`;
  });
  markdown += `\n`;

  // Story Units
  markdown += `## 故事单元\n\n`;
  doc.story_units.forEach((unit, i) => {
    markdown += `### ${unit.title || `单元 ${i + 1}`}\n\n`;
    markdown += `${unit.core_point || ""}\n\n`;

    if (unit.card_ids && unit.card_ids.length > 0) {
      markdown += `**引用卡片：**\n\n`;
      unit.card_ids.forEach(cardId => {
        const card = docViewState.cardsForTopic.find(c => c.id === cardId);
        if (card) {
          markdown += `- ${card.summary || card.raw_snippet || cardId}\n`;
        }
      });
      markdown += `\n`;
    }
  });

  // Show in overlay
  const overlay = document.getElementById("markdownOverlay");
  const container = document.getElementById("markdownOutputContainer");
  const textarea = document.getElementById("docMarkdownOutput");

  textarea.value = markdown;
  overlay.classList.add("visible");
  container.classList.add("visible");
  textarea.select();
}

// 替换原有的导出处理
document.getElementById("exportMarkdownBtn").removeEventListener("click", handleExportMarkdown);
document.getElementById("exportMarkdownBtn").addEventListener("click", handleExportMarkdownEnhanced);

// 复制 Markdown 到剪贴板
document.getElementById("copyMarkdownBtn").addEventListener("click", async () => {
  const textarea = document.getElementById("docMarkdownOutput");
  try {
    await navigator.clipboard.writeText(textarea.value);
    alert("已复制到剪贴板！");
  } catch (err) {
    // 降级方案
    textarea.select();
    document.execCommand("copy");
    alert("已复制到剪贴板！");
  }
});

// 下载 Markdown 文件
document.getElementById("downloadMarkdownBtn").addEventListener("click", () => {
  const textarea = document.getElementById("docMarkdownOutput");
  const content = textarea.value;
  const title = docViewState.currentDoc?.topic_title || "document";
  const filename = `${title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_")}.md`;

  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// ==========================================
// 恢复/新增丢失的 Agent2 文档生成功能
// ==========================================

/**
 * 自动计算文档主题
 */
async function determineTopicTitle() {
  const filterVal = topicFilter ? topicFilter.value : "";
  if (filterVal) {
    return filterVal;
  }

  // 如果勾选了卡片，直接使用勾选的卡片 ID 列表
  let cardIds = [];
  if (selectedCardIds.size > 0) {
    cardIds = Array.from(selectedCardIds);
  } else if (currentCards && currentCards.length > 0) {
    // 如果没有勾选，使用当前列表（最多前 5 张）
    cardIds = currentCards.slice(0, 5).map(c => c.id);
  }

  if (cardIds.length === 0) {
    return "";
  }

  // 调用后端生成标题
  try {
    const response = await fetch(`${API_BASE}/generate-title`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ card_ids: cardIds })
    });
    const data = await response.json();
    return data.ok ? data.title : "";
  } catch (error) {
    console.error("生成 Topic 标题失败:", error);
    return "";
  }
}

/**
 * 更新界面上的文档主题显示
 */
async function updateDocTopicDisplay() {
  const input = document.getElementById("docTopicInput");
  if (!input) return;

  const filterVal = topicFilter ? topicFilter.value : "";
  if (filterVal) {
    input.value = filterVal;
    return;
  }

  // 如果没有勾选卡片，显示提示信息
  if (selectedCardIds.size === 0) {
    input.value = "还没有勾选";
    return;
  }

  // 有勾选卡片时，立即尝试生成主题（每次勾选变化都会重新生成）
  input.value = "正在生成主题...";
  const title = await determineTopicTitle();
  // 防止在异步期间用户已经切换了 topic 或取消勾选
  const currentFilterVal = topicFilter ? topicFilter.value : "";
  if (currentFilterVal) {
    input.value = currentFilterVal;
  } else if (selectedCardIds.size === 0) {
    // 如果用户在生成过程中取消了勾选，显示提示
    input.value = "还没有勾选";
  } else {
    input.value = title || "生成失败，请重试";
  }
}

/**
 * 处理"基于勾选生成文档"按钮点击
 */
async function handleGenerateFromSelected() {
  const btn = document.getElementById("generateFromSelectedBtn");
  if (btn) btn.disabled = true;

  try {
    // 1. 确定 Topic 标题
    const input = document.getElementById("docTopicInput");
    let topicTitle = input ? input.value : "";

    // 如果 input 里是 loading 文本，或者为空，尝试重新生成
    if (!topicTitle || topicTitle === "正在生成主题..." || topicTitle === "当未选择 Topic 时，将根据卡片内容自动生成") {
      topicTitle = await determineTopicTitle();
    }

    if (!topicTitle || topicTitle === "正在生成主题...") {
      alert("无法生成有效的主题，请手动选择一个 Topic 或等待生成完成");
      if (btn) btn.disabled = false;
      return;
    }

    // 2. 确定卡片 ID 集合
    let cardIds = Array.from(selectedCardIds);
    if (cardIds.length === 0) {
      // 如果没有勾选，使用当前列表的所有卡片
      cardIds = currentCards.map(c => c.id);
    }

    if (cardIds.length === 0) {
      alert("没有可用的卡片生成文档");
      if (btn) btn.disabled = false;
      return;
    }

    // 3. 调用后端生成文档
    // 显示进度提示
    const originalText = btn ? btn.textContent : "";
    if (btn) btn.textContent = "Agent2 正在阅读并生成文档结构...";

    const response = await fetch(`${DOCUMENTS_API}/from-cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic_title: topicTitle,
        card_ids: cardIds
      })
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.error === "agent2_failed" ? `Agent2 生成失败: ${data.detail}` : (data.error || "生成失败"));
    }

    // 4. 成功处理
    // alert("文档生成成功！"); // 可选：静默成功或轻提示

    // 清空选择
    selectedCardIds.clear();
    if (typeof updateSelectedCount === 'function') updateSelectedCount();

    // 插入成功提示
    const hint = document.createElement("div");
    hint.className = "success-hint";
    hint.textContent = `文档 "${data.document.topic_title}" 生成成功！切换到文档视图查看。`;
    hint.style.cssText = "background: #d4edda; color: #155724; padding: 10px; margin-bottom: 10px; border-radius: 4px;";

    // 尝试插入到 controls 下方
    const controls = document.querySelector(".agent2-section");
    if (controls) {
      controls.insertAdjacentElement('afterend', hint);
      setTimeout(() => hint.remove(), 5000);
    }

    // 自动刷新文档列表（如果文档视图已加载）
    await refreshDocuments();

  } catch (error) {
    console.error("生成文档失败:", error);
    alert("生成文档失败: " + error.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "基于勾选 / 当前筛选的卡片生成文档"; // 恢复原始文本
    }
  }
}

// ========= 重新绑定事件 =========
const _genBtn = document.getElementById("generateFromSelectedBtn");
if (_genBtn) {
  _genBtn.addEventListener("click", handleGenerateFromSelected);
}

// 监听 Topic 筛选变化，更新文档主题
if (topicFilter) {
  topicFilter.addEventListener("change", updateDocTopicDisplay);
}

// 注意：复选框变化已经在 cardsContainer 的 click 事件中通过 handleCardCheckboxChange 处理
// 这里不需要重复监听，避免重复调用 updateDocTopicDisplay

// 初始化时尝试更新一次
setTimeout(updateDocTopicDisplay, 1000);

// ========= Hypothesis 验证台相关函数 =========

let currentHypoEvalResult = null;

/**
 * 从 textarea 更新 doc_hypotheses - 剥离编号前缀
 */
function updateHypothesesFromTextarea() {
  if (!docViewState.currentDoc) return;

  const hypothesesText = document.getElementById("docHypothesesContainer")?.value || "";
  const hypotheses = hypothesesText.split("\n")
    .filter(t => t.trim())
    .map((text, i) => ({
      id: `H${i + 1}`,
      text: stripNumberPrefix(text),
      question_id: null
    }));

  docViewState.currentDoc.doc_hypotheses = hypotheses;
  renderHypothesesList();
}

/**
 * 渲染假设列表（带复选框）
 */
function renderHypothesesList() {
  const container = document.getElementById("hypothesesListContainer");
  if (!container || !docViewState.currentDoc) return;

  const hypotheses = docViewState.currentDoc.doc_hypotheses || [];

  if (hypotheses.length === 0) {
    container.innerHTML = '<p style="color: #999; font-size: 13px;">（暂无假设）</p>';
    return;
  }

  container.innerHTML = hypotheses.map((h, index) => `
    <label class="hypo-item" style="display: block; padding: 8px; margin-bottom: 6px; background: #f8f9fa; border-radius: 4px; cursor: pointer;">
      <input type="checkbox" data-hypo-id="${escapeHtmlAttr(h.id)}" style="margin-right: 8px;" />
      <span><strong>${escapeHtml(h.id)}</strong>: ${escapeHtml(h.text)}</span>
    </label>
  `).join("");
}

/**
 * 处理 Hypothesis 验证按钮点击
 */
async function handleEvaluateHypothesesClick() {
  if (!docViewState.currentDoc) {
    alert("请先选择一个文档");
    return;
  }

  const checkedIds = Array.from(
    document.querySelectorAll("#hypothesesListContainer .hypo-item input[type=checkbox]:checked")
  ).map(el => el.dataset.hypoId);

  if (!checkedIds.length) {
    alert("请至少选择一条假设再进行分析");
    return;
  }

  const btn = document.getElementById("btn-eval-hypotheses");
  const statusDiv = document.getElementById("hypo-eval-status");

  if (btn) btn.disabled = true;
  if (statusDiv) statusDiv.textContent = "正在分析中...";
  if (statusDiv) statusDiv.style.color = "#3498db";

  try {
    const resp = await fetch(`${DOCUMENTS_API}/${docViewState.currentDoc.doc_id}/hypotheses/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hypothesis_ids: checkedIds })
    });

    const data = await resp.json();

    if (!data.ok) {
      throw new Error(data.error || data.detail || "Hypothesis AI 分析失败");
    }

    currentHypoEvalResult = data.result;
    renderHypothesisEvalPanel();

    if (statusDiv) {
      statusDiv.textContent = "分析完成";
      statusDiv.style.color = "#28a745";
      setTimeout(() => { statusDiv.textContent = ""; }, 3000);
    }
  } catch (error) {
    console.error("Hypothesis evaluate failed:", error);
    alert("Hypothesis AI 分析失败：" + error.message);
    if (statusDiv) {
      statusDiv.textContent = "分析失败";
      statusDiv.style.color = "#dc3545";
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

/**
 * 渲染 Hypothesis 评估结果面板（新设计：左右布局）
 */
function renderHypothesisEvalPanel() {
  const panel = document.getElementById("hypo-eval-panel");
  if (!panel) return;

  const result = currentHypoEvalResult;
  if (!result) {
    panel.innerHTML = "";
    return;
  }

  const { topic_title, global_summary, evaluations, used_card_ids } = result;

  // 收集所有卡片 ID
  const allCardIds = new Set();
  evaluations.forEach(ev => {
    (ev.supporting_evidence || []).forEach(e => allCardIds.add(e.card_id));
    (ev.opposing_evidence || []).forEach(e => allCardIds.add(e.card_id));
    (ev.mixed_evidence || []).forEach(e => allCardIds.add(e.card_id));
  });

  // 获取卡片详情
  const allCards = docViewState.cardsForTopic || [];
  const cardsMap = new Map(allCards.map(c => [c.id, c]));

  let html = `
    <div class="hypo-eval-container" style="background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-top: 20px; overflow: hidden;">
      <!-- 顶部摘要 -->
      <div class="hypo-eval-summary" style="padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
        <h3 style="margin-top: 0; margin-bottom: 8px; font-size: 20px;">${escapeHtml(topic_title)}</h3>
        <p style="margin: 0; opacity: 0.95; font-size: 14px;">${escapeHtml(global_summary)}</p>
      </div>

      <!-- 左右布局容器 -->
      <div style="display: flex; height: calc(100vh - 400px); min-height: 600px;">
        <!-- 左侧：卡片列表 -->
        <div class="hypo-eval-cards-panel" style="width: 350px; border-right: 2px solid #e0e0e0; overflow-y: auto; background: #f8f9fa;">
          <div style="padding: 15px; background: white; border-bottom: 1px solid #e0e0e0; position: sticky; top: 0; z-index: 10;">
            <h4 style="margin: 0; font-size: 16px; color: #333;">相关卡片 (${allCardIds.size})</h4>
            <div style="margin-top: 8px; display: flex; gap: 8px; font-size: 12px;">
              <span style="color: #28a745;">● 支持</span>
              <span style="color: #dc3545;">● 反对</span>
              <span style="color: #ffc107;">● 混合</span>
            </div>
          </div>
          <div id="hypo-eval-cards-list" style="padding: 10px;">
            ${renderCardsListForHypoEval(evaluations, cardsMap)}
          </div>
        </div>

        <!-- 右侧：假设评估详情 -->
        <div class="hypo-eval-details-panel" style="flex: 1; overflow-y: auto; padding: 20px;">
          ${evaluations.map(ev => renderHypothesisEvaluationDetail(ev, cardsMap)).join("")}
        </div>
      </div>
    </div>
  `;

  panel.innerHTML = html;
}

/**
 * 渲染卡片列表（左侧面板）
 */
function renderCardsListForHypoEval(evaluations, cardsMap) {
  // 收集所有卡片并分类
  const cardStanceMap = new Map(); // card_id -> { stance, strength, rationale, hypothesis_id }

  evaluations.forEach(ev => {
    (ev.supporting_evidence || []).forEach(e => {
      if (!cardStanceMap.has(e.card_id)) {
        cardStanceMap.set(e.card_id, []);
      }
      cardStanceMap.get(e.card_id).push({ ...e, hypothesis_id: ev.hypothesis_id, stance: 'support' });
    });
    (ev.opposing_evidence || []).forEach(e => {
      if (!cardStanceMap.has(e.card_id)) {
        cardStanceMap.set(e.card_id, []);
      }
      cardStanceMap.get(e.card_id).push({ ...e, hypothesis_id: ev.hypothesis_id, stance: 'against' });
    });
    (ev.mixed_evidence || []).forEach(e => {
      if (!cardStanceMap.has(e.card_id)) {
        cardStanceMap.set(e.card_id, []);
      }
      cardStanceMap.get(e.card_id).push({ ...e, hypothesis_id: ev.hypothesis_id, stance: 'mixed' });
    });
  });

  if (cardStanceMap.size === 0) {
    return '<p style="padding: 20px; text-align: center; color: #999;">暂无相关卡片</p>';
  }

  const cardsHtml = Array.from(cardStanceMap.entries()).map(([cardId, evidences]) => {
    const card = cardsMap.get(cardId);
    const summary = card ? (card.summary || card.raw_snippet || "") : "";
    const truncatedSummary = truncateText(summary, 100);

    // 确定主要立场（优先显示 strong）
    const primaryEvidence = evidences.sort((a, b) => {
      const strengthOrder = { strong: 3, medium: 2, weak: 1 };
      return strengthOrder[b.strength] - strengthOrder[a.strength];
    })[0];

    const stanceColor = primaryEvidence.stance === 'support' ? '#28a745' :
      primaryEvidence.stance === 'against' ? '#dc3545' : '#ffc107';
    const stanceLabel = primaryEvidence.stance === 'support' ? '支持' :
      primaryEvidence.stance === 'against' ? '反对' : '混合';

    return `
      <div class="hypo-eval-card-item" 
           data-card-id="${escapeHtmlAttr(cardId)}"
           style="padding: 12px; margin-bottom: 10px; background: white; border-radius: 6px; border-left: 4px solid ${stanceColor}; cursor: pointer; transition: all 0.2s;"
           onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.1)'"
           onmouseout="this.style.boxShadow='none'"
           onclick="scrollToCardDetail('${escapeHtmlAttr(cardId)}')">
        <div style="display: flex; align-items: start; gap: 8px;">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
              <span style="font-size: 11px; padding: 2px 6px; background: ${stanceColor}; color: white; border-radius: 3px; font-weight: bold;">${stanceLabel}</span>
              <span style="font-size: 11px; color: #666;">${primaryEvidence.strength}</span>
              <code style="font-size: 10px; background: #f0f0f0; padding: 2px 4px; border-radius: 2px;">${escapeHtml(cardId.substring(0, 12))}...</code>
            </div>
            <div style="font-size: 13px; color: #333; line-height: 1.4;">${escapeHtml(truncatedSummary)}</div>
            <div style="margin-top: 6px; font-size: 11px; color: #999;">${evidences.length} 条证据</div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  return cardsHtml;
}

/**
 * 渲染单个假设的评估详情（右侧面板）
 */
function renderHypothesisEvaluationDetail(ev, cardsMap) {
  const supportCards = (ev.supporting_evidence || []).map(e => ({ ...e, card: cardsMap.get(e.card_id) }));
  const opposeCards = (ev.opposing_evidence || []).map(e => ({ ...e, card: cardsMap.get(e.card_id) }));
  const mixedCards = (ev.mixed_evidence || []).map(e => ({ ...e, card: cardsMap.get(e.card_id) }));

  const badgeColor = ev.risk_level === 'high' ? '#dc3545' : ev.risk_level === 'medium' ? '#ffc107' : '#28a745';
  const judgementColor = ev.overall_judgement.includes('support') ? '#28a745' :
    ev.overall_judgement.includes('against') ? '#dc3545' : '#ffc107';

  return `
    <div class="hypo-eval-item" 
         data-hypothesis-id="${escapeHtmlAttr(ev.hypothesis_id)}"
         style="margin-bottom: 30px; padding: 20px; background: #f8f9fa; border-radius: 8px; border: 2px solid ${judgementColor};">
      
      <!-- 假设标题和评分 -->
      <div style="margin-bottom: 15px;">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
          <h3 style="margin: 0; font-size: 18px; color: #333;">${escapeHtml(ev.hypothesis_id)}: ${escapeHtml(ev.hypothesis_text)}</h3>
        </div>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <span style="padding: 4px 10px; background: ${judgementColor}; color: white; border-radius: 4px; font-size: 12px; font-weight: bold;">${escapeHtml(ev.overall_judgement)}</span>
          <span style="padding: 4px 10px; background: ${badgeColor}; color: white; border-radius: 4px; font-size: 12px;">风险: ${escapeHtml(ev.risk_level)}</span>
          <span style="padding: 4px 10px; background: #6c757d; color: white; border-radius: 4px; font-size: 12px;">优先级: ${ev.priority}</span>
        </div>
        <div style="margin-top: 10px; padding: 10px; background: white; border-radius: 4px; font-size: 13px;">
          <strong>支持分:</strong> ${ev.support_score.toFixed(2)} / 
          <strong>反对分:</strong> ${ev.oppose_score.toFixed(2)} / 
          <strong>净信心:</strong> <span style="color: ${ev.net_confidence >= 0 ? '#28a745' : '#dc3545'}">${ev.net_confidence.toFixed(2)}</span>
        </div>
      </div>

      <!-- 支持证据 -->
      <div style="margin-bottom: 20px;">
        <h4 style="margin: 0 0 10px 0; font-size: 15px; color: #28a745; display: flex; align-items: center; gap: 6px;">
          <span>✅</span> 支持证据 (${supportCards.length})
        </h4>
        ${renderEvidenceCards(supportCards, 'support')}
      </div>

      <!-- 反对证据 -->
      <div style="margin-bottom: 20px;">
        <h4 style="margin: 0 0 10px 0; font-size: 15px; color: #dc3545; display: flex; align-items: center; gap: 6px;">
          <span>❌</span> 反对/质疑证据 (${opposeCards.length})
        </h4>
        ${renderEvidenceCards(opposeCards, 'against')}
      </div>

      <!-- 混合证据 -->
      ${mixedCards.length > 0 ? `
        <div style="margin-bottom: 20px;">
          <h4 style="margin: 0 0 10px 0; font-size: 15px; color: #ffc107; display: flex; align-items: center; gap: 6px;">
            <span>⚠️</span> 混合证据 (${mixedCards.length})
          </h4>
          ${renderEvidenceCards(mixedCards, 'mixed')}
        </div>
      ` : ''}

      <!-- 证据缺口 -->
      <div>
        <h4 style="margin: 0 0 10px 0; font-size: 15px; color: #667eea;">🔍 证据缺口 & 建议搜索</h4>
        ${renderGaps(ev.gaps)}
      </div>
    </div>
  `;
}

/**
 * 渲染证据卡片列表
 */
function renderEvidenceCards(cards, stance) {
  if (!cards || cards.length === 0) {
    return '<p style="color: #999; font-size: 13px; padding: 10px;">（暂无）</p>';
  }

  return `
    <div style="display: flex; flex-direction: column; gap: 10px;">
      ${cards.map(e => {
    const card = e.card;
    const cardExists = !!card;
    const stanceColor = stance === 'support' ? '#28a745' : stance === 'against' ? '#dc3545' : '#ffc107';
    const strengthColor = e.strength === 'strong' ? '#28a745' : e.strength === 'medium' ? '#ffc107' : '#6c757d';

    return `
          <div class="evidence-card" 
               data-card-id="${escapeHtmlAttr(e.card_id)}"
               style="padding: 12px; background: white; border-radius: 6px; border-left: 4px solid ${stanceColor};">
            <div style="display: flex; align-items: start; gap: 10px;">
              <div style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                  <code style="font-size: 11px; background: #f0f0f0; padding: 3px 6px; border-radius: 3px;">${escapeHtml(e.card_id)}</code>
                  <span style="font-size: 11px; padding: 2px 6px; background: ${strengthColor}; color: white; border-radius: 3px;">${escapeHtml(e.strength)}</span>
                </div>
                ${cardExists ? `
                  <div style="font-size: 13px; color: #333; margin-bottom: 6px; line-height: 1.5;">
                    <strong>摘要:</strong> ${escapeHtml(card.summary || "")}
                  </div>
                  ${card.key_points && card.key_points.length > 0 ? `
                    <div style="font-size: 12px; color: #666; margin-bottom: 6px;">
                      <strong>要点:</strong> ${card.key_points.slice(0, 3).map(kp => escapeHtml(String(kp))).join(", ")}
                    </div>
                  ` : ''}
                ` : '<div style="color: #999; font-size: 12px;">（卡片未找到）</div>'}
                <div style="font-size: 12px; color: #555; font-style: italic; margin-top: 6px; padding-top: 6px; border-top: 1px solid #e0e0e0;">
                  ${escapeHtml(e.rationale)}
                </div>
              </div>
            </div>
          </div>
        `;
  }).join("")}
    </div>
  `;
}

/**
 * 渲染证据缺口
 */
function renderGaps(gaps) {
  if (!gaps || !gaps.length) return "<p style=\"color: #999; font-size: 13px; padding: 10px;\">（暂无）</p>";

  return `
    <div style="display: flex; flex-direction: column; gap: 10px;">
      ${gaps.map(g => {
    const impactColor = g.impact === 'high' ? '#dc3545' : g.impact === 'medium' ? '#ffc107' : '#6c757d';
    return `
          <div style="padding: 12px; background: white; border-radius: 6px; border-left: 4px solid ${impactColor};">
            <div style="margin-bottom: 6px;">
              <strong style="font-size: 13px;">${escapeHtml(g.description)}</strong>
              <span style="font-size: 11px; padding: 2px 6px; background: ${impactColor}; color: white; border-radius: 3px; margin-left: 8px;">${escapeHtml(g.impact)}</span>
            </div>
            <div style="font-size: 12px; color: #666;">
              建议搜索：${(g.suggested_search_queries || []).map(q => `<code style="background: #f0f0f0; padding: 2px 6px; border-radius: 3px; margin-right: 4px;">${escapeHtml(q)}</code>`).join("")}
            </div>
          </div>
        `;
  }).join("")}
    </div>
  `;
}

/**
 * 滚动到卡片详情（点击左侧卡片时）
 */
function scrollToCardDetail(cardId) {
  const cardElement = document.querySelector(`.evidence-card[data-card-id="${escapeHtmlAttr(cardId)}"]`);
  if (cardElement) {
    cardElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // 高亮效果
    cardElement.style.transition = 'all 0.3s';
    cardElement.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.3)';
    setTimeout(() => {
      cardElement.style.boxShadow = '';
    }, 2000);
  }
}

// 暴露到全局，供 onclick 使用
window.scrollToCardDetail = scrollToCardDetail;

// ========= 卡片池折叠/展开功能 =========

/**
 * 初始化卡片池折叠/展开功能
 */
function initCardPoolToggle() {
  const toggleBtn = document.getElementById("togglePoolBtn");
  const cardPoolColumn = document.getElementById("cardPoolColumn");

  if (!toggleBtn || !cardPoolColumn) return;

  toggleBtn.addEventListener("click", () => {
    cardPoolColumn.classList.toggle("collapsed");
    // 更新按钮图标
    toggleBtn.textContent = cardPoolColumn.classList.contains("collapsed") ? "▶" : "◀";
  });
}

// 初始化卡片池折叠功能
initCardPoolToggle();
