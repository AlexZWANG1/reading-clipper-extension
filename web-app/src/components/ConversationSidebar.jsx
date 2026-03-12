// ========= Conversation Sidebar =========
// Left panel showing conversation list with new/switch/delete/rename.

import { useState, useEffect, useRef } from 'react';
import {
  Plus, MessageCircle, Trash2, Pencil, Check, X, Loader2,
} from 'lucide-react';
import { useConversationsStore, useChatStore } from '../lib/store';

function ConversationSidebar() {
  const {
    conversations, loading, fetchConversations,
    deleteConversation, updateConversation,
  } = useConversationsStore();
  const { conversationId, loadConversation, newConversation } = useChatStore();

  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const editRef = useRef(null);

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editingId]);

  const handleNewConversation = () => {
    newConversation();
  };

  const handleSelect = (id) => {
    if (id === conversationId) return;
    loadConversation(id);
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!confirm('删除此会话？')) return;
    await deleteConversation(id);
    if (conversationId === id) {
      newConversation();
    }
  };

  const handleStartRename = (e, conv) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditTitle(conv.title || '');
  };

  const handleSaveRename = async (e) => {
    e?.stopPropagation();
    if (editTitle.trim()) {
      await updateConversation(editingId, { title: editTitle.trim() });
    }
    setEditingId(null);
  };

  const handleCancelRename = (e) => {
    e?.stopPropagation();
    setEditingId(null);
  };

  return (
    <div
      className="flex flex-col h-full"
      style={{ borderRight: '1px solid var(--border-primary)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3" style={{ borderBottom: '1px solid var(--border-primary)' }}>
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          会话历史
        </span>
        <button
          onClick={handleNewConversation}
          className="p-1.5 rounded-lg transition-colors hover:bg-black/5"
          style={{ color: 'var(--accent-500)' }}
          title="新会话"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {loading && conversations.length === 0 ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-tertiary)' }} />
          </div>
        ) : conversations.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <MessageCircle className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-tertiary)', opacity: 0.5 }} />
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              暂无会话记录
            </p>
          </div>
        ) : (
          <div className="py-1">
            {conversations.map((conv) => {
              const isActive = conv.id === conversationId;
              const isEditing = editingId === conv.id;

              return (
                <div
                  key={conv.id}
                  onClick={() => !isEditing && handleSelect(conv.id)}
                  className="group flex items-center gap-2 mx-1 px-2.5 py-2 rounded-lg cursor-pointer transition-colors"
                  style={{
                    background: isActive ? 'var(--accent-500/0.08)' : 'transparent',
                    color: isActive ? 'var(--accent-600)' : 'var(--text-secondary)',
                  }}
                >
                  <MessageCircle className="w-3.5 h-3.5 flex-none" style={{ opacity: 0.6 }} />

                  {isEditing ? (
                    <div className="flex-1 flex items-center gap-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                      <input
                        ref={editRef}
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRename(e);
                          if (e.key === 'Escape') handleCancelRename(e);
                        }}
                        className="flex-1 text-xs px-1.5 py-0.5 rounded border min-w-0"
                        style={{
                          background: 'var(--bg-elevated)',
                          borderColor: 'var(--border-primary)',
                          color: 'var(--text-primary)',
                          outline: 'none',
                        }}
                      />
                      <button onClick={handleSaveRename} className="p-0.5" style={{ color: '#22c55e' }}>
                        <Check className="w-3 h-3" />
                      </button>
                      <button onClick={handleCancelRename} className="p-0.5" style={{ color: 'var(--text-tertiary)' }}>
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: isActive ? 'var(--accent-600)' : 'var(--text-primary)' }}>
                          {conv.title || '新会话'}
                        </p>
                        <p className="text-[10px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                          {new Date(conv.updated_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>

                      {/* Actions (visible on hover) */}
                      <div className="hidden group-hover:flex items-center gap-0.5">
                        <button
                          onClick={(e) => handleStartRename(e, conv)}
                          className="p-1 rounded transition-colors hover:bg-black/5"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => handleDelete(e, conv.id)}
                          className="p-1 rounded transition-colors hover:bg-red-50"
                          style={{ color: '#ef4444' }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default ConversationSidebar;
