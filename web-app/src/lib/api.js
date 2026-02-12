// ========= API 客户端 =========

const API_BASE = import.meta.env.VITE_API_URL || '/api';

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

// 获取存储的 token
function getAccessToken() {
  const session = localStorage.getItem('session');
  if (session) {
    try {
      return JSON.parse(session).access_token;
    } catch {
      return null;
    }
  }
  return null;
}

// 通用请求函数
async function request(endpoint, options = {}) {
  const token = getAccessToken();

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(
      data.message || data.error || '请求失败',
      response.status,
      data
    );
  }

  return data;
}

// ========= 认证 API =========

export const authApi = {
  // 注册
  register: (email, password, name, inviteCode) =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, invite_code: inviteCode }),
    }),

  // 登录
  login: (email, password) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  // 刷新令牌
  refresh: (refreshToken) =>
    request('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    }),

  // 获取当前用户
  me: () => request('/auth/me'),

  // 更新用户信息
  updateMe: (updates) =>
    request('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
};

// ========= 卡片 API (V2) =========

export const cardsApi = {
  // 获取卡片列表
  list: (params = {}) => {
    const query = new URLSearchParams();
    if (params.topic_title) query.set('topic_title', params.topic_title);
    if (params.topic_id) query.set('topic_id', params.topic_id);
    if (params.include_deleted) query.set('include_deleted', 'true');
    return request(`/v2/cards?${query}`);
  },

  // 获取单个卡片
  get: (id) => request(`/v2/cards/${id}`),

  // 捕获新卡片
  capture: (data) =>
    request('/v2/cards/capture', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // 搜索卡片
  search: (query, options = {}) =>
    request('/v2/cards/search', {
      method: 'POST',
      body: JSON.stringify({ query, ...options }),
    }),

  // 更新卡片
  update: (id, updates) =>
    request(`/v2/cards/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  // 删除卡片
  delete: (id) =>
    request(`/v2/cards/${id}`, {
      method: 'DELETE',
    }),

  // 生成文档标题
  generateTitle: (cardIds) =>
    request('/v2/cards/generate-title', {
      method: 'POST',
      body: JSON.stringify({ card_ids: cardIds }),
    }),

  // 上传文件到 OpenAI (FormData 特殊处理)
  uploadFile: async (file) => {
    const token = getAccessToken();
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/v2/cards/upload-file`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new ApiError(
        data.message || data.error || '文件上传失败',
        response.status,
        data
      );
    }

    return data;
  },

  // 从文档生成卡片
  generateFromDocument: (data) =>
    request('/v2/cards/generate-from-document', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// ========= Topic API (V2) =========

export const topicsApi = {
  // 获取 topic 列表
  list: (params = {}) => {
    const query = new URLSearchParams();
    if (params.with_count) query.set('with_count', 'true');
    if (params.titles_only) query.set('titles_only', 'true');
    return request(`/v2/topics?${query}`);
  },

  // 获取单个 topic
  get: (id) => request(`/v2/topics/${id}`),

  // 创建 topic
  create: (data) =>
    request('/v2/topics', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // 更新 topic
  update: (id, updates) =>
    request(`/v2/topics/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  // 删除 topic
  delete: (id) =>
    request(`/v2/topics/${id}`, {
      method: 'DELETE',
    }),
};

// ========= 文档 API (V2) =========

export const documentsApi = {
  // 获取文档列表
  list: (params = {}) => {
    const query = new URLSearchParams();
    if (params.topic_title) query.set('topic_title', params.topic_title);
    if (params.topic_id) query.set('topic_id', params.topic_id);
    return request(`/v2/documents?${query}`);
  },

  // 获取单个文档
  get: (id) => request(`/v2/documents/${id}`),

  // 创建空文档
  create: (data) =>
    request('/v2/documents', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // 从卡片生成文档
  createFromCards: (data) =>
    request('/v2/documents/from-cards', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // 更新文档
  update: (id, updates) =>
    request(`/v2/documents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  // 删除文档
  delete: (id) =>
    request(`/v2/documents/${id}`, {
      method: 'DELETE',
    }),
};

// ========= 信息源 API =========

export const sourcesApi = {
  // 获取信息源列表
  list: (params = {}) => {
    const query = new URLSearchParams();
    if (params.category) query.set('category', params.category);
    if (params.status) query.set('status', params.status);
    if (params.importance_level) query.set('importance_level', params.importance_level);
    return request(`/sources?${query}`);
  },

  // 获取单个信息源
  get: (id) => request(`/sources/${id}`),

  // 创建信息源
  create: (data) =>
    request('/sources', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // 更新信息源
  update: (id, updates) =>
    request(`/sources/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  // 删除信息源
  delete: (id) =>
    request(`/sources/${id}`, {
      method: 'DELETE',
    }),
};

// ========= 假设验证 API =========

export const hypothesesApi = {
  /**
   * AI 建议假设
   * @param {Object} params
   * @param {string} [params.topic_title] - 主题
   * @param {string[]} [params.card_ids] - 指定卡片 ID
   * @param {string[]} [params.questions] - 研究问题
   */
  suggest: (params = {}) =>
    request('/hypotheses/suggest', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  /**
   * 验证假设
   * @param {Object} params
   * @param {string} params.topic_title - 主题（必需）
   * @param {string[]} params.hypotheses - 假设列表（必需）
   * @param {string[]} [params.questions] - 研究问题
   */
  evaluate: (params) =>
    request('/hypotheses/evaluate', {
      method: 'POST',
      body: JSON.stringify(params),
    }),
};

// ========= Prompt 管理 API (V2) =========

export const promptsApi = {
  /**
   * 获取所有 prompt 配置
   * @returns {Promise<{ok: boolean, prompts: Array, metadata: Object}>}
   */
  list: () => request('/v2/prompts'),

  /**
   * 获取单个 prompt 详情
   * @param {string} id - prompt ID
   */
  get: (id) => request(`/v2/prompts/${id}`),

  /**
   * 更新 prompt 的 template
   * @param {string} id - prompt ID
   * @param {string} template - 新的 template 内容
   */
  update: (id, template) =>
    request(`/v2/prompts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ template }),
    }),

  /**
   * 重置 prompt 到默认值（删除用户自定义，恢复默认）
   * @param {string} id - prompt ID
   */
  reset: (id) =>
    request(`/v2/prompts/${id}`, {
      method: 'DELETE',
    }),
};

// ========= 用户设置 API =========

export const settingsApi = {
  /**
   * 获取用户设置
   */
  get: () => request('/v2/settings'),

  /**
   * 更新用户设置
   * @param {Object} settings - 设置对象
   */
  update: (settings) =>
    request('/v2/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    }),

  /**
   * 测试API连接
   * @param {Object} config - 测试配置
   */
  testApi: (config) =>
    request('/v2/settings/test-api', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  /**
   * 获取可用的提供商列表
   */
  getProviders: () => request('/v2/settings/providers'),

  /**
   * 获取指定提供商的模型列表
   * @param {string} provider - 提供商ID
   */
  getModels: (provider) => request(`/v2/settings/models/${provider}`),
};

// ========= 邀请码 API =========

export const invitesApi = {
  /**
   * 验证邀请码（公开接口）
   * @param {string} code - 邀请码
   */
  validate: (code) => {
    const token = getAccessToken();
    return fetch(`${API_BASE}/v2/invites/validate/${encodeURIComponent(code)}`, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(res => res.json());
  },

  /**
   * 获取邀请码列表（管理员）
   */
  list: (params = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);
    if (params.is_active !== undefined) query.set('is_active', params.is_active);
    return request(`/v2/invites?${query}`);
  },

  /**
   * 创建邀请码（管理员）
   * @param {Object} data - 邀请码数据
   */
  create: (data) =>
    request('/v2/invites', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * 更新邀请码（管理员）
   * @param {string} id - 邀请码ID
   * @param {Object} updates - 更新数据
   */
  update: (id, updates) =>
    request(`/v2/invites/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  /**
   * 删除邀请码（管理员）
   * @param {string} id - 邀请码ID
   */
  delete: (id) =>
    request(`/v2/invites/${id}`, {
      method: 'DELETE',
    }),
};

// ========= 思维画板 API =========

// ========= AI Board Analysis API (V2) =========

export const aiBoardsApi = {
  /**
   * Root Question Analysis (MECE Breakdown + Hypotheses)
   * @param {string} rootQuestion
   */
  analyzeRoot: (rootQuestion) =>
    request('/v2/ai/analyze_root', {
      method: 'POST',
      body: JSON.stringify({ root_question: rootQuestion }),
    }),

  /**
   * Evidence Verification
   * @param {string} hypothesis - Content of hypothesis
   * @param {string} cardContent - Content of card
   */
  verify: (hypothesis, cardContent) =>
    request('/v2/ai/verify', {
      method: 'POST',
      body: JSON.stringify({ hypothesis, card_content: cardContent }),
    }),
};

export const boardsApi = {
  // 获取画板列表
  list: () => request('/v2/boards'),

  // 获取单个画板（含节点和边）
  get: (id) => request(`/v2/boards/${id}`),

  // 获取或创建 Topic 关联的画板 (幂等)
  getTopicBoard: (topicId) => request(`/v2/topics/${topicId}/board`),


  // 创建画板
  create: (data) =>
    request('/v2/boards', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // 更新画板
  update: (id, updates) =>
    request(`/v2/boards/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  // 删除画板
  delete: (id) =>
    request(`/v2/boards/${id}`, {
      method: 'DELETE',
    }),

  // ========= 节点操作 =========

  // 获取画板节点
  listNodes: (boardId) => request(`/v2/boards/${boardId}/nodes`),

  // 创建节点
  createNode: (boardId, data) =>
    request(`/v2/boards/${boardId}/nodes`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // 更新节点
  updateNode: (boardId, nodeId, updates) =>
    request(`/v2/boards/${boardId}/nodes/${nodeId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  // 删除节点
  deleteNode: (boardId, nodeId) =>
    request(`/v2/boards/${boardId}/nodes/${nodeId}`, {
      method: 'DELETE',
    }),

  // ========= 边操作 =========

  // 获取画板边
  listEdges: (boardId) => request(`/v2/boards/${boardId}/edges`),

  // 创建边
  createEdge: (boardId, data) =>
    request(`/v2/boards/${boardId}/edges`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // 更新边
  updateEdge: (boardId, edgeId, updates) =>
    request(`/v2/boards/${boardId}/edges/${edgeId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  // 删除边
  deleteEdge: (boardId, edgeId) =>
    request(`/v2/boards/${boardId}/edges/${edgeId}`, {
      method: 'DELETE',
    }),
};

export { ApiError, API_BASE, getAccessToken };



