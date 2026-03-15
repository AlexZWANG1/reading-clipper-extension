import { useEffect, useRef, useState } from 'react';
import { getSmoothStepPath } from '@xyflow/react';

export default function MonoStepEdge({ id, sourceX, sourceY, targetX, targetY, style, markerEnd, data }) {
    const [edgePath] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, borderRadius: 12 });
    const isFocus = data?.isFocus;
    const animated = data?.animated;
    const onAnimationComplete = data?.onAnimationComplete;

    const pathRef = useRef(null);
    const [pathLength, setPathLength] = useState(0);
    const [animating, setAnimating] = useState(false);

    // Calculate path length for draw animation
    useEffect(() => {
        if (animated && pathRef.current) {
            const length = pathRef.current.getTotalLength();
            setPathLength(length);
            setAnimating(true);
            // Trigger animation on next frame
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setAnimating(false);
                });
            });
            // Clear animated flag after animation completes
            const timer = setTimeout(() => {
                onAnimationComplete?.(id);
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [animated, edgePath, id, onAnimationComplete]);

    return (
        <g>
            {/* Hitbox */}
            <path d={edgePath} fill="none" stroke="transparent" strokeWidth={20} />
            {/* Visual stroke */}
            <path
                ref={pathRef}
                d={edgePath}
                fill="none"
                stroke={style?.stroke || 'var(--stroke-1)'}
                strokeWidth={style?.strokeWidth || 1.5}
                strokeDasharray={animated ? (pathLength || 1000) : (style?.strokeDasharray || 'none')}
                strokeDashoffset={animated && animating ? (pathLength || 1000) : 0}
                style={{
                    transition: animated ? 'stroke-dashoffset 300ms ease-out' : 'none',
                    opacity: style?.opacity ?? 1,
                }}
                markerEnd={markerEnd}
            />
            {/* Focus glow */}
            {isFocus && (
                <path
                    d={edgePath}
                    fill="none"
                    stroke={style?.stroke || '#0D6EFD'}
                    strokeWidth={(style?.strokeWidth || 1.5) + 6}
                    strokeOpacity={0.15}
                    style={{ filter: 'blur(4px)' }}
                />
            )}
        </g>
    );
}
