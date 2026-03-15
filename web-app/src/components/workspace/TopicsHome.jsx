// ========= TopicsHome — Management Home (Spec §8) =========
// Entry point for Verity. Shows topic grid with material/card counts,
// inbox for uncategorized items, and topic CRUD.
// Click Topic → navigate to /topics/:topicId (workspace mode).

import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Plus, Folder, MoreVertical, Edit3, Trash2,
    FileText, Layers, X, Loader2, Inbox, Clock,
} from 'lucide-react';
import { useTopicsStore, useCardsStore, useUIStore } from '../../lib/store';

const TOPIC_COLORS = [
    { bg: 'rgba(99,102,241,0.12)', color: '#818CF8' },
    { bg: 'rgba(52,211,153,0.12)', color: '#34D399' },
    { bg: 'rgba(251,191,36,0.12)', color: '#FBBF24' },
    { bg: 'rgba(251,113,133,0.12)', color: '#FB7185' },
    { bg: 'rgba(34,211,238,0.12)', color: '#22D3EE' },
    { bg: 'rgba(167,139,250,0.12)', color: '#A78BFA' },
];

function getTopicColor(title) {
    const idx = (title || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % TOPIC_COLORS.length;
    return TOPIC_COLORS[idx];
}

export default function TopicsHome() {
    const navigate = useNavigate();
    const { topics, fetchTopics, createTopic, updateTopic, deleteTopic } = useTopicsStore();
    const { cards, fetchCards } = useCardsStore();
    const { showToast } = useUIStore();

    const [modalOpen, setModalOpen] = useState(false);
    const [editingTopic, setEditingTopic] = useState(null);
    const [inboxExpanded, setInboxExpanded] = useState(false);

    useEffect(() => {
        fetchTopics();
        fetchCards({});
    }, [fetchTopics, fetchCards]);

    // Uncategorized cards
    const uncategorizedCards = useMemo(() => {
        return (cards || []).filter(c => !c.topic_id);
    }, [cards]);

    // Card count per topic
    const topicCardCounts = useMemo(() => {
        const counts = {};
        (cards || []).forEach(c => {
            if (c.topic_id) {
                counts[c.topic_id] = (counts[c.topic_id] || 0) + 1;
            }
        });
        return counts;
    }, [cards]);

    const handleCreateOrUpdate = async (data) => {
        try {
            if (editingTopic) {
                await updateTopic(editingTopic.id, data);
                showToast('Topic 已更新', 'success');
            } else {
                await createTopic(data);
                showToast('Topic 已创建', 'success');
            }
            setModalOpen(false);
            setEditingTopic(null);
        } catch (err) {
            showToast(err.message || '操作失败', 'error');
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('确定删除此 Topic？')) return;
        try {
            await deleteTopic(id);
            showToast('已删除', 'success');
        } catch (err) {
            showToast(err.message || '删除失败', 'error');
        }
    };

    return (
        <div className="max-w-5xl mx-auto px-6 py-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--text-0)' }}>
                        Your Research
                    </h1>
                    <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
                        选择一个 Topic 进入工作区
                    </p>
                </div>
                <button
                    onClick={() => { setEditingTopic(null); setModalOpen(true); }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:-translate-y-0.5"
                    style={{
                        background: 'linear-gradient(135deg, var(--accent-500) 0%, var(--interactive-hover) 100%)',
                        color: '#fff',
                        boxShadow: '0 10px 24px rgba(31, 58, 95, 0.28)',
                    }}
                >
                    <Plus size={16} /> 新建 Topic
                </button>
            </div>

            {/* Topic grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
                {topics.map(topic => {
                    const color = getTopicColor(topic.title);
                    const cardCount = topicCardCounts[topic.id] || topic.card_count || 0;

                    return (
                        <TopicCard
                            key={topic.id}
                            topic={topic}
                            color={color}
                            cardCount={cardCount}
                            onNavigate={() => navigate(`/topics/${topic.id}`)}
                            onEdit={() => { setEditingTopic(topic); setModalOpen(true); }}
                            onDelete={() => handleDelete(topic.id)}
                        />
                    );
                })}

                {topics.length === 0 && (
                    <div className="col-span-full text-center py-16">
                        <Folder size={48} className="mx-auto mb-4" style={{ color: 'var(--text-2)' }} />
                        <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                            还没有 Topic，点击上方「新建 Topic」开始研究
                        </p>
                    </div>
                )}
            </div>

            {/* Inbox */}
            {uncategorizedCards.length > 0 && (
                <div>
                    <button
                        onClick={() => setInboxExpanded(!inboxExpanded)}
                        className="flex items-center gap-2 w-full px-4 py-3 rounded-xl transition-colors text-sm"
                        style={{
                            background: 'var(--surface-1)',
                            border: '1px dashed var(--stroke-1)',
                            color: 'var(--text-1)',
                        }}
                    >
                        <Inbox size={16} />
                        <span className="font-medium">收件箱</span>
                        <span style={{ color: 'var(--text-2)' }}>
                            · {uncategorizedCards.length} 张未归类卡片
                        </span>
                    </button>

                    {inboxExpanded && (
                        <div className="mt-2 p-4 rounded-xl space-y-2" style={{ background: 'var(--surface-1)', border: '1px solid var(--stroke-0)' }}>
                            {uncategorizedCards.map(card => (
                                <div key={card.id} className="flex items-start gap-2 p-2 rounded-lg text-xs" style={{ background: 'var(--surface-0)' }}>
                                    <span
                                        className="text-[8px] font-mono font-bold uppercase px-1 rounded-sm shrink-0 mt-0.5"
                                        style={{
                                            color: '#fff',
                                            backgroundColor: card.fact_or_view === 'view' ? 'var(--text-secondary)' : 'var(--text-primary)',
                                        }}
                                    >
                                        {card.fact_or_view === 'view' ? 'VIEW' : 'FACT'}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium truncate" style={{ color: 'var(--text-0)' }}>
                                            {card.title || '暂未命名'}
                                        </div>
                                        <div className="line-clamp-1 mt-0.5" style={{ color: 'var(--text-2)' }}>
                                            {card.summary || '(无内容)'}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Create/Edit Modal */}
            <TopicModal
                isOpen={modalOpen}
                onClose={() => { setModalOpen(false); setEditingTopic(null); }}
                onSubmit={handleCreateOrUpdate}
                editingTopic={editingTopic}
            />
        </div>
    );
}

function TopicCard({ topic, color, cardCount, onNavigate, onEdit, onDelete }) {
    const [menuOpen, setMenuOpen] = useState(false);

    return (
        <div
            className="rounded-xl p-5 transition-all hover:-translate-y-1 group cursor-pointer"
            style={{
                background: 'var(--surface-0)',
                border: '1px solid var(--stroke-0)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}
            onClick={onNavigate}
        >
            <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: color.bg, color: color.color }}>
                    <Folder size={20} />
                </div>
                <div className="relative" onClick={e => e.stopPropagation()}>
                    <button
                        onClick={() => setMenuOpen(!menuOpen)}
                        className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                        style={{ color: 'var(--text-2)' }}
                    >
                        <MoreVertical size={14} />
                    </button>
                    {menuOpen && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                            <div className="absolute right-0 top-full mt-1 rounded-lg shadow-lg py-1 z-20 min-w-[100px] glass-surface">
                                <button
                                    onClick={() => { onEdit(); setMenuOpen(false); }}
                                    className="w-full px-3 py-1.5 text-left text-xs flex items-center gap-2"
                                    style={{ color: 'var(--text-1)' }}
                                >
                                    <Edit3 size={12} /> 编辑
                                </button>
                                <button
                                    onClick={() => { onDelete(); setMenuOpen(false); }}
                                    className="w-full px-3 py-1.5 text-left text-xs flex items-center gap-2"
                                    style={{ color: '#FB7185' }}
                                >
                                    <Trash2 size={12} /> 删除
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text-0)' }}>
                {topic.title}
            </h3>
            {topic.description && (
                <p className="text-xs line-clamp-2 mb-3" style={{ color: 'var(--text-2)' }}>
                    {topic.description}
                </p>
            )}

            <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-2)' }}>
                <span className="inline-flex items-center gap-1">
                    <Layers size={12} /> {cardCount} 卡片
                </span>
                {topic.updated_at && (
                    <span className="inline-flex items-center gap-1">
                        <Clock size={12} />
                        {new Date(topic.updated_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                    </span>
                )}
            </div>
        </div>
    );
}

function TopicModal({ isOpen, onClose, onSubmit, editingTopic }) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (editingTopic) {
            setTitle(editingTopic.title);
            setDescription(editingTopic.description || '');
        } else {
            setTitle('');
            setDescription('');
        }
    }, [editingTopic, isOpen]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        setLoading(true);
        try {
            await onSubmit({ title: title.trim(), description: description.trim() });
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
            <div className="relative rounded-2xl shadow-xl w-full max-w-md p-6 glass-surface">
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-lg font-semibold" style={{ color: 'var(--text-0)' }}>
                        {editingTopic ? '编辑 Topic' : '新建 Topic'}
                    </h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--text-2)' }}>
                        <X size={16} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-1)' }}>名称</label>
                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="研究议题名称"
                            className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                            style={{ background: 'var(--bg-0)', border: '1px solid var(--stroke-0)', color: 'var(--text-0)' }}
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-1)' }}>
                            描述 <span style={{ color: 'var(--text-2)' }}>(可选)</span>
                        </label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="简要描述研究方向..."
                            rows={3}
                            className="w-full px-3 py-2 rounded-xl text-sm resize-none outline-none"
                            style={{ background: 'var(--bg-0)', border: '1px solid var(--stroke-0)', color: 'var(--text-0)' }}
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-xl" style={{ color: 'var(--text-1)' }}>
                            取消
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !title.trim()}
                            className="px-4 py-2 text-sm rounded-xl disabled:opacity-50"
                            style={{ background: 'var(--accent-500)', color: '#fff' }}
                        >
                            {loading ? <Loader2 size={14} className="animate-spin" /> : editingTopic ? '保存' : '创建'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
