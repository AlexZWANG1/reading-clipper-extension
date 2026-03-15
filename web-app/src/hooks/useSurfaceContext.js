import { useMatch, useLocation } from 'react-router-dom';
import { useWorkspaceStore } from '../lib/store';

/**
 * Detects the current surface context from the route + workspace state.
 * Used by GlobalChatPanel / ChatJournalPanel to tell the AI what context we're in.
 *
 * In workspace mode (Spec §10): reads from workspaceStore for richer context.
 * In management mode: falls back to route-based detection.
 *
 * @returns {{ surface: string, topicId?: string, materialId?: string, boardId?: string, activeView?: string, readerOpen?: boolean, readerMaterialId?: string }}
 */
export function useSurfaceContext() {
  const workspaceMatch = useMatch('/topics/:topicId');
  const readerMatch = useMatch('/materials/:id');
  const location = useLocation();

  const {
    topicId: wsTopicId,
    boardId,
    activeView,
    readerOpen,
    readerMaterialId,
  } = useWorkspaceStore();

  // Workspace mode — richer context from workspaceStore
  if (workspaceMatch) {
    return {
      surface: 'workspace',
      topicId: wsTopicId || workspaceMatch.params.topicId,
      boardId,
      activeView,
      readerOpen,
      readerMaterialId,
    };
  }

  // Management mode — route-based detection (existing behavior)
  if (readerMatch) {
    return { surface: 'reader', materialId: readerMatch.params.id };
  }
  if (location.pathname === '/' || location.pathname === '/materials') {
    return { surface: 'cards' };
  }
  return { surface: 'general' };
}
