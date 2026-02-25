import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';
import { useUIStore } from '../lib/store';

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertCircle,
};

const colorStyles = {
  success: { background: 'rgba(52,211,153,0.15)', color: '#34D399', border: '1px solid rgba(52,211,153,0.25)' },
  error: { background: 'rgba(251,113,133,0.15)', color: '#FB7185', border: '1px solid rgba(251,113,133,0.25)' },
  info: { background: 'rgba(99,102,241,0.15)', color: 'var(--accent-300)', border: '1px solid rgba(99,102,241,0.25)' },
  warning: { background: 'rgba(251,191,36,0.15)', color: '#FBBF24', border: '1px solid rgba(251,191,36,0.25)' },
};

function Toast({ message, type = 'info' }) {
  const { hideToast } = useUIStore();
  const Icon = icons[type] || Info;
  const style = colorStyles[type] || colorStyles.info;

  return (
    <div className="fixed bottom-4 right-4 z-[100] animate-slide-up">
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg backdrop-blur-md"
        style={style}
      >
        <Icon className="w-5 h-5" />
        <span className="text-sm font-medium">{message}</span>
        <button
          onClick={hideToast}
          className="p-1 rounded-lg transition-colors ml-2"
          style={{ color: 'inherit', opacity: 0.7 }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default Toast;
