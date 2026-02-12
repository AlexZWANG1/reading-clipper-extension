import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CreditCard,
  Folder,
  FileText,
  TrendingUp,
  Clock,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { useCardsStore, useTopicsStore, useDocumentsStore } from '../lib/store';

function StatCard({ icon: Icon, label, value, color, to }) {
  return (
    <Link
      to={to}
      className="bg-white rounded-xl p-5 border border-surface-100 card-hover group"
    >
      <div className="flex items-start justify-between">
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <ArrowRight className="w-4 h-4 text-surface-300 group-hover:text-surface-500 group-hover:translate-x-1 transition-all" />
      </div>
      <div className="mt-4">
        <p className="text-2xl font-bold text-surface-900">{value}</p>
        <p className="text-sm text-surface-500 mt-0.5">{label}</p>
      </div>
    </Link>
  );
}

function RecentCard({ card }) {
  return (
    <div className="p-4 border border-surface-100 rounded-xl hover:border-primary-200 hover:bg-primary-50/30 transition-all cursor-pointer">
      <p className="text-sm text-surface-900 line-clamp-2 mb-2">{card.summary}</p>
      <div className="flex items-center gap-2 text-xs text-surface-500">
        <Clock className="w-3.5 h-3.5" />
        <span>
          {new Date(card.created_at).toLocaleDateString('zh-CN', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
        {card.topic_title && (
          <>
            <span className="text-surface-300">·</span>
            <span className="text-primary-600">{card.topic_title}</span>
          </>
        )}
      </div>
    </div>
  );
}

function DashboardPage() {
  const { cards, fetchCards } = useCardsStore();
  const { topics, fetchTopics } = useTopicsStore();
  const { documents, fetchDocuments } = useDocumentsStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        await Promise.all([fetchCards(), fetchTopics(), fetchDocuments()]);
      } catch (error) {
        console.error('加载数据失败:', error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [fetchCards, fetchTopics, fetchDocuments]);

  const recentCards = cards.slice(0, 5);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 skeleton rounded-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 skeleton rounded-xl" />
          ))}
        </div>
        <div className="h-64 skeleton rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-surface-900">仪表盘</h1>
        <p className="text-surface-500 mt-1">欢迎回来，这是你的知识库概览</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={CreditCard}
          label="知识卡片"
          value={cards.length}
          color="bg-primary-100 text-primary-600"
          to="/cards"
        />
        <StatCard
          icon={Folder}
          label="Topics"
          value={topics.length}
          color="bg-emerald-100 text-emerald-600"
          to="/topics"
        />
        <StatCard
          icon={FileText}
          label="文档"
          value={documents.length}
          color="bg-amber-100 text-amber-600"
          to="/documents"
        />
        <StatCard
          icon={TrendingUp}
          label="本周新增"
          value={
            cards.filter(
              (c) =>
                new Date(c.created_at) >
                new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            ).length
          }
          color="bg-rose-100 text-rose-600"
          to="/cards"
        />
      </div>

      {/* 最近卡片 */}
      <div className="bg-white rounded-xl border border-surface-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary-500" />
            <h2 className="font-semibold text-surface-900">最近添加的卡片</h2>
          </div>
          <Link
            to="/cards"
            className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
          >
            查看全部
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="p-4 space-y-3">
          {recentCards.length > 0 ? (
            recentCards.map((card) => <RecentCard key={card.id} card={card} />)
          ) : (
            <div className="text-center py-8 text-surface-500">
              <CreditCard className="w-12 h-12 mx-auto mb-3 text-surface-300" />
              <p>还没有任何卡片</p>
              <p className="text-sm mt-1">安装浏览器扩展，开始收集知识吧！</p>
            </div>
          )}
        </div>
      </div>

      {/* 快速开始提示 */}
      {cards.length === 0 && (
        <div className="bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl p-6 text-white">
          <h3 className="text-lg font-semibold mb-2">🚀 快速开始</h3>
          <p className="text-primary-100 mb-4">
            安装浏览器扩展后，你可以在任何网页上划选文本，右键点击「保存为阅读卡片」即可快速收集知识。
          </p>
          <div className="flex gap-3">
            <a
              href="#"
              className="px-4 py-2 bg-white text-primary-600 rounded-lg font-medium hover:bg-primary-50 transition-colors"
            >
              安装 Chrome 扩展
            </a>
            <a
              href="#"
              className="px-4 py-2 bg-primary-400/20 text-white rounded-lg font-medium hover:bg-primary-400/30 transition-colors"
            >
              查看使用指南
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export default DashboardPage;







