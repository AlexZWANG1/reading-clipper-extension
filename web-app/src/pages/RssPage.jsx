import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Rss,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { rssApi } from '../lib/api';
import { useRssStore, useUIStore } from '../lib/store';

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN');
}

export default function RssPage() {
  const navigate = useNavigate();
  const { showToast } = useUIStore();
  const {
    subscriptions,
    loading,
    fetchSubscriptions,
    createSubscription,
    syncSubscription,
    deleteSubscription,
  } = useRssStore();

  const [manualFeedUrl, setManualFeedUrl] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const [discoverType, setDiscoverType] = useState('website_url');
  const [discoverInput, setDiscoverInput] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [discoverCandidates, setDiscoverCandidates] = useState([]);

  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchSubscriptions().catch((error) => {
      showToast(error.message || '加载订阅失败', 'error');
    });
  }, [fetchSubscriptions, showToast]);

  const statusStats = useMemo(() => {
    const active = subscriptions.filter((s) => s.status === 'active').length;
    const paused = subscriptions.filter((s) => s.status === 'paused').length;
    const archived = subscriptions.filter((s) => s.status === 'archived').length;
    return { active, paused, archived };
  }, [subscriptions]);

  const handleCreate = async (payload) => {
    if (creating) return;
    setCreating(true);
    try {
      await createSubscription(payload);
      showToast('订阅已添加', 'success');
      setManualFeedUrl('');
      setManualTitle('');
      await fetchSubscriptions();
    } catch (error) {
      showToast(error.message || '添加订阅失败', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleManualCreate = async () => {
    if (!manualFeedUrl.trim()) {
      showToast('请输入 Feed URL', 'error');
      return;
    }
    await handleCreate({
      feed_url: manualFeedUrl.trim(),
      title: manualTitle.trim() || undefined,
      sync_on_create: true,
    });
  };

  const handleDiscover = async () => {
    if (!discoverInput.trim()) {
      showToast('请输入查询内容', 'error');
      return;
    }
    setDiscovering(true);
    try {
      const result = await rssApi.discover({
        source_type: discoverType,
        value: discoverInput.trim(),
        limit: 10,
      });
      setDiscoverCandidates(result.candidates || []);
      if (!result.candidates?.length) {
        showToast('未发现可订阅源', 'info');
      }
    } catch (error) {
      showToast(error.message || '发现失败', 'error');
    } finally {
      setDiscovering(false);
    }
  };

  const handleSync = async (subscriptionId) => {
    try {
      await syncSubscription(subscriptionId, { force: true });
      showToast('同步已完成', 'success');
      await fetchSubscriptions();
    } catch (error) {
      showToast(error.message || '同步失败', 'error');
    }
  };

  const handleDelete = async (subscriptionId) => {
    if (!window.confirm('确认归档这个订阅吗？')) return;
    try {
      await deleteSubscription(subscriptionId);
      showToast('订阅已归档', 'success');
    } catch (error) {
      showToast(error.message || '归档失败', 'error');
    }
  };

  const handleImportOpml = async (event) => {
    const file = event.target.files?.[0];
    if (!file || importing) return;

    setImporting(true);
    try {
      const result = await rssApi.importOpml({ file });
      showToast(`导入完成：新增 ${result.imported}，重复 ${result.duplicates}`, 'success');
      await fetchSubscriptions();
    } catch (error) {
      showToast(error.message || '导入 OPML 失败', 'error');
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

  const handleExportOpml = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const blob = await rssApi.exportOpml();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'verity-rss-subscriptions.opml';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      showToast(error.message || '导出 OPML 失败', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            RSS 订阅
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
            管理订阅并将感兴趣条目导入来源库
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="btn btn-secondary cursor-pointer flex items-center gap-2">
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            导入 OPML
            <input type="file" accept=".opml,.xml,text/xml" hidden onChange={handleImportOpml} />
          </label>
          <button onClick={handleExportOpml} className="btn btn-secondary flex items-center gap-2">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            导出 OPML
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Active</p>
          <p className="text-2xl font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>{statusStats.active}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Paused</p>
          <p className="text-2xl font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>{statusStats.paused}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Archived</p>
          <p className="text-2xl font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>{statusStats.archived}</p>
        </div>
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        <div className="card p-4 space-y-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>手动添加 Feed</h2>
          <input
            value={manualFeedUrl}
            onChange={(e) => setManualFeedUrl(e.target.value)}
            placeholder="https://example.com/feed.xml"
            className="input w-full"
          />
          <input
            value={manualTitle}
            onChange={(e) => setManualTitle(e.target.value)}
            placeholder="订阅名称（可选）"
            className="input w-full"
          />
          <button onClick={handleManualCreate} disabled={creating} className="btn btn-primary flex items-center gap-2">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            添加订阅
          </button>
        </div>

        <div className="card p-4 space-y-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>发现订阅源</h2>
          <div className="flex gap-2">
            <select
              value={discoverType}
              onChange={(e) => setDiscoverType(e.target.value)}
              className="input"
            >
              <option value="website_url">网站 URL</option>
              <option value="feed_url">Feed URL</option>
              <option value="nl_query">关键词</option>
            </select>
            <input
              value={discoverInput}
              onChange={(e) => setDiscoverInput(e.target.value)}
              placeholder="输入网站地址、Feed 地址或关键词"
              className="input flex-1"
            />
            <button onClick={handleDiscover} className="btn btn-secondary flex items-center gap-2" disabled={discovering}>
              {discovering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              发现
            </button>
          </div>

          {discoverCandidates.length > 0 && (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {discoverCandidates.map((candidate) => (
                <div key={candidate.feed_url} className="rounded-lg border p-3" style={{ borderColor: 'var(--border-primary)' }}>
                  <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                    {candidate.title || candidate.feed_url}
                  </p>
                  <p className="text-xs mt-1 break-all" style={{ color: 'var(--text-tertiary)' }}>
                    {candidate.feed_url}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      className="btn btn-primary text-xs px-3 py-1.5"
                      onClick={() => handleCreate({
                        feed_url: candidate.feed_url,
                        title: candidate.title || undefined,
                        site_url: candidate.site_url || undefined,
                        description: candidate.description || undefined,
                        language: candidate.language || undefined,
                        region: candidate.region || undefined,
                        sync_on_create: true,
                      })}
                    >
                      订阅
                    </button>
                    {candidate.site_url && (
                      <a href={candidate.site_url} target="_blank" rel="noreferrer" className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--interactive-primary)' }}>
                        站点
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>订阅列表</h2>
          {loading && <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-tertiary)' }} />}
        </div>

        {subscriptions.length === 0 ? (
          <div className="text-center py-10">
            <Rss className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--text-tertiary)' }} />
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>暂无订阅，先添加一个 Feed</p>
          </div>
        ) : (
          <div className="space-y-2">
            {subscriptions.map((subscription) => (
              <div key={subscription.id} className="rounded-lg border p-3 flex items-start gap-3" style={{ borderColor: 'var(--border-primary)' }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--bg-muted)' }}>
                  <Rss className="w-4 h-4" style={{ color: 'var(--interactive-primary)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <button
                    className="text-left font-medium hover:underline"
                    style={{ color: 'var(--text-primary)' }}
                    onClick={() => navigate(`/rss/subscriptions/${subscription.id}`)}
                  >
                    {subscription.title}
                  </button>
                  <p className="text-xs mt-1 break-all" style={{ color: 'var(--text-tertiary)' }}>{subscription.feed_url}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                    上次同步：{formatDate(subscription.last_synced_at)} | 轮询：{subscription.poll_interval_minutes} 分钟
                  </p>
                  {subscription.last_error && (
                    <p className="text-xs mt-1" style={{ color: 'var(--error)' }}>
                      最近错误：{subscription.last_error}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    className="p-2 rounded-lg hover:bg-black/5"
                    onClick={() => handleSync(subscription.id)}
                    title="手动同步"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    className="p-2 rounded-lg hover:bg-black/5"
                    onClick={() => navigate(`/rss/subscriptions/${subscription.id}`)}
                    title="查看详情"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                  <button
                    className="p-2 rounded-lg hover:bg-red-50 text-red-500"
                    onClick={() => handleDelete(subscription.id)}
                    title="归档订阅"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
