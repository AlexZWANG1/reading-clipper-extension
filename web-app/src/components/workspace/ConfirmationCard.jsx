import { useState } from 'react';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { getToolIcon } from '../../lib/chat-utils';

export default function ConfirmationCard({ toolName, title, details, parentInfo, onConfirm, onCancel }) {
    const [state, setState] = useState('pending');

    const handleConfirm = async () => {
        setState('confirming');
        try {
            await onConfirm?.();
            setState('confirmed');
        } catch {
            setState('pending');
        }
    };

    const handleCancel = () => {
        onCancel?.();
        setState('cancelled');
    };

    if (state === 'confirmed') {
        return (
            <div className="flex items-center gap-2 py-2 px-3 rounded-lg text-xs" style={{ background: 'rgba(24,160,106,0.08)', color: '#18A06A' }}>
                <CheckCircle size={14} />
                <span>已确认 — {title}</span>
            </div>
        );
    }

    if (state === 'cancelled') {
        return (
            <div className="flex items-center gap-2 py-2 px-3 rounded-lg text-xs" style={{ background: 'rgba(195,58,48,0.08)', color: '#C33A30' }}>
                <XCircle size={14} />
                <span>已取消 — {title}</span>
            </div>
        );
    }

    const icon = getToolIcon(toolName);

    return (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-1)', border: '1px solid var(--stroke-0)', borderLeft: '3px solid var(--accent-400)' }}>
            <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--stroke-0)' }}>
                <span className="text-sm">{icon}</span>
                <span className="text-xs font-medium" style={{ color: 'var(--text-0)' }}>{title}</span>
            </div>
            <div className="px-3 py-2.5">
                {details && (
                    <p className="text-xs mb-1.5" style={{ color: 'var(--text-1)' }}>{details}</p>
                )}
                {parentInfo && (
                    <p className="text-[10px]" style={{ color: 'var(--text-2)' }}>父节点: {parentInfo}</p>
                )}
            </div>
            <div className="flex items-center gap-2 px-3 py-2" style={{ borderTop: '1px solid var(--stroke-0)' }}>
                <button
                    onClick={handleConfirm}
                    disabled={state === 'confirming'}
                    className="px-3 py-1 text-xs rounded-lg disabled:opacity-50"
                    style={{ background: 'var(--accent-500)', color: '#fff' }}
                >
                    {state === 'confirming' ? <Loader2 size={12} className="animate-spin" /> : '确认'}
                </button>
                <button
                    onClick={handleCancel}
                    className="px-3 py-1 text-xs rounded-lg"
                    style={{ color: 'var(--text-2)' }}
                >
                    取消
                </button>
            </div>
        </div>
    );
}
