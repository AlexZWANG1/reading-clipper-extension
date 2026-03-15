import { useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore, useUIStore } from './lib/store';
import ErrorBoundary from './components/ErrorBoundary';

// 页面组件
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import CardsPage from './pages/CardsPage';
import TopicsPage from './pages/TopicsPage';
import TopicsHome from './components/workspace/TopicsHome';
import SourcesPage from './pages/SourcesPage';
import RssPage from './pages/RssPage';
import RssSubscriptionDetailPage from './pages/RssSubscriptionDetailPage';
import AISettingsPage from './pages/AISettingsPage';
import DownloadPage from './pages/DownloadPage';
import ChatPage from './pages/ChatPage';
import SettingsPage from './pages/SettingsPage';
import MaterialsPage from './pages/MaterialsPage';
import MaterialReaderPage from './pages/MaterialReaderPage';
import TasksPage from './pages/TasksPage';
import TaskDetailView from './pages/TaskDetailView';

// Workspace components (Spec §12)
import WorkspaceLayout from './components/workspace/WorkspaceLayout';
const TopicWorkspace = lazy(() => import('./components/workspace/TopicWorkspace'));

// 布局组件
import Layout from './components/Layout';
import Toast from './components/Toast';

// 受保护的路由组件
function ProtectedRoute({ children }) {
  const { session, loading } = useAuthStore();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-[3px] border-primary-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-surface-500">加载中...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

// 公开路由组件（已登录则重定向）
function PublicRoute({ children }) {
  const { session, loading } = useAuthStore();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-[3px] border-primary-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-surface-500">加载中...</p>
        </div>
      </div>
    );
  }

  if (session) {
    const from = location.state?.from?.pathname || '/';
    return <Navigate to={from} replace />;
  }

  return children;
}

function App() {
  const { init } = useAuthStore();
  const { toast } = useUIStore();

  useEffect(() => {
    init();
  }, [init]);

  return (
    <ErrorBoundary>
      <Routes>
        {/* 公开路由 */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicRoute>
              <RegisterPage />
            </PublicRoute>
          }
        />

        {/* Workspace route — immersive topic workspace (Spec §12) */}
        <Route
          path="/topics/:topicId"
          element={
            <ProtectedRoute>
              <WorkspaceLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="w-8 h-8 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}><TopicWorkspace /></Suspense>} />
        </Route>

        {/* Primary management routes — visible in nav (Spec §3.6) */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<TopicsHome />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="tasks/:id" element={<TaskDetailView />} />
          <Route path="materials" element={<MaterialsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* Legacy routes — accessible by URL, hidden from nav (Spec §3.6) */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="workbench" element={<CardsPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="topics" element={<TopicsPage />} />
          <Route path="materials/:id" element={<MaterialReaderPage />} />
          <Route path="rss" element={<RssPage />} />
          <Route path="rss/subscriptions/:id" element={<RssSubscriptionDetailPage />} />
          <Route path="sources" element={<SourcesPage />} />
          <Route path="ai-settings" element={<Navigate to="/settings?tab=ai" replace />} />
          <Route path="download" element={<Navigate to="/settings?tab=export" replace />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* 全局 Toast */}
      {toast && <Toast message={toast.message} type={toast.type} />}
    </ErrorBoundary>
  );
}

export default App;

