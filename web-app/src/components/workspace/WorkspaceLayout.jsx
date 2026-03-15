// ========= Workspace Layout (Spec §12) =========
// Full-screen layout for Topic Workspace — no global sidebar.
// ChatJournalPanel as fixed right column, WorkspaceLeftNav on left.

import { Outlet } from 'react-router-dom';

export default function WorkspaceLayout() {
    return (
        <div className="h-screen w-screen overflow-hidden" style={{ background: 'var(--bg-0)' }}>
            <Outlet />
        </div>
    );
}
