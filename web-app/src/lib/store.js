// ========= 全局状态管理 =========

import { create } from 'zustand';
import { authApi, cardsApi, topicsApi, documentsApi, sourcesApi, tasksApi, rssApi, conversationsApi, chatApi } from './api';

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
      documents: state.documents.map((d) => ((d.doc_id || d.id) === id ? document : d)),
      currentDocument: (state.currentDocument?.doc_id || state.currentDocument?.id) === id
        ? document
        : state.currentDocument,
    }));
    return document;
  },

  // 删除文档
  deleteDocument: async (id) => {
    await documentsApi.delete(id);
    set((state) => ({
      documents: state.documents.filter((d) => (d.doc_id || d.id) !== id),
      currentDocument:
        (state.currentDocument?.doc_id || state.currentDocument?.id) === id
          ? null
          : state.currentDocument,
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

// ========= Tasks 状态 =========
export const useTasksStore = create((set, get) => ({
  tasks: [],
  currentTask: null,
  runs: [],
  proposals: [],
  loading: false,
  error: null,

  fetchTasks: async (params = {}) => {
    set({ loading: true, error: null });
    try {
      const { tasks } = await tasksApi.list(params);
      set({ tasks, loading: false });
    } catch (error) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  fetchTask: async (id) => {
    set({ loading: true, error: null });
    try {
      const { task, runs, proposals } = await tasksApi.get(id);
      set({ currentTask: task, runs, proposals, loading: false });
      return { task, runs, proposals };
    } catch (error) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  createTask: async (intent, topicId) => {
    const { task } = await tasksApi.create(intent, topicId);
    set((state) => ({ tasks: [task, ...state.tasks] }));
    return task;
  },

  updateTask: async (id, data) => {
    const { task } = await tasksApi.update(id, data);
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...task } : t)),
      currentTask: state.currentTask?.id === id ? { ...state.currentTask, ...task } : state.currentTask,
    }));
    return task;
  },

  deleteTask: async (id) => {
    await tasksApi.delete(id);
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
      currentTask: state.currentTask?.id === id ? null : state.currentTask,
    }));
  },

  triggerRun: async (id) => {
    await tasksApi.triggerRun(id);
  },

  fetchRuns: async (taskId) => {
    const { runs } = await tasksApi.listRuns(taskId);
    set({ runs });
    return runs;
  },

  fetchRun: async (taskId, runId) => {
    const { run } = await tasksApi.getRun(taskId, runId);
    return run;
  },

  approveProposal: async (id) => {
    await tasksApi.approveProposal(id);
    set((state) => ({
      proposals: state.proposals.filter((p) => p.id !== id),
    }));
  },

  rejectProposal: async (id) => {
    await tasksApi.rejectProposal(id);
    set((state) => ({
      proposals: state.proposals.filter((p) => p.id !== id),
    }));
  },

  clear: () => set({ tasks: [], currentTask: null, runs: [], proposals: [], loading: false, error: null }),
}));

// ========= RSS Store =========
export const useRssStore = create((set, get) => ({
  subscriptions: [],
  currentSubscription: null,
  items: [],
  loading: false,
  error: null,

  fetchSubscriptions: async (params = {}) => {
    set({ loading: true, error: null });
    try {
      const result = await rssApi.listSubscriptions(params);
      set({ subscriptions: result.subscriptions || [], loading: false });
      return result;
    } catch (error) {
      set({ loading: false, error: error.message });
      throw error;
    }
  },

  fetchSubscription: async (id) => {
    set({ loading: true, error: null });
    try {
      const result = await rssApi.getSubscription(id);
      set({ currentSubscription: result.subscription || null, loading: false });
      return result;
    } catch (error) {
      set({ loading: false, error: error.message });
      throw error;
    }
  },

  createSubscription: async (data) => {
    const result = await rssApi.createSubscription(data);
    await get().fetchSubscriptions();
    return result;
  },

  updateSubscription: async (id, data) => {
    const result = await rssApi.updateSubscription(id, data);
    await get().fetchSubscriptions();
    if (get().currentSubscription?.id === id) {
      set({ currentSubscription: result.subscription });
    }
    return result;
  },

  deleteSubscription: async (id) => {
    const result = await rssApi.deleteSubscription(id);
    set((state) => ({
      subscriptions: state.subscriptions.filter((s) => s.id !== id),
      currentSubscription: state.currentSubscription?.id === id ? null : state.currentSubscription,
    }));
    return result;
  },

  syncSubscription: async (id, data = {}) => {
    const result = await rssApi.syncSubscription(id, data);
    await get().fetchSubscriptions();
    return result;
  },

  fetchItems: async (subscriptionId, params = {}) => {
    set({ loading: true, error: null });
    try {
      const result = await rssApi.listItems(subscriptionId, params);
      set({
        items: result.items || [],
        currentSubscription: result.subscription || get().currentSubscription,
        loading: false,
      });
      return result;
    } catch (error) {
      set({ loading: false, error: error.message });
      throw error;
    }
  },

  updateItem: async (itemId, data) => {
    const result = await rssApi.updateItem(itemId, data);
    set((state) => ({
      items: state.items.map((item) => (item.id === itemId ? result.item : item)),
    }));
    return result;
  },

  importItemToMaterials: async (itemId, data = {}) => {
    const result = await rssApi.importItemToMaterials(itemId, data);
    if (result.item) {
      set((state) => ({
        items: state.items.map((item) => (item.id === itemId ? result.item : item)),
      }));
    }
    return result;
  },

  clear: () => set({
    subscriptions: [],
    currentSubscription: null,
    items: [],
    loading: false,
    error: null,
  }),
}));

// ========= Conversations 状态 =========
export const useConversationsStore = create((set, get) => ({
  conversations: [],
  loading: false,
  error: null,

  fetchConversations: async () => {
    set({ loading: true, error: null });
    try {
      const { conversations } = await conversationsApi.list();
      set({ conversations, loading: false });
    } catch (error) {
      set({ error: error.message, loading: false });
    }
  },

  createConversation: async (title) => {
    const { conversation } = await conversationsApi.create(title);
    set((state) => ({ conversations: [conversation, ...state.conversations] }));
    return conversation;
  },

  updateConversation: async (id, data) => {
    const { conversation } = await conversationsApi.update(id, data);
    set((state) => ({
      conversations: state.conversations.map((c) => (c.id === id ? { ...c, ...conversation } : c)),
    }));
    return conversation;
  },

  deleteConversation: async (id) => {
    await conversationsApi.delete(id);
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== id),
    }));
  },

  // Push a conversation to the top of the list (after activity)
  touchConversation: (id, updates = {}) => {
    set((state) => {
      const conv = state.conversations.find((c) => c.id === id);
      if (!conv) return state;
      const updated = { ...conv, ...updates, updated_at: new Date().toISOString() };
      return {
        conversations: [updated, ...state.conversations.filter((c) => c.id !== id)],
      };
    });
  },

  clear: () => set({ conversations: [], loading: false, error: null }),
}));

// ========= Chat 状态 =========
export const useChatStore = create((set, get) => ({
  conversationId: null,
  messages: [],       // UI messages (rendered in chat)
  sending: false,
  activePlan: null,   // { planSpec, planDisplay, suggestedTopicId } when plan proposed
  executing: false,   // true while plan is executing
  templates: [],
  surfaceContext: null,
  mode: localStorage.getItem('verity-chat-mode') || 'auto',
  boardId: null,
  boardInvalidateCounter: 0,

  // Set current conversation and load its messages
  loadConversation: async (conversationId) => {
    if (!conversationId) {
      set({ conversationId: null, messages: [], activePlan: null, executing: false });
      return;
    }
    try {
      const { messages } = await conversationsApi.get(conversationId);
      // Check if there's a pending plan proposal in messages
      const planMsg = messages?.findLast?.((m) => m.message_type === 'plan_proposal');
      let activePlan = null;
      if (planMsg?.metadata?.plan_spec) {
        // Check if plan was already confirmed/executed
        const confirmed = messages?.some((m) =>
          m.message_type === 'plan_confirmed' && new Date(m.created_at) > new Date(planMsg.created_at)
        );
        if (!confirmed) {
          activePlan = {
            planSpec: planMsg.metadata.plan_spec,
            planDisplay: planMsg.metadata.plan_display,
            suggestedTopicId: planMsg.metadata.suggested_topic_id,
          };
        }
      }
      set({ conversationId, messages: messages || [], activePlan, executing: false });
    } catch {
      set({ conversationId, messages: [], activePlan: null });
    }
  },

  // Start a new empty conversation
  newConversation: () => {
    set({ conversationId: null, messages: [], activePlan: null, executing: false });
  },

  // Send a message
  sendMessage: async (text) => {
    const { conversationId } = get();
    set({ sending: true });

    // Optimistically add user message
    const tempUserMsg = { id: `temp-${Date.now()}`, role: 'user', content: text, message_type: 'text', created_at: new Date().toISOString() };
    set((state) => ({ messages: [...state.messages, tempUserMsg] }));

    try {
      const result = await chatApi.sendMessage(conversationId, text, {
        surfaceContext: get().surfaceContext,
        mode: get().mode,
      });
      const newConvId = result.conversation_id;

      // Inject tool call log as a visible message (if any)
      const toolLog = result.tool_call_log || [];
      if (toolLog.length > 0) {
        const toolLogMsg = {
          id: `tools-${Date.now()}`,
          role: 'assistant',
          content: toolLog.map((tc) => `🔧 **${tc.tool}** → ${tc.result_summary}`).join('\n'),
          message_type: 'tool_calls',
          metadata: { tool_calls: toolLog },
          created_at: new Date().toISOString(),
        };
        set((state) => ({ messages: [...state.messages, toolLogMsg] }));
      }

      // Skip pushing empty assistant message when pendingActions are returned
      // (the confirmation UI will handle display instead)
      if (result.pendingActions?.length > 0) {
        set({
          conversationId: newConvId,
          sending: false,
        });
      } else {
        // Build assistant message
        const assistantMsg = {
          id: `resp-${Date.now()}`,
          role: 'assistant',
          content: result.reply,
          message_type: result.message_type || 'text',
          metadata: {},
          created_at: new Date().toISOString(),
        };

        if (result.plan) {
          assistantMsg.metadata = {
            plan_spec: result.plan.planSpec,
            plan_display: result.plan.planDisplay,
            suggested_topic_id: result.plan.suggestedTopicId,
          };
          set({
            conversationId: newConvId,
            activePlan: result.plan,
            sending: false,
          });
        } else {
          set({
            conversationId: newConvId,
            activePlan: null,
            sending: false,
          });
        }

        set((state) => ({ messages: [...state.messages, assistantMsg] }));
      }

      // Update conversations list
      const { touchConversation } = useConversationsStore.getState();
      touchConversation(newConvId, { title: result.reply?.slice(0, 30) });

      return result;
    } catch (error) {
      // Remove optimistic message on failure
      set((state) => ({
        messages: state.messages.filter((m) => m.id !== tempUserMsg.id),
        sending: false,
      }));
      throw error;
    }
  },

  // Execute a confirmed plan
  executePlan: async (topicId) => {
    const { conversationId, activePlan } = get();
    if (!conversationId || !activePlan) return;

    set({ executing: true });

    try {
      const result = await chatApi.executePlan(
        conversationId,
        activePlan.planSpec,
        activePlan.planDisplay,
        topicId
      );

      // Add confirmation message
      const confirmMsg = {
        id: `confirm-${Date.now()}`,
        role: 'user',
        content: '确认执行计划',
        message_type: 'plan_confirmed',
        created_at: new Date().toISOString(),
      };
      set((state) => ({
        messages: [...state.messages, confirmMsg],
        activePlan: null,
      }));

      // Start polling for step progress
      get().pollForProgress();

      return result;
    } catch (error) {
      set({ executing: false });
      throw error;
    }
  },

  // Dismiss a plan proposal without executing
  dismissPlan: () => {
    set({ activePlan: null });
  },

  // Poll for new messages (step progress during execution)
  pollForProgress: () => {
    const { conversationId } = get();
    if (!conversationId) return;

    const poll = setInterval(async () => {
      try {
        const { messages } = await conversationsApi.get(conversationId);
        const currentMsgs = get().messages;
        if (messages && messages.length > currentMsgs.length) {
          set({ messages });
          // Check if execution completed
          const hasComplete = messages.some((m) => m.message_type === 'plan_complete');
          if (hasComplete) {
            clearInterval(poll);
            set({ executing: false });
          }
        }
      } catch {
        // ignore polling errors
      }
    }, 3000);

    // Stop polling after 10 minutes
    setTimeout(() => {
      clearInterval(poll);
      set({ executing: false });
    }, 600000);
  },

  // Load templates
  fetchTemplates: async () => {
    try {
      const { templates } = await chatApi.getTemplates();
      set({ templates: templates || [] });
    } catch {
      // non-fatal
    }
  },

  setSurfaceContext: (ctx) => set({ surfaceContext: ctx }),

  setMode: (mode) => {
    localStorage.setItem('verity-chat-mode', mode);
    set({ mode });
  },

  setBoardId: (id) => set({ boardId: id }),

  invalidateBoard: () => set((s) => ({ boardInvalidateCounter: s.boardInvalidateCounter + 1 })),

  clear: () => set({
    conversationId: null,
    messages: [],
    sending: false,
    activePlan: null,
    executing: false,
    surfaceContext: null,
  }),
}));

// ========= Workspace 状态 (Spec §10) =========
export const useWorkspaceStore = create((set, get) => ({
  // Topic
  topicId: null,
  boardId: null,

  // Canvas
  activeView: 'structure', // 'structure' | 'document'

  // Reader
  readerOpen: false,
  readerMaterialId: null,
  readerWidth: null,        // px integer, null = compute 40% on first open
  readerScrollLocator: null, // { exact, prefix, suffix, chunk_id } or null

  // Board refresh
  boardRefreshToken: 0,

  // Board animation
  layoutMode: 'dagre',         // 'dagre' | 'incremental'
  boardNodeAdder: null,         // callback set by BoardCanvas

  // Left Nav
  leftNavExpanded: false,

  // Actions
  enterWorkspace: (topicId) => set({
    topicId,
    activeView: 'structure',
    readerOpen: false,
    readerMaterialId: null,
    leftNavExpanded: false,
  }),

  leaveWorkspace: () => set({
    topicId: null,
    boardId: null,
    activeView: 'structure',
    readerOpen: false,
    readerMaterialId: null,
    readerWidth: null,
    readerScrollLocator: null,
    layoutMode: 'dagre',
    boardNodeAdder: null,
    leftNavExpanded: false,
  }),

  setBoardId: (boardId) => set({ boardId }),
  setActiveView: (view) => set({ activeView: view }),

  openReader: (materialId) => set({ readerOpen: true, readerMaterialId: materialId }),
  closeReader: () => set({ readerOpen: false, readerMaterialId: null, readerScrollLocator: null }),

  setReaderWidth: (w) => set({ readerWidth: w }),
  initReaderWidth: (containerWidth) => {
    if (!get().readerWidth) set({ readerWidth: Math.round(containerWidth * 0.4) });
  },

  openReaderAtQuote: (materialId, locator) => set({
    readerOpen: true,
    readerMaterialId: materialId,
    readerScrollLocator: locator || null,
  }),
  clearReaderScrollLocator: () => set({ readerScrollLocator: null }),

  setLayoutMode: (mode) => set({ layoutMode: mode }),
  setBoardNodeAdder: (fn) => set({ boardNodeAdder: fn }),
  addBoardNode: (nodeData) => {
    const { boardNodeAdder } = get();
    if (boardNodeAdder) boardNodeAdder(nodeData);
  },

  toggleLeftNav: () => set((s) => ({ leftNavExpanded: !s.leftNavExpanded })),
  setLeftNavExpanded: (expanded) => set({ leftNavExpanded: expanded }),

  invalidateBoard: () => set((s) => ({ boardRefreshToken: s.boardRefreshToken + 1 })),
}));

// ========= UI 状态 =========
export const useUIStore = create((set) => ({
  sidebarOpen: typeof window === 'undefined' ? true : window.innerWidth >= 1024,
  toast: null,

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  showToast: (message, type = 'info') => {
    set({ toast: { message, type } });
    setTimeout(() => set({ toast: null }), 3000);
  },

  hideToast: () => set({ toast: null }),
}));

