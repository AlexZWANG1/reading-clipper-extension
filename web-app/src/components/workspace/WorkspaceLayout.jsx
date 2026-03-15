// ========= WorkspaceLayout — Full-screen workspace shell =========
// Spec §12: Workspace Layout — no global sidebar, full-screen, ChatJournalPanel as fixed right column

import { Outlet } from 'react-router-dom';

export default function WorkspaceLayout() {
    return (
        <div className="h-screen w-screen overflow-hidden" style={{ background: 'var(--bg-0)' }}>
            <Outlet />
        </div>
    );
}
