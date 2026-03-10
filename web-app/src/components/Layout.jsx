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
  MessageCircle,
  FileText,
  Layout as LayoutIcon,
  Scale,
  ListChecks,
  Rss,
} from 'lucide-react';
import { useAuthStore, useUIStore } from '../lib/store';

// 四组导航结构
const navGroups = [
  {
    title: 'Reader',
    items: [
      { to: '/materials', icon: FileText, label: '来源库' },
      { to: '/rss', icon: Rss, label: 'RSS 订阅' },
      { to: '/sources', icon: Globe, label: '信息源' },
    ],
  },
  {
    title: 'Workbench',
    items: [
      { to: '/', icon: LayoutIcon, label: '工作台', end: true },
    ],
  },
  {
    title: 'Copilot',
    items: [
      { to: '/chat', icon: MessageCircle, label: 'AI 对话' },
      { to: '/tasks', icon: ListChecks, label: '研究任务' },
    ],
  },
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

  const isFullScreenPage = /^\/$|^\/topics\/[^/]+$|^\/cards$/.test(location.pathname);

  return (
    <div className="h-screen flex flex-col lg:flex-row overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      {/* Mobile header */}
      <header
        className="lg:hidden flex-none fixed top-0 left-0 right-0 h-14 z-50 flex items-center px-4"
        style={{
          background: 'rgba(255,255,255,0.78)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid var(--border-primary)',
        }}
      >
        <button
          onClick={toggleSidebar}
          className="p-2 -ml-2 rounded-lg transition-colors"
          aria-label="Open navigation menu"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex-1 flex items-center justify-center">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center mr-2"
            style={{ background: 'linear-gradient(135deg, var(--accent-500), var(--accent-600))' }}
          >
            <Scale className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>Verity</span>
        </div>
        <div className="w-9" />
      </header>

      {/* Sidebar overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 w-64 z-50 transform transition-transform duration-200 ease-out flex-none flex flex-col ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
        style={{
          background: 'rgba(255,255,255,0.82)',
          backdropFilter: 'blur(10px)',
          borderRight: '1px solid var(--border-primary)',
        }}
      >
        {/* Logo */}
        <div className="h-16 flex-none flex items-center px-5" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center mr-2.5"
            style={{ background: 'linear-gradient(135deg, var(--accent-500), var(--accent-600))' }}
          >
            <Scale className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <span className="text-lg font-bold leading-none block tracking-tight" style={{ color: 'var(--text-primary)' }}>Verity</span>
            <span className="text-[11px] tracking-[0.08em] uppercase" style={{ color: 'var(--text-tertiary)' }}>Evidence Studio</span>
          </div>
          <button
            onClick={toggleSidebar}
            className="lg:hidden ml-auto p-1.5 transition-colors"
            aria-label="Close navigation menu"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navGroups.map((group, groupIndex) => (
            <div key={group.title}>
              {groupIndex > 0 && (
                <div className="pt-3 mt-3" style={{ borderTop: '1px solid var(--border-secondary)' }} />
              )}
              <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--text-tertiary)' }}>
                {group.title}
              </p>
              {group.items.map(({ to, icon: Icon, label, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => window.innerWidth < 1024 && toggleSidebar()}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all`
                  }
                  style={({ isActive }) => ({
                    background: isActive
                      ? 'linear-gradient(135deg, rgba(13,110,253,0.12), rgba(31,58,95,0.14))'
                      : 'transparent',
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    border: isActive ? '1px solid rgba(31,58,95,0.22)' : '1px solid transparent',
                    transform: isActive ? 'translateX(2px)' : 'none',
                  })}
                >
                  <Icon className="w-5 h-5" />
                  {label}
                </NavLink>
              ))}
            </div>
          ))}

          {/* Divider */}
          <div className="pt-3 mt-3" style={{ borderTop: '1px solid var(--border-secondary)' }}>
            <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--text-tertiary)' }}>Settings</p>
          </div>

          {userItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => window.innerWidth < 1024 && toggleSidebar()}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={({ isActive }) => ({
                background: isActive
                  ? 'linear-gradient(135deg, rgba(13,110,253,0.12), rgba(31,58,95,0.14))'
                  : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: isActive ? '1px solid rgba(31,58,95,0.22)' : '1px solid transparent',
                transform: isActive ? 'translateX(2px)' : 'none',
              })}
            >
              <Icon className="w-5 h-5" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User info */}
        <div className="flex-none p-3" style={{ borderTop: '1px solid var(--border-secondary)' }}>
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.72)', border: '1px solid var(--border-primary)' }}>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: 'var(--bg-muted)' }}
            >
              <User className="w-5 h-5" style={{ color: 'var(--text-primary)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                {user?.name || user?.email?.split('@')[0]}
              </p>
              <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>{user?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg transition-colors"
              aria-label="Log out"
              style={{ color: 'var(--text-tertiary)' }}
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className={`flex-1 flex flex-col min-w-0 overflow-hidden ${isFullScreenPage ? '' : 'pt-14 lg:pt-0'}`}>
        {isFullScreenPage ? (
          <div className="flex-1 h-full relative">
            <Outlet />
          </div>
        ) : (
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
