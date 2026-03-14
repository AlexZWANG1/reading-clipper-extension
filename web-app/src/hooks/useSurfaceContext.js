import { useMatch, useLocation } from 'react-router-dom';

/**
 * Detects the current surface context from the route.
 * Used by GlobalChatPanel to tell the AI what page we're on.
 *
 * @returns {{ surface: string, topicId?: string, materialId?: string }}
 */
export function useSurfaceContext() {
  const boardMatch = useMatch('/topics/:topicId');
  const readerMatch = useMatch('/materials/:id');
  const location = useLocation();

  if (boardMatch) {
    return { surface: 'board', topicId: boardMatch.params.topicId };
  }
  if (readerMatch) {
    return { surface: 'reader', materialId: readerMatch.params.id };
  }
  if (location.pathname === '/' || location.pathname === '/materials') {
    return { surface: 'cards' };
  }
  return { surface: 'general' };
}
