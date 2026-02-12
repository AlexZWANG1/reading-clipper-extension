import React from 'react';

export function Input({ className = '', ...props }) {
    return (
        <input
            className={`w-full px-4 py-2.5 border border-surface-200 rounded-lg text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 placeholder-surface-400 bg-surface-50 focus:bg-white shadow-soft-sm ${className}`}
            {...props}
        />
    );
}
