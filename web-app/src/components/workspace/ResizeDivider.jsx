import { useCallback, useRef } from 'react';

export default function ResizeDivider({
    containerRef,
    currentWidth,
    onResize,
    onDoubleClick,
    minWidth = 320,
    maxWidthPercent = 0.8,
}) {
    const dragging = useRef(false);

    const handleMouseDown = useCallback((e) => {
        e.preventDefault();
        dragging.current = true;

        const container = containerRef.current;
        if (!container) return;

        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        container.querySelectorAll(':scope > div').forEach(el => {
            el.style.pointerEvents = 'none';
        });

        const handleMouseMove = (moveEvent) => {
            if (!dragging.current) return;
            const containerRect = container.getBoundingClientRect();
            const maxWidth = containerRect.width * maxWidthPercent;
            const newWidth = Math.min(
                Math.max(moveEvent.clientX - containerRect.left, minWidth),
                maxWidth
            );
            onResize(newWidth);
        };

        const handleMouseUp = () => {
            dragging.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            container.querySelectorAll(':scope > div').forEach(el => {
                el.style.pointerEvents = '';
            });
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [containerRef, onResize, minWidth, maxWidthPercent]);

    return (
        <div
            className="h-full shrink-0 relative group"
            style={{ width: 4, cursor: 'col-resize' }}
            onMouseDown={handleMouseDown}
            onDoubleClick={onDoubleClick}
        >
            {/* Visual line */}
            <div
                className="absolute inset-y-0 left-1/2 -translate-x-1/2 transition-all"
                style={{
                    width: 2,
                    background: 'var(--stroke-0)',
                }}
            />
            {/* Hover/active highlight */}
            <div
                className="absolute inset-y-0 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{
                    width: 6,
                    background: 'var(--accent-400)',
                    boxShadow: '0 0 8px rgba(13,110,253,0.3)',
                }}
            />
        </div>
    );
}
