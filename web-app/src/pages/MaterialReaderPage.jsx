// ========= Material Reader Page — Thin Wrapper (Spec §9) =========
// Delegates to WorkspaceReader in standalone (full-page) mode.

import { useParams, useNavigate } from 'react-router-dom';
import WorkspaceReader from '../components/workspace/WorkspaceReader';

export default function MaterialReaderPage() {
    const { id } = useParams();
    const navigate = useNavigate();

    return (
        <WorkspaceReader
            materialId={id}
            onClose={() => navigate('/materials')}
        />
    );
}
