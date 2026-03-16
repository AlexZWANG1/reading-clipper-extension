import { useEffect, useRef } from 'react';

/**
 * Wraps board nodes with animation lifecycle support.
 * Reads data.animationState: 'entering' | 'active' | 'rejecting' | 'committing' | null
 */
export default function AnimatedNodeWrapper({ animationState, onAnimationEnd, children }) {
    const ref = useRef(null);

    useEffect(() => {
        if (!animationState || !ref.current) return;

        if (animationState === 'entering') {
            const timer = setTimeout(() => onAnimationEnd?.('entered'), 200);
            return () => clearTimeout(timer);
        }
        if (animationState === 'rejecting') {
            const timer = setTimeout(() => onAnimationEnd?.('rejected'), 300);
            return () => clearTimeout(timer);
        }
        if (animationState === 'committing') {
            const timer = setTimeout(() => onAnimationEnd?.('committed'), 500);
            return () => clearTimeout(timer);
        }
    }, [animationState, onAnimationEnd]);

    const className = animationState === 'entering' ? 'node-entering'
        : animationState === 'rejecting' ? 'node-rejecting'
        : animationState === 'active' ? 'node-pulse'
        : animationState === 'committing' ? 'node-committing'
        : '';

    return (
        <div ref={ref} className={className}>
            {children}
        </div>
    );
}
