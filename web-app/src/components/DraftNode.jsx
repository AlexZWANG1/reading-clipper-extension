import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Check, X, HelpCircle, Lightbulb, FileText } from 'lucide-react';
import AnimatedNodeWrapper from './board/AnimatedNodeWrapper';

/**
 * Type-specific draft styling — mimics the real node's visual language
 * so users can preview what the node will look like before accepting.
 */
const TYPE_CONFIG = {
  question: {
    icon: HelpCircle,
    label: 'Q',
    labelFull: '问题',
    borderColor: 'rgba(47, 128, 255, 0.55)',
    accentColor: 'var(--workbench-blue-ink, #2563eb)',
    bgColor: 'rgba(47, 128, 255, 0.04)',
    borderTopColor: 'rgba(47, 128, 255, 0.48)',
  },
  hypothesis: {
    icon: Lightbulb,
    label: 'H',
    labelFull: '假说',
    borderColor: 'rgba(47, 128, 255, 0.55)',
    accentColor: 'var(--workbench-blue-ink, #2563eb)',
    bgColor: 'rgba(47, 128, 255, 0.04)',
    borderTopColor: 'transparent',
    borderLeftColor: 'rgba(47, 128, 255, 0.48)',
  },
  evidence: {
    icon: FileText,
    label: 'E',
    labelFull: '证据',
    borderColor: 'rgba(31, 157, 103, 0.55)',
    accentColor: 'var(--workbench-green, #059669)',
    bgColor: 'rgba(31, 157, 103, 0.04)',
    borderTopColor: 'transparent',
    borderLeftColor: 'rgba(31, 157, 103, 0.48)',
  },
};

const DraftNode = memo(({ data, id }) => {
  const { text, node_type, onAccept, onReject, animationState, onAnimationEnd } = data;
  const config = TYPE_CONFIG[node_type] || TYPE_CONFIG.question;
  const Icon = config.icon;

  return (
    <AnimatedNodeWrapper animationState={animationState} onAnimationEnd={onAnimationEnd}>
      <div
        className="relative px-3 py-2.5 rounded-xl min-w-[200px] max-w-[280px] draft-node-container"
        style={{
          border: `2px dashed ${config.borderColor}`,
          borderTop: node_type === 'question' ? `2.5px dashed ${config.borderTopColor}` : undefined,
          borderLeft: node_type !== 'question' ? `2.5px dashed ${config.borderLeftColor || config.borderColor}` : undefined,
          backgroundColor: config.bgColor,
          backdropFilter: 'blur(4px)',
        }}
      >
        {/* AI badge — top right */}
        <span
          className="absolute -top-2.5 -right-2.5 text-[9px] text-white px-1.5 py-0.5 rounded-full font-semibold shadow-sm"
          style={{ background: 'var(--ai-accent, #8b5cf6)' }}
        >
          AI
        </span>

        {/* Header: type icon + label */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <Icon size={12} style={{ color: config.accentColor }} strokeWidth={2.5} />
          <span className="text-[10px] font-bold tracking-wide" style={{ color: config.accentColor }}>
            {config.labelFull}
          </span>
        </div>

        {/* Content */}
        <p className="text-[12px] leading-[1.45] line-clamp-3" style={{ color: 'var(--workbench-text, #1e1a12)' }}>
          {text || '(无内容)'}
        </p>

        {/* Always-visible accept/reject — no hover dependency */}
        <div className="flex items-center justify-end gap-1.5 mt-2 pt-1.5" style={{ borderTop: `1px dashed ${config.borderColor}` }}>
          <button
            onClick={() => onReject?.(id)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors"
            style={{
              color: 'var(--workbench-red, #dc2626)',
              background: 'rgba(195, 74, 60, 0.08)',
              border: '1px solid rgba(195, 74, 60, 0.2)',
            }}
            title="拒绝"
            aria-label="拒绝此更改"
          >
            <X size={10} /> 拒绝
          </button>
          <button
            onClick={() => onAccept?.(id)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors"
            style={{
              color: 'var(--workbench-green, #059669)',
              background: 'rgba(31, 157, 103, 0.08)',
              border: '1px solid rgba(31, 157, 103, 0.2)',
            }}
            title="接受"
            aria-label="接受此更改"
          >
            <Check size={10} /> 接受
          </button>
        </div>

        <Handle type="target" position={Position.Top} style={{ background: config.accentColor, opacity: 0.6 }} />
        <Handle type="source" position={Position.Bottom} style={{ background: config.accentColor, opacity: 0.6 }} />
      </div>
    </AnimatedNodeWrapper>
  );
});

DraftNode.displayName = 'DraftNode';

export default DraftNode;
