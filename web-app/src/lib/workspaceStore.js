// ========= Workspace Store — UI state for Topic Workspace =========
// Spec §10: unified workspaceStore for workspace UI state

import { create } from 'zustand';

export const useWorkspaceStore = create((set, get) => ({
    // Topic
    topicId: null,
    topicTitle: '',

    // Canvas
    activeView: 'structure', // 'structure' | 'document'

    // Reader
    readerOpen: false,
    readerMaterialId: null,

    // Board
    boardId: null,
    boardRefreshToken: 0,

    // Left Nav
    leftNavExpanded: false,

    // Actions
    setTopic: (topicId, topicTitle = '') => set({ topicId, topicTitle }),

    setActiveView: (view) => set({ activeView: view }),

    openReader: (materialId) => set({ readerOpen: true, readerMaterialId: materialId }),
    closeReader: () => set({ readerOpen: false, readerMaterialId: null }),

    setBoardId: (boardId) => set({ boardId }),
    refreshBoard: () => set((s) => ({ boardRefreshToken: s.boardRefreshToken + 1 })),

    toggleLeftNav: () => set((s) => ({ leftNavExpanded: !s.leftNavExpanded })),
    setLeftNavExpanded: (expanded) => set({ leftNavExpanded: expanded }),
    collapseLeftNav: () => set({ leftNavExpanded: false }),

    // Reset when leaving workspace
    reset: () => set({
        topicId: null,
        topicTitle: '',
        activeView: 'structure',
        readerOpen: false,
        readerMaterialId: null,
        boardId: null,
        boardRefreshToken: 0,
        leftNavExpanded: false,
    }),
}));
