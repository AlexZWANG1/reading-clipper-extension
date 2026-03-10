import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  RefreshCw,
  Star,
  StarOff,
} from 'lucide-react';
import { useRssStore, useUIStore } from '../lib/store';

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN');
}

export default function RssSubscriptionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useUIStore();
  const {
    currentSubscription,
    items,
    loading,
    fetchSubscription,
    fetchItems,
    syncSubscription,
    updateItem,
    importItemToMaterials,
  } = useRssStore();

  const [syncing, setSyncing] = useState(false);
  const [filters, setFilters] = useState({
    unread: undefined,
    starred: undefined,
    imported: undefined,
  });

  const loadData = useCallback(async () => {
    if (!id) return;
    await fetchSubscription(id);
    await fetchItems(id, filters);
  }, [id, fetchSubscription, fetchItems, filters]);

  useEffect(() => {
    loadData().catch((error) => {
      showToast(error.message || '加载订阅失败', 'error');
    });
  }, [loadData, showToast]);

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((v) => v !== undefined).length,
    [filters]
  );

  const handleSync = async () => {
    if (!id || syncing) return;
    setSyncing(true);
    try {
      await syncSubscription(id, { force: true });
      await fetchItems(id, filters);
      showToast('同步完成', 'success');
    } catch (error) {
      showToast(error.message || '同步失败', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const toggleRead = async (item) => {
    try {
      await updateItem(item.id, { is_read: !item.is_read });
    } catch (error) {
      showToast(error.message || '更新失败', 'error');
    }
  };

  const toggleStar = async (item) => {
    try {
      await updateItem(item.id, { is_starred: !item.is_starred });
    } catch (error) {
      showToast(error.message || '更新失败', 'error');
    }
  };

  const handleImport = async (item) => {
    try {
      const result = await importItemToMaterials(item.id, {});
      if (result.already_imported) {
        showToast('该条目已导入材料库', 'info');
      } else {
        showToast('已导入到材料库，后台处理中', 'success');
      }
    } catch (error) {
      showToast(error.message || '导入失败', 'error');
    }
  };

  const reloadWithFilter = async (nextFilters) => {
    setFilters(nextFilters);
    if (!id) return;
    try {
      await fetchItems(id, nextFilters);
    } catch (error) {
      showToast(error.message || '筛选失败', 'error');
    }
  };

  if (!id) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={() => navigate('/rss')}
            className="inline-flex items-center gap-1 text-sm mb-2"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <ArrowLeft className="w-4 h-4" />
            返回订阅列表
          </button>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {currentSubscription?.title || 'RSS 订阅'}
          </h1>
          <p className="text-xs mt-1 break-all" style={{ color: 'var(--text-tertiary)' }}>
            {currentSubscription?.feed_url}
          </p>
        </div>
        <button
          onClick={handleSync}
          className="btn btn-primary flex items-center gap-2"
          disabled={syncing || loading}
        >
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          手动同步
        </button>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className={`btn btn-secondary ${filters.unread === true ? 'ring-2 ring-blue-500' : ''}`}
            onClick={() => reloadWithFilter({ ...filters, unread: filters.unread === true ? undefined : true })}
          >
            仅未读
          </button>
          <button
            className={`btn btn-secondary ${filters.starred === true ? 'ring-2 ring-blue-500' : ''}`}
            onClick={() => reloadWithFilter({ ...filters, starred: filters.starred === true ? undefined : true })}
          >
            仅收藏
          </button>
          <button
            className={`btn btn-secondary ${filters.imported === true ? 'ring-2 ring-blue-500' : ''}`}
            onClick={() => reloadWithFilter({ ...filters, imported: filters.imported === true ? undefined : true })}
          >
            仅已导入
          </button>
          {activeFilterCount > 0 && (
            <button
              className="btn btn-secondary"
              onClick={() => reloadWithFilter({ unread: undefined, starred: undefined, imported: undefined })}
            >
              清空筛选
            </button>
          )}
        </div>
      </div>

      <div className="card p-4">
        {loading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-tertiary)' }} />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-10 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            暂无条目，点击右上角“手动同步”拉取最新内容
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--border-primary)' }}>
                <div className="flex items-start gap-3">
                  <button
                    className={`mt-1 w-2.5 h-2.5 rounded-full ${item.is_read ? 'bg-gray-300' : 'bg-blue-500'}`}
                    onClick={() => toggleRead(item)}
                    title={item.is_read ? '标记未读' : '标记已读'}
                  />
                  <div className="flex-1 min-w-0">
                    <a
                      href={item.url || '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium hover:underline"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {item.title || 'Untitled'}
                    </a>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      发布时间：{formatDate(item.published_at)} | 入库：{formatDate(item.created_at)}
                    </p>
                    {item.summary && (
                      <p className="text-sm mt-2 line-clamp-3" style={{ color: 'var(--text-secondary)' }}>
                        {item.summary}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button className="btn btn-secondary text-xs px-3 py-1.5" onClick={() => toggleRead(item)}>
                        {item.is_read ? '标记未读' : '标记已读'}
                      </button>
                      <button className="btn btn-secondary text-xs px-3 py-1.5 flex items-center gap-1" onClick={() => toggleStar(item)}>
                        {item.is_starred ? <StarOff className="w-3.5 h-3.5" /> : <Star className="w-3.5 h-3.5" />}
                        {item.is_starred ? '取消收藏' : '收藏'}
                      </button>
                      <button className="btn btn-primary text-xs px-3 py-1.5" onClick={() => handleImport(item)}>
                        {item.imported_material_id ? '已导入材料' : '导入材料库'}
                      </button>
                      {item.imported_material_id && (
                        <button
                          className="btn btn-secondary text-xs px-3 py-1.5"
                          onClick={() => navigate(`/materials/${item.imported_material_id}`)}
                        >
                          打开阅读器
                        </button>
                      )}
                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1"
                        >
                          原文
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
