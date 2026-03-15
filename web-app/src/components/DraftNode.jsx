import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Check, X } from 'lucide-react';
import AnimatedNodeWrapper from './board/AnimatedNodeWrapper';

const DraftNode = memo(({ data, id }) => {
  const [hovered, setHovered] = useState(false);
  const { text, node_type, onAccept, onReject, animationState, onAnimationEnd } = data;

  const typeLabels = {
    question: 'Q',
    hypothesis: 'H',
    evidence: 'E',
  };

  return (
    <AnimatedNodeWrapper animationState={animationState} onAnimationEnd={onAnimationEnd}>
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={() => setHovered(true)}
      className="relative px-3 py-2 rounded-lg min-w-[180px] max-w-[260px] draft-node-container"
      style={{
        border: '2px dashed var(--ai-accent)',
        backgroundColor: 'var(--ai-accent-subtle, rgba(139, 92, 246, 0.08))',
        opacity: 0.85,
      }}
    >
      {/* AI badge */}
      <span
        className="absolute -top-2 -right-2 text-[9px] text-white px-1.5 py-0.5 rounded-full font-medium"
        style={{ background: 'var(--ai-accent)' }}
      >
        AI
      </span>

      {/* Type label */}
      <div className="text-[10px] font-semibold mb-1" style={{ color: 'var(--ai-accent)' }}>
        {typeLabels[node_type] || node_type}
      </div>

      {/* Content */}
      <p className="text-xs line-clamp-3" style={{ color: 'var(--text-primary)' }}>{text}</p>

      {/* Accept/Reject on hover or touch */}
      {hovered && (
        <div className="absolute -bottom-3 right-2 flex gap-1">
          <button
            onClick={() => onAccept?.(id)}
            className="p-1 text-white rounded-full shadow transition-colors"
            style={{ background: 'var(--success)' }}
            title="接受"
          >
            <Check size={10} />
          </button>
          <button
            onClick={() => onReject?.(id)}
            className="p-1 text-white rounded-full shadow transition-colors"
            style={{ background: 'var(--error)' }}
            title="拒绝"
          >
            <X size={10} />
          </button>
        </div>
      )}

      <Handle type="target" position={Position.Top} style={{ background: 'var(--ai-accent)' }} />
      <Handle type="source" position={Position.Bottom} style={{ background: 'var(--ai-accent)' }} />
    </div>
    </AnimatedNodeWrapper>
  );
});

DraftNode.displayName = 'DraftNode';

export default DraftNode;
