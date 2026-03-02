import { useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';

function CanvasPlaceholder({
  width = 400,
  onWidthChange,
  isOpen = true,
  onToggle,
  className = ''
}) {
  const [isResizing, setIsResizing] = useState(false);

  // 拖拽调整宽度
  const handleResizeStart = (e) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (e) => {
      const delta = startX - e.clientX; // 注意：右侧栏是反向的
      const newWidth = Math.max(300, Math.min(600, startWidth + delta));
      onWidthChange?.(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // 折叠状态：显示垂直标签
  if (!isOpen) {
    return (
      <div
        className={`flex items-center justify-center ${className}`}
        style={{
          width: '48px',
          background: 'var(--surface-1)',
          borderLeft: '1px solid var(--stroke-0)'
        }}
      >
        <button
          onClick={() => onToggle?.(true)}
          className="p-2 rounded-lg transition-colors hover:bg-opacity-80"
          style={{ background: 'var(--surface-0)' }}
          title="展开画布"
        >
          <ChevronLeft className="w-5 h-5" style={{ color: 'var(--text-1)' }} />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`relative flex flex-col h-full shrink-0 ${className}`}
      style={{
        width: `${width}px`,
        background: 'var(--surface-1)',
        borderLeft: '1px solid var(--stroke-0)'
      }}
    >
      {/* 顶部：标题和折叠按钮 */}
      <div
        className="flex items-center justify-between p-4 border-b"
        style={{ borderColor: 'var(--stroke-0)' }}
      >
        <div className="flex items-center gap-2">
          <Maximize2 className="w-5 h-5" style={{ color: 'var(--text-1)' }} />
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-0)' }}>
            画布
          </h2>
        </div>
        <button
          onClick={() => onToggle?.(false)}
          className="p-1.5 rounded-lg transition-colors hover:bg-opacity-80"
          style={{ background: 'var(--surface-0)' }}
          title="折叠画布"
        >
          <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-1)' }} />
        </button>
      </div>

      {/* 主内容区：占位内容 */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <div
            className="w-20 h-20 mx-auto mb-4 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--bg-0)' }}
          >
            <Maximize2 className="w-10 h-10" style={{ color: 'var(--text-2)' }} />
          </div>
          <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-0)' }}>
            画布功能开发中
          </h3>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>
            未来这里将接入思维画板功能，支持可视化组织和连接你的知识卡片。
          </p>
        </div>
      </div>

      {/* 拖拽调整宽度的手柄 */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-opacity-50 transition-colors"
        style={{
          background: isResizing ? 'var(--accent-500)' : 'transparent'
        }}
        onMouseDown={handleResizeStart}
      />
    </div>
  );
}

export default CanvasPlaceholder;
