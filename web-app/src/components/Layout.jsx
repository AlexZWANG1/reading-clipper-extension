import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  CreditCard,
  Folder,
  LogOut,
  Menu,
  X,
  User,
  BookOpen,
  Globe,
  Download,
  Sparkles,
} from 'lucide-react';
import { useAuthStore, useUIStore } from '../lib/store';

const navItems = [
  { to: '/', icon: Folder, label: 'Topics', end: true },
  { to: '/cards', icon: CreditCard, label: '全部卡片' },
  { to: '/sources', icon: Globe, label: '信息源' },
];

const userItems = [
  { to: '/ai-settings', icon: Sparkles, label: 'AI 设置' },
  { to: '/download', icon: Download, label: '下载' },
];

function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { sidebarOpen, toggleSidebar } = useUIStore();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Check if we are on a "full screen" page (like the board canvas)
  // Matches /boards/:id but NOT /boards (list view)
  const isFullScreenPage = /^\/topics\/[^/]+$/.test(location.pathname);

  return (
    <div className="h-screen bg-surface-50 flex flex-col lg:flex-row overflow-hidden">
      {/* 移动端顶部栏 */}
      <header className="lg:hidden flex-none fixed top-0 left-0 right-0 h-14 bg-white border-b border-surface-200 z-50 flex items-center px-4">
        <button
          onClick={toggleSidebar}
          className="p-2 -ml-2 text-surface-600 hover:bg-surface-100 rounded-lg"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex-1 flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-primary-600 mr-2" />
          <span className="font-semibold text-surface-900">Reading Clipper</span>
        </div>
        <div className="w-9" /> {/* 占位 */}
      </header>

      {/* 侧边栏遮罩 */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/30 z-40"
          onClick={toggleSidebar}
        />
      )}

      {/* 侧边栏 */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 w-64 bg-white border-r border-surface-200 z-50 transform transition-transform duration-200 ease-out flex-none flex flex-col ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
      >
        {/* Logo */}
        <div className="h-16 flex-none flex items-center px-5 border-b border-surface-100">
          <BookOpen className="w-7 h-7 text-primary-600 mr-2.5" />
          <span className="text-lg font-bold text-surface-900">Reading Clipper</span>
          <button
            onClick={toggleSidebar}
            className="lg:hidden ml-auto p-1.5 text-surface-400 hover:text-surface-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 导航 */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => window.innerWidth < 1024 && toggleSidebar()}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isActive
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              {label}
            </NavLink>
          ))}

          {/* 分隔线 */}
          <div className="pt-3 mt-3 border-t border-surface-100">
            <p className="px-3 py-1 text-xs text-surface-400 font-medium">个人</p>
          </div>

          {/* 用户菜单 */}
          {userItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => window.innerWidth < 1024 && toggleSidebar()}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isActive
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* 用户信息 */}
        <div className="flex-none p-3 border-t border-surface-100">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-50">
            <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center">
              <User className="w-5 h-5 text-primary-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-surface-900 truncate">
                {user?.name || user?.email?.split('@')[0]}
              </p>
              <p className="text-xs text-surface-500 truncate">{user?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-surface-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="退出登录"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className={`flex-1 flex flex-col min-w-0 overflow-hidden ${isFullScreenPage ? '' : 'pt-14 lg:pt-0'}`}>
        {isFullScreenPage ? (
          /* Full Screen Layout (for Canvas) - No padding, full height */
          <div className="flex-1 h-full relative">
            <Outlet />
          </div>
        ) : (
          /* Standard Layout (for Dashboard) - With padding and max-width */
          <div className="flex-1 overflow-y-auto p-4 lg:p-6">
            <div className="max-w-7xl mx-auto">
              <Outlet />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default Layout;
