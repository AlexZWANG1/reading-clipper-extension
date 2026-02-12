import React from 'react';

export function Select({ options, value, onChange, placeholder = "Select an option", className = '', ...props }) {
    return (
        <select
            value={value}
            onChange={onChange}
            className={`w-full px-4 py-2.5 border border-surface-200 rounded-lg text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-surface-50 focus:bg-white shadow-soft-sm text-surface-800 ${className}`}
            {...props}
        >
            <option value="" disabled className="text-surface-400">{placeholder}</option>
            {options.map((opt) => (
                <option key={opt} value={opt} className="text-surface-800">
                    {opt}
                </option>
            ))}
        </select>
    );
}
