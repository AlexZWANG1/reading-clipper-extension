/**
 * Tool names that modify state (create/update/delete).
 * Used to determine when to show JournalBlocks and confirmation cards.
 */
export const WRITE_TOOL_NAMES = new Set([
    'create_board_node', 'update_board_node', 'delete_board_node',
    'create_board_edge', 'delete_board_edge',
    'create_card', 'update_card', 'delete_card',
    'commit_draft', 'reject_draft',
    'create_hypothesis', 'update_hypothesis',
]);

export function isWriteOperation(toolName) {
    return WRITE_TOOL_NAMES.has(toolName);
}

export function shouldShowJournalBlock(message, autonomyLevel) {
    if (autonomyLevel === 'run') return true;
    if (autonomyLevel === 'agent') {
        return message.tool_calls?.some(tc => isWriteOperation(tc.name || tc.function?.name));
    }
    return false;
}

export const AUTONOMY_TO_MODE = {
    explore: 'chat',
    agent: 'agent',
    run: 'auto',
};

export const TOOL_ICONS = {
    read_material: '📖',
    create_board_node: '💡',
    create_board_edge: '🔗',
    create_card: '📋',
    delete_board_node: '🗑️',
    create_hypothesis: '💡',
    update_hypothesis: '✏️',
    search_cards: '🔍',
    search_materials: '🔍',
};

export function getToolIcon(toolName) {
    return TOOL_ICONS[toolName] || '⚙️';
}
