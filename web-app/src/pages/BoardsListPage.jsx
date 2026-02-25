// ========= 思维画板列表页面 =========

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Brain, Trash2, Clock } from 'lucide-react';
import { boardsApi } from '../lib/api';
import { useUIStore } from '../lib/store';

export default function BoardsListPage() {
    const navigate = useNavigate();
    const { showToast } = useUIStore();
    const [boards, setBoards] = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);

    // 加载画板列表
    useEffect(() => {
        async function loadBoards() {
            try {
                const { boards: data } = await boardsApi.list();
                setBoards(data || []);
            } catch (err) {
                showToast('加载画板列表失败: ' + err.message, 'error');
            } finally {
                setLoading(false);
            }
        }
        loadBoards();
    }, [showToast]);

    // 创建新画板
    const handleCreate = async () => {
        setCreating(true);
        try {
            const { board } = await boardsApi.create({ title: '新思维画板' });
            navigate(`/boards/${board.id}`);
        } catch (err) {
            showToast('创建画板失败: ' + err.message, 'error');
        } finally {
            setCreating(false);
        }
    };

    // 删除画板
    const handleDelete = async (id, e) => {
        e.stopPropagation();
        if (!confirm('确定要删除这个画板吗？')) return;
        try {
            await boardsApi.delete(id);
            setBoards((prev) => prev.filter((b) => b.id !== id));
            showToast('画板已删除', 'success');
        } catch (err) {
            showToast('删除失败: ' + err.message, 'error');
        }
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <Brain className="w-8 h-8" style={{ color: 'var(--accent-400)' }} />
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--text-0)' }}>思维画板</h1>
                </div>
                <button
                    onClick={handleCreate}
                    disabled={creating}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
                    style={{ background: 'var(--accent-600)', color: 'white' }}
                >
                    <Plus size={20} />
                    {creating ? '创建中...' : '新建画板'}
                </button>
            </div>

            {boards.length === 0 ? (
                <div className="text-center py-12" style={{ color: 'var(--text-2)' }}>
                    <Brain className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <p>还没有思维画板</p>
                    <p className="text-sm mt-1">点击"新建画板"开始组织你的思维</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {boards.map((board) => (
                        <div
                            key={board.id}
                            onClick={() => navigate(`/boards/${board.id}`)}
                            className="group p-5 rounded-xl cursor-pointer transition-all"
                            style={{ background: 'var(--surface-0)', border: '1px solid var(--stroke-0)' }}
                        >
                            <div className="flex items-start justify-between">
                                <h3 className="font-semibold" style={{ color: 'var(--text-0)' }}>
                                    {board.title}
                                </h3>
                                <button
                                    onClick={(e) => handleDelete(board.id, e)}
                                    className="p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                    style={{ color: 'var(--text-2)' }}
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                            {board.description && (
                                <p className="mt-2 text-sm line-clamp-2" style={{ color: 'var(--text-2)' }}>{board.description}</p>
                            )}
                            <div className="mt-3 flex items-center gap-1 text-xs" style={{ color: 'var(--text-2)' }}>
                                <Clock size={12} />
                                <span>
                                    {new Date(board.updated_at).toLocaleDateString('zh-CN', {
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                    })}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
