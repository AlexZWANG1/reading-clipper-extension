import React from 'react';

export function Button({ children, variant = 'primary', className = '', ...props }) {
    const baseStyles = "px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed shadow-soft-sm hover:shadow-soft active:scale-[0.98]";

    const variants = {
        primary: "bg-gradient-to-r from-primary-600 to-primary-500 text-white hover:from-primary-700 hover:to-primary-600 focus:ring-primary-500 border border-transparent",
        secondary: "bg-surface-100 text-surface-700 hover:bg-surface-200 focus:ring-surface-400 border border-surface-200",
        outline: "bg-white border border-surface-300 text-surface-700 hover:bg-surface-50 focus:ring-surface-400"
    };

    return (
        <button
            className={`${baseStyles} ${variants[variant]} ${className}`}
            {...props}
        >
            {children}
        </button>
    );
}
