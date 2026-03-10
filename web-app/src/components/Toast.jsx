import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';
import { useUIStore } from '../lib/store';

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertCircle,
};

const colorStyles = {
  success: {
    background: 'var(--success-subtle)',
    color: 'var(--success)',
    border: '1px solid var(--success)',
  },
  error: {
    background: 'var(--error-subtle)',
    color: 'var(--error)',
    border: '1px solid var(--error)',
  },
  info: {
    background: 'var(--bg-muted)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-primary)',
  },
  warning: {
    background: 'var(--warning-subtle)',
    color: 'var(--warning)',
    border: '1px solid var(--warning)',
  },
};

function Toast({ message, type = 'info' }) {
  const { hideToast } = useUIStore();
  const Icon = icons[type] || Info;
  const style = colorStyles[type] || colorStyles.info;

  return (
    <div className="fixed bottom-4 right-4 z-[100] animate-slide-up" role="status" aria-live="polite">
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg"
        style={style}
      >
        <Icon className="w-5 h-5" />
        <span className="text-sm font-medium">{message}</span>
        <button
          onClick={hideToast}
          className="p-1 rounded transition-opacity ml-2 hover:opacity-70 cursor-pointer"
          style={{ color: 'inherit', opacity: 0.8 }}
          aria-label="关闭提示"
          title="关闭提示"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default Toast;
