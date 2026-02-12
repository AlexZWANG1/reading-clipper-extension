import React from 'react';
import { BookOpen, Target } from 'lucide-react';

export function ModeSwitch({ mode, onChange }) {
    return (
        <div className="space-y-3 mb-6">
            <label className={`relative flex items-start p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 group ${mode === 'free' ? 'border-primary-600 bg-primary-50/50 shadow-soft-sm' : 'border-surface-200 hover:border-surface-300 hover:bg-surface-50'}`}>
                <input
                    type="radio"
                    name="mode"
                    value="free"
                    checked={mode === 'free'}
                    onChange={(e) => onChange(e.target.value)}
                    className="mt-1 mr-3 text-primary-600 focus:ring-primary-500"
                />
                <div className="flex-1">
                    <div className={`flex items-center font-semibold transition-colors ${mode === 'free' ? 'text-primary-900' : 'text-surface-700'}`}>
                        <BookOpen className={`w-4 h-4 mr-2 ${mode === 'free' ? 'text-primary-600' : 'text-surface-400 group-hover:text-surface-600'}`} />
                        随心所欲模式
                    </div>
                    <div className={`text-xs mt-1 transition-colors ${mode === 'free' ? 'text-primary-600/80' : 'text-surface-500'}`}>
                        卡片都暂时归入"未归类"
                    </div>
                </div>
            </label>

            <label className={`relative flex items-start p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 group ${mode === 'focus' ? 'border-primary-600 bg-primary-50/50 shadow-soft-sm' : 'border-surface-200 hover:border-surface-300 hover:bg-surface-50'}`}>
                <input
                    type="radio"
                    name="mode"
                    value="focus"
                    checked={mode === 'focus'}
                    onChange={(e) => onChange(e.target.value)}
                    className="mt-1 mr-3 text-primary-600 focus:ring-primary-500"
                />
                <div className="flex-1">
                    <div className={`flex items-center font-semibold transition-colors ${mode === 'focus' ? 'text-primary-900' : 'text-surface-700'}`}>
                        <Target className={`w-4 h-4 mr-2 ${mode === 'focus' ? 'text-primary-600' : 'text-surface-400 group-hover:text-surface-600'}`} />
                        Focus 研究模式
                    </div>
                    <div className={`text-xs mt-1 transition-colors ${mode === 'focus' ? 'text-primary-600/80' : 'text-surface-500'}`}>
                        将卡片归入特定 Topic
                    </div>
                </div>
            </label>
        </div>
    );
}
