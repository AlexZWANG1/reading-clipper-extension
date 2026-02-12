import React from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

export function Toast({ message, type = 'success', onClose }) {
    if (!message) return null;

    const styles = {
        success: "bg-white text-green-700 border-green-200 shadow-soft-md",
        error: "bg-white text-red-700 border-red-200 shadow-soft-md",
        info: "bg-white text-primary-700 border-primary-200 shadow-soft-md"
    };

    const icons = {
        success: <CheckCircle2 className="w-5 h-5 mr-3 text-green-500" />,
        error: <AlertCircle className="w-5 h-5 mr-3 text-red-500" />,
        info: <AlertCircle className="w-5 h-5 mr-3 text-primary-500" />
    };

    return (
        <div className={`fixed bottom-4 left-4 right-4 p-4 rounded-xl border flex items-center shadow-lg animate-in slide-in-from-bottom-5 fade-in duration-300 backdrop-blur-sm ${styles[type]}`}>
            {icons[type]}
            <span className="text-sm font-medium flex-1">{message}</span>
            {onClose && (
                <button onClick={onClose} className="ml-2 p-1.5 hover:bg-surface-100 rounded-full transition-colors text-surface-400 hover:text-surface-600">
                    <X className="w-4 h-4" />
                </button>
            )}
        </div>
    );
}
