import { useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore, useUIStore } from './lib/store';

// 页面组件
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import CardsPage from './pages/CardsPage';
import TopicsPage from './pages/TopicsPage';
import SourcesPage from './pages/SourcesPage';
import AISettingsPage from './pages/AISettingsPage';
import DownloadPage from './pages/DownloadPage';
import ChatPage from './pages/ChatPage';
import MaterialsPage from './pages/MaterialsPage';

// Lazy load ThinkingBoardPage (heavy: React Flow + dagre)
const ThinkingBoardPage = lazy(() => import('./pages/ThinkingBoardPage'));

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
          <div className="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin" />
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
          <div className="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin" />
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
    <>
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

        {/* 受保护的路由 */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<TopicsPage />} />
          <Route path="cards" element={<CardsPage />} />
          <Route path="materials" element={<MaterialsPage />} />
          <Route path="topics" element={<TopicsPage />} />
          <Route path="topics/:topicId" element={<Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}><ThinkingBoardPage /></Suspense>} />
          <Route path="sources" element={<SourcesPage />} />
          <Route path="ai-settings" element={<AISettingsPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="download" element={<DownloadPage />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* 全局 Toast */}
      {toast && <Toast message={toast.message} type={toast.type} />}
    </>
  );
}

export default App;



