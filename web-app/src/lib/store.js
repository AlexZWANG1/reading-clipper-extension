// ========= 全局状态管理 =========

import { create } from 'zustand';
import { authApi, cardsApi, topicsApi, documentsApi, sourcesApi } from './api';

// ========= 认证状态 =========
export const useAuthStore = create((set, get) => ({
  user: null,
  session: null,
  loading: true,

  // 初始化（从 localStorage 恢复）
  init: async () => {
    const sessionStr = localStorage.getItem('session');
    if (sessionStr) {
      try {
        const session = JSON.parse(sessionStr);
        set({ session });

        // 验证 session 是否有效
        const { user } = await authApi.me();
        set({ user, loading: false });
      } catch (error) {
        // session 无效，清除
        localStorage.removeItem('session');
        set({ user: null, session: null, loading: false });
      }
    } else {
      set({ loading: false });
    }
  },

  // 登录
  login: async (email, password) => {
    const response = await authApi.login(email, password);
    const { user, session } = response;

    localStorage.setItem('session', JSON.stringify(session));
    set({ user, session });

    return response;
  },

  // 注册
  register: async (email, password, name, inviteCode) => {
    const response = await authApi.register(email, password, name, inviteCode);
    return response;
  },

  // 登出
  logout: () => {
    localStorage.removeItem('session');
    set({ user: null, session: null });
  },

  // 检查是否已登录
  isAuthenticated: () => !!get().session?.access_token,
}));

// ========= 卡片状态 =========
export const useCardsStore = create((set, get) => ({
  cards: [],
  loading: false,
  error: null,
  currentTopicId: null,

  // 获取卡片列表
  fetchCards: async (params = {}) => {
    set({ loading: true, error: null });
    try {
      const { cards } = await cardsApi.list(params);
      set({ cards, loading: false, currentTopicId: params.topic_id || null });
    } catch (error) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  // 搜索卡片
  searchCards: async (query, options = {}) => {
    set({ loading: true, error: null });
    try {
      const { cards } = await cardsApi.search(query, options);
      set({ cards, loading: false });
      return cards;
    } catch (error) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  // 添加卡片
  addCard: async (cardData) => {
    const { card } = await cardsApi.capture(cardData);
    set((state) => ({ cards: [card, ...state.cards] }));
    return card;
  },

  // 更新卡片
  updateCard: async (id, updates) => {
    const { card } = await cardsApi.update(id, updates);
    set((state) => ({
      cards: state.cards.map((c) => (c.id === id ? card : c)),
    }));
    return card;
  },

  // 删除卡片
  deleteCard: async (id) => {
    await cardsApi.delete(id);
    set((state) => ({
      cards: state.cards.filter((c) => c.id !== id),
    }));
  },

  // 清空状态
  clear: () => set({ cards: [], loading: false, error: null }),
}));

// ========= Topic 状态 =========
export const useTopicsStore = create((set, get) => ({
  topics: [],
  loading: false,
  error: null,

  // 获取 topic 列表
  fetchTopics: async (withCount = true) => {
    set({ loading: true, error: null });
    try {
      const { topics } = await topicsApi.list({ with_count: withCount });
      set({ topics, loading: false });
    } catch (error) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  // 创建 topic
  createTopic: async (data) => {
    const { topic } = await topicsApi.create(data);
    set((state) => ({ topics: [...state.topics, { ...topic, card_count: 0 }] }));
    return topic;
  },

  // 更新 topic
  updateTopic: async (id, updates) => {
    const { topic } = await topicsApi.update(id, updates);
    set((state) => ({
      topics: state.topics.map((t) => (t.id === id ? { ...t, ...topic } : t)),
    }));
    return topic;
  },

  // 删除 topic
  deleteTopic: async (id) => {
    await topicsApi.delete(id);
    set((state) => ({
      topics: state.topics.filter((t) => t.id !== id),
    }));
  },

  // 清空状态
  clear: () => set({ topics: [], loading: false, error: null }),
}));

// ========= 文档状态 =========
export const useDocumentsStore = create((set, get) => ({
  documents: [],
  currentDocument: null,
  loading: false,
  error: null,

  // 获取文档列表
  fetchDocuments: async (params = {}) => {
    set({ loading: true, error: null });
    try {
      const { documents } = await documentsApi.list(params);
      set({ documents, loading: false });
    } catch (error) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  // 获取单个文档
  fetchDocument: async (id) => {
    set({ loading: true, error: null });
    try {
      const { document } = await documentsApi.get(id);
      set({ currentDocument: document, loading: false });
      return document;
    } catch (error) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  // 创建文档
  createDocument: async (data) => {
    const { document } = await documentsApi.create(data);
    set((state) => ({ documents: [document, ...state.documents] }));
    return document;
  },

  // 从卡片创建文档
  createFromCards: async (data) => {
    const { document } = await documentsApi.createFromCards(data);
    set((state) => ({ documents: [document, ...state.documents] }));
    return document;
  },

  // 更新文档
  updateDocument: async (id, updates) => {
    const { document } = await documentsApi.update(id, updates);
    set((state) => ({
      documents: state.documents.map((d) => (d.doc_id === id ? document : d)),
      currentDocument: state.currentDocument?.doc_id === id ? document : state.currentDocument,
    }));
    return document;
  },

  // 删除文档
  deleteDocument: async (id) => {
    await documentsApi.delete(id);
    set((state) => ({
      documents: state.documents.filter((d) => d.doc_id !== id),
      currentDocument: state.currentDocument?.doc_id === id ? null : state.currentDocument,
    }));
  },

  // 清空状态
  clear: () => set({ documents: [], currentDocument: null, loading: false, error: null }),
}));

// ========= Sources 状态 =========
export const useSourcesStore = create((set, get) => ({
  sources: [],
  loading: false,
  error: null,

  // 获取信息源列表
  fetchSources: async (params = {}) => {
    set({ loading: true, error: null });
    try {
      const { sources } = await sourcesApi.list(params);
      set({ sources: sources || [], loading: false });
    } catch (error) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  // 创建信息源
  createSource: async (data) => {
    const { source } = await sourcesApi.create(data);
    set((state) => ({ sources: [...state.sources, source] }));
    return source;
  },

  // 更新信息源
  updateSource: async (id, updates) => {
    const { source } = await sourcesApi.update(id, updates);
    set((state) => ({
      sources: state.sources.map((s) =>
        s.id === id ? source : s
      ),
    }));
    return source;
  },

  // 删除信息源
  deleteSource: async (id) => {
    await sourcesApi.delete(id);
    set((state) => ({
      sources: state.sources.filter((s) => s.id !== id),
    }));
  },

  // 清空状态
  clear: () => set({ sources: [], loading: false, error: null }),
}));

// ========= UI 状态 =========
export const useUIStore = create((set) => ({
  sidebarOpen: true,
  toast: null,

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  showToast: (message, type = 'info') => {
    set({ toast: { message, type } });
    setTimeout(() => set({ toast: null }), 3000);
  },

  hideToast: () => set({ toast: null }),
}));



