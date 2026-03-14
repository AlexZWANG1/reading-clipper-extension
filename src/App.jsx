import React, { useState, useEffect } from 'react';
import { Loader2, Settings2, LogOut, BookOpen, ExternalLink, Clock } from 'lucide-react';
import { useStorage } from './hooks/use-storage';
import { fetchTopics } from './api';
import { isLoggedIn, getCurrentUser, logout } from './api/auth';
import { Button } from './components/Button';
import { Input } from './components/Input';
import { Select } from './components/Select';
import { ModeSwitch } from './components/ModeSwitch';
import { Toast } from './components/Toast';
import { LoginView } from './components/LoginView';

function App() {
    const { mode: initialMode, topicTitle: initialTopic, loading: storageLoading, saveSettings } = useStorage();

    // 认证状态
    const [authChecking, setAuthChecking] = useState(true);
    const [authenticated, setAuthenticated] = useState(false);
    const [user, setUser] = useState(null);

    const [mode, setMode] = useState("free");
    const [selectedTopic, setSelectedTopic] = useState("");
    const [newTopic, setNewTopic] = useState("");
    const [topics, setTopics] = useState([]);
    const [topicsLoading, setTopicsLoading] = useState(true);
    const [topicsError, setTopicsError] = useState(null);

    const [toast, setToast] = useState(null);
    const [saving, setSaving] = useState(false);
    const [importing, setImporting] = useState(false);

    // Current page awareness + recent imports
    const [currentTab, setCurrentTab] = useState(null);
    const [existingImport, setExistingImport] = useState(null);
    const [recentImports, setRecentImports] = useState([]);

    // Load current tab + check if already imported + load recent imports
    useEffect(() => {
        async function loadTabContext() {
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab) setCurrentTab(tab);
                if (tab?.url) {
                    const resp = await chrome.runtime.sendMessage({ type: 'CHECK_URL_IMPORTED', url: tab.url });
                    if (resp?.ok && resp.existing) setExistingImport(resp.existing);
                }
                const recentsResp = await chrome.runtime.sendMessage({ type: 'GET_RECENT_IMPORTS' });
                if (recentsResp?.ok) setRecentImports(recentsResp.imports || []);
            } catch (err) {
                console.error('loadTabContext error', err);
            }
        }
        loadTabContext();
    }, []);

    // 检查认证状态
    useEffect(() => {
        async function checkAuth() {
            const loggedIn = await isLoggedIn();
            setAuthenticated(loggedIn);
            if (loggedIn) {
                const userData = await getCurrentUser();
                setUser(userData);
            }
            setAuthChecking(false);
        }
        checkAuth();
    }, []);

    // Sync state with storage when loaded
    useEffect(() => {
        if (!storageLoading) {
            setMode(initialMode);
            // If initialTopic is in the list, set selectedTopic, else set newTopic?
            // Actually we don't know the list yet.
            // We'll handle this logic after topics load or just set both and let user decide.
            // Simple logic: if initialTopic matches a known topic, select it. Else put in newTopic input?
            // Or just put it in newTopic if it's not empty.
            // Let's wait for topics to load.
        }
    }, [storageLoading, initialMode, initialTopic]);

    // Load topics (仅在认证通过后)
    useEffect(() => {
        if (!authenticated) return;

        async function load() {
            try {
                const data = await fetchTopics();
                setTopics(data);
            } catch (err) {
                setTopicsError("无法连接到后端服务");
            } finally {
                setTopicsLoading(false);
            }
        }
        load();
    }, [authenticated]);

    // Set initial topic selection once both storage and topics are ready
    useEffect(() => {
        if (!storageLoading && !topicsLoading && initialTopic) {
            if (topics.includes(initialTopic)) {
                setSelectedTopic(initialTopic);
            } else {
                setNewTopic(initialTopic);
            }
        }
    }, [storageLoading, topicsLoading, initialTopic, topics]);

    const handleSave = async () => {
        setSaving(true);
        try {
            let finalTopic = null;

            if (mode === 'focus') {
                if (selectedTopic) {
                    finalTopic = selectedTopic;
                } else if (newTopic.trim()) {
                    finalTopic = newTopic.trim();
                } else {
                    setToast({ type: 'error', message: '请选择或输入一个 Topic' });
                    setSaving(false);
                    return;
                }
            }

            await saveSettings(mode, finalTopic);
            setToast({ type: 'success', message: '模式已保存' });

            // Auto dismiss toast
            setTimeout(() => setToast(null), 2000);
        } catch (err) {
            console.error(err);
            setToast({ type: 'error', message: '保存失败' });
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async () => {
        setSaving(true);
        try {
            await saveSettings('free', null);
            setMode('free');
            setSelectedTopic("");
            setNewTopic("");
            setToast({ type: 'info', message: '已重置为随心所欲模式' });
            setTimeout(() => setToast(null), 2000);
        } catch (err) {
            setToast({ type: 'error', message: '重置失败' });
        } finally {
            setSaving(false);
        }
    };

    // 登出处理
    const handleLogout = async () => {
        setSaving(true);
        try {
            await logout();
            setAuthenticated(false);
            setUser(null);
            setTopics([]);
        } finally {
            setSaving(false);
        }
    };

    // 登录成功回调
    const handleLoginSuccess = async () => {
        setAuthChecking(true);
        const loggedIn = await isLoggedIn();
        setAuthenticated(loggedIn);
        if (loggedIn) {
            const userData = await getCurrentUser();
            setUser(userData);
        }
        setAuthChecking(false);
    };

    const handleImportPage = async () => {
        setImporting(true);
        try {
            const tab = currentTab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
            if (!tab?.url) {
                setToast({ type: 'error', message: '无法获取当前页面信息' });
                return;
            }
            const response = await chrome.runtime.sendMessage({
                type: 'IMPORT_PAGE',
                url: tab.url,
                title: tab.title || '',
                tabId: tab.id,
            });
            if (response?.ok) {
                const title = response.title || tab.title || '页面';
                if (response.isDuplicate) {
                    setToast({ type: 'info', message: `「${title}」已导入过` });
                } else {
                    setToast({ type: 'success', message: `「${title}」导入成功！` });
                }
                // Update state
                if (response.material_id) {
                    setExistingImport({ id: response.material_id, title });
                    // Refresh recent imports
                    const recentsResp = await chrome.runtime.sendMessage({ type: 'GET_RECENT_IMPORTS' });
                    if (recentsResp?.ok) setRecentImports(recentsResp.imports || []);
                }
            } else {
                setToast({ type: 'error', message: response?.error || '导入失败' });
            }
            setTimeout(() => setToast(null), 3000);
        } catch (err) {
            console.error(err);
            setToast({ type: 'error', message: '导入失败: ' + err.message });
        } finally {
            setImporting(false);
        }
    };

    const openInReader = (materialId) => {
        chrome.tabs.create({ url: `http://localhost:5173/materials/${materialId}`, active: true });
    };

    // 检查认证状态中
    if (authChecking) {
        return (
            <div className="flex items-center justify-center h-96 bg-surface-50">
                <div className="flex flex-col items-center space-y-3">
                    <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                    <span className="text-sm text-surface-400 font-medium">检查登录状态...</span>
                </div>
            </div>
        );
    }

    // 未登录，显示登录界面
    if (!authenticated) {
        return <LoginView onLoginSuccess={handleLoginSuccess} />;
    }

    if (storageLoading) {
        return (
            <div className="flex items-center justify-center h-96 bg-surface-50">
                <div className="flex flex-col items-center space-y-3">
                    <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                    <span className="text-sm text-surface-400 font-medium">Loading settings...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-surface-50 pb-20 relative font-sans selection:bg-primary-100 selection:text-primary-900">
            {/* Ambient Background Gradient */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-primary-100/40 rounded-full blur-[100px] -z-10"></div>
            </div>

            <div className="px-5 py-4 flex items-center justify-between sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-surface-200/60 shadow-sm transition-all duration-200">
                <h1 className="text-lg font-bold text-surface-900 flex items-center tracking-tight">
                    <div className="p-1.5 bg-primary-50 rounded-lg mr-2.5 text-primary-600">
                        <Settings2 className="w-4 h-4" />
                    </div>
                    Reading Clipper
                </h1>
                <button
                    onClick={handleLogout}
                    disabled={saving}
                    className="flex items-center text-xs text-surface-500 hover:text-surface-700 transition-colors"
                    title={user?.email || '登出'}
                >
                    <LogOut className="w-4 h-4" />
                </button>
            </div>

            <div className="p-5 relative z-10">
                {/* Import / Open Reader button */}
                {existingImport ? (
                    <div className="mb-5 space-y-2">
                        <button
                            onClick={() => openInReader(existingImport.id)}
                            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold rounded-xl shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all duration-200"
                        >
                            <ExternalLink className="w-4 h-4" />
                            在阅读器中打开
                        </button>
                        <p className="text-xs text-center text-surface-400">此页面已导入阅读器</p>
                    </div>
                ) : (
                    <button
                        onClick={handleImportPage}
                        disabled={importing}
                        className="w-full mb-5 flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-semibold rounded-xl shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 hover:from-primary-600 hover:to-primary-700 transition-all duration-200 disabled:opacity-60"
                    >
                        {importing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <BookOpen className="w-4 h-4" />
                        )}
                        {importing ? '正在导入...' : '导入此页面到阅读器'}
                    </button>
                )}

                {/* Recent imports */}
                {recentImports.length > 0 && (
                    <div className="mb-5">
                        <div className="flex items-center gap-1.5 mb-2">
                            <Clock className="w-3 h-3 text-surface-400" />
                            <span className="text-xs font-semibold text-surface-400 uppercase tracking-wider">最近导入</span>
                        </div>
                        <div className="space-y-1">
                            {recentImports.slice(0, 5).map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => openInReader(item.id)}
                                    className="w-full text-left px-3 py-2 text-sm text-surface-700 bg-white/60 hover:bg-white rounded-lg border border-surface-100 hover:border-surface-200 transition-all truncate"
                                    title={item.title}
                                >
                                    {item.title}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <ModeSwitch mode={mode} onChange={setMode} />

                {mode === 'focus' && (
                    <div className="bg-white/60 backdrop-blur-sm rounded-xl p-5 mb-6 border border-white shadow-soft-md animate-slide-up">
                        <div className="space-y-5">
                            <div>
                                <label className="block text-xs font-semibold text-surface-500 mb-2 uppercase tracking-wider">
                                    选择已有 Topic
                                </label>
                                {topicsLoading ? (
                                    <div className="flex items-center text-sm text-surface-400 py-2 bg-surface-50 rounded-lg px-3 animate-pulse">
                                        <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                                        加载 Topic 中...
                                    </div>
                                ) : topicsError ? (
                                    <div className="text-sm text-red-500 py-2 bg-red-50 px-3 rounded-lg border border-red-100">{topicsError}</div>
                                ) : (
                                    <Select
                                        value={selectedTopic}
                                        onChange={(e) => {
                                            setSelectedTopic(e.target.value);
                                            setNewTopic("");
                                        }}
                                        options={topics}
                                        placeholder="（从已有 Topic 里选择）"
                                        disabled={!!newTopic}
                                        className={newTopic ? "opacity-50" : ""}
                                    />
                                )}
                            </div>

                            <div className="relative">
                                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                    <div className="w-full border-t border-surface-200"></div>
                                </div>
                                <div className="relative flex justify-center">
                                    <span className="bg-white/80 backdrop-blur px-3 text-xs font-medium text-surface-400 uppercase tracking-widest">OR</span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-surface-500 mb-2 uppercase tracking-wider">
                                    新建 Topic
                                </label>
                                <Input
                                    value={newTopic}
                                    onChange={(e) => {
                                        setNewTopic(e.target.value);
                                        if (e.target.value) setSelectedTopic("");
                                    }}
                                    placeholder="输入新的 Topic 名称"
                                    disabled={!!selectedTopic}
                                    className={selectedTopic ? "opacity-50" : ""}
                                />
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex gap-3 mt-4 pt-2">
                    <Button
                        variant="primary"
                        className="flex-1 h-11 text-base shadow-lg shadow-primary-500/20"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                保存中...
                            </>
                        ) : (
                            '保存设置'
                        )}
                    </Button>
                    <Button
                        variant="secondary"
                        className="h-11 px-6"
                        onClick={handleReset}
                        disabled={saving}
                    >
                        重置
                    </Button>
                </div>
            </div>

            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}
        </div>
    );
}

export default App;
