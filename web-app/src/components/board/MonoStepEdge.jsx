// ========= MonoStepEdge — Shared custom edge for Board =========
// Extracted from ThinkingBoardPage + EmbeddedThinkBoard (Spec §4, §9)

import { getSmoothStepPath } from '@xyflow/react';

export default function MonoStepEdge({ id, sourceX, sourceY, targetX, targetY, style, markerEnd, data }) {
    const [path] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY });
    const glow = !!data?.isFocus;

    return (
        <>
            {/* hitbox (thick, transparent, clickable) */}
            <path d={path} fill="none" stroke="rgba(0,0,0,0)" strokeWidth={12} pointerEvents="stroke" />

            {/* visual (thin, colored) */}
            <path d={path} fill="none" strokeWidth={style?.strokeWidth || 1.6} stroke={style?.stroke} strokeDasharray={style?.strokeDasharray} markerEnd={markerEnd} />

            {/* glow (only focus chain) */}
            {glow && (
                <path
                    d={path}
                    fill="none"
                    stroke="var(--glow)"
                    strokeWidth={(style?.strokeWidth || 1.6) + 2}
                    strokeLinecap="round"
                    style={{ filter: 'drop-shadow(0 0 4px var(--glow))' }}
                />
            )}
        </>
    );
}
