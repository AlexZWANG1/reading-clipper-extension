import { useEffect, useRef, useState } from 'react';
import { Highlighter, FileText, X } from 'lucide-react';

/**
 * SelectionPopover — 选中文本后浮出的操作工具条
 * Props:
 *   selection: { exact, prefix, suffix, chunk_id, chunk_relative_start, chunk_relative_end, rect } | null
 *   onHighlight: fn(selectionData) — 创建纯高亮
 *   onCreateCard: fn(selectionData) — 创建卡片
 *   onClose: fn()
 */
export default function SelectionPopover({ selection, onHighlight, onCreateCard, onClose }) {
  const popoverRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!selection?.rect) return;

    const { rect } = selection;
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;

    // 显示在选区正上方
    setPos({
      top: rect.top + scrollY - 48,
      left: rect.left + scrollX + rect.width / 2,
    });
  }, [selection]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose?.();
      }
    };
    if (selection) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selection, onClose]);

  if (!selection) return null;

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 flex items-center gap-1 bg-gray-900 text-white rounded-lg shadow-xl px-2 py-1.5"
      style={{
        top: pos.top,
        left: pos.left,
        transform: 'translateX(-50%)',
      }}
    >
      {/* 三角形指示 */}
      <div
        className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0"
        style={{
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: '6px solid #111827',
        }}
      />

      <button
        onClick={() => onHighlight?.(selection)}
        className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-gray-700 text-sm whitespace-nowrap"
        title="高亮"
      >
        <Highlighter className="w-4 h-4 text-yellow-400" />
        高亮
      </button>

      <div className="w-px h-4 bg-gray-600" />

      <button
        onClick={() => onCreateCard?.(selection)}
        className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-gray-700 text-sm whitespace-nowrap"
        title="创建卡片"
      >
        <FileText className="w-4 h-4 text-indigo-400" />
        建卡
      </button>

      <div className="w-px h-4 bg-gray-600" />

      <button
        onClick={() => onClose?.()}
        className="p-1 rounded hover:bg-gray-700"
        title="关闭"
      >
        <X className="w-3.5 h-3.5 text-gray-400" />
      </button>
    </div>
  );
}
