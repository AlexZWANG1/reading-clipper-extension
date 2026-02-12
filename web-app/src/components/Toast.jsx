import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';
import { useUIStore } from '../lib/store';

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertCircle,
};

const colors = {
  success: 'bg-green-50 text-green-800 border-green-200',
  error: 'bg-red-50 text-red-800 border-red-200',
  info: 'bg-blue-50 text-blue-800 border-blue-200',
  warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
};

const iconColors = {
  success: 'text-green-500',
  error: 'text-red-500',
  info: 'text-blue-500',
  warning: 'text-yellow-500',
};

function Toast({ message, type = 'info' }) {
  const { hideToast } = useUIStore();
  const Icon = icons[type] || Info;

  return (
    <div className="fixed bottom-4 right-4 z-[100] animate-slide-up">
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg ${colors[type]}`}
      >
        <Icon className={`w-5 h-5 ${iconColors[type]}`} />
        <span className="text-sm font-medium">{message}</span>
        <button
          onClick={hideToast}
          className="p-1 hover:bg-black/5 rounded-lg transition-colors ml-2"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default Toast;







