import { useSearchParams } from 'react-router-dom';
import { Sparkles, Rss, Globe, Download } from 'lucide-react';

import AISettingsPage from './AISettingsPage';
import RssPage from './RssPage';
import SourcesPage from './SourcesPage';
import DownloadPage from './DownloadPage';

const TABS = [
    { key: 'ai', label: 'AI 模型', icon: Sparkles },
    { key: 'rss', label: 'RSS 订阅', icon: Rss },
    { key: 'sources', label: '信息源', icon: Globe },
    { key: 'export', label: '导出', icon: Download },
];

export default function SettingsPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') || 'ai';

    const setTab = (tab) => {
        setSearchParams({ tab }, { replace: true });
    };

    return (
        <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-0)' }}>设置</h1>

            {/* Tab bar */}
            <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: 'var(--surface-1)', border: '1px solid var(--stroke-0)' }}>
                {TABS.map(({ key, label, icon: Icon }) => (
                    <button
                        key={key}
                        onClick={() => setTab(key)}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors flex-1 justify-center"
                        style={{
                            background: activeTab === key ? 'var(--surface-0)' : 'transparent',
                            color: activeTab === key ? 'var(--text-0)' : 'var(--text-2)',
                            boxShadow: activeTab === key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                        }}
                    >
                        <Icon size={14} />
                        {label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            <div>
                {activeTab === 'ai' && <AISettingsPage embedded />}
                {activeTab === 'rss' && <RssPage embedded />}
                {activeTab === 'sources' && <SourcesPage embedded />}
                {activeTab === 'export' && <DownloadPage embedded />}
            </div>
        </div>
    );
}
