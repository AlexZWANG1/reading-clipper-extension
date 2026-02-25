import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Mail, Lock, Loader2, ArrowRight } from 'lucide-react';
import { useAuthStore, useUIStore } from '../lib/store';

function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const { showToast } = useUIStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email || !password) {
      showToast('请填写邮箱和密码', 'error');
      return;
    }

    setLoading(true);
    try {
      await login(email, password);
      showToast('登录成功', 'success');
      navigate('/');
    } catch (error) {
      showToast(error.message || '登录失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = { background: 'var(--surface-0)', border: '1px solid var(--stroke-0)', color: 'var(--text-0)' };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-base)' }}>
      {/* Decorative background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -right-1/2 w-full h-full rounded-full blur-3xl" style={{ background: 'rgba(99,102,241,0.08)' }} />
        <div className="absolute -bottom-1/2 -left-1/2 w-full h-full rounded-full blur-3xl" style={{ background: 'rgba(99,102,241,0.05)' }} />
      </div>

      <div className="flex-1 flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl shadow-lg mb-4" style={{ background: 'var(--accent-600)' }}>
              <BookOpen className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-0)' }}>Reading Clipper</h1>
            <p className="mt-1" style={{ color: 'var(--text-2)' }}>知识卡片管理平台</p>
          </div>

          {/* Login form */}
          <div className="rounded-2xl shadow-xl p-8" style={{ background: 'var(--surface-0)', border: '1px solid var(--stroke-0)' }}>
            <h2 className="text-xl font-semibold mb-6" style={{ color: 'var(--text-0)' }}>欢迎回来</h2>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-1)' }}>
                  邮箱地址
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--text-2)' }} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full pl-11 pr-4 py-3 rounded-xl input-focus"
                    style={inputStyle}
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-1)' }}>
                  密码
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--text-2)' }} />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-11 pr-4 py-3 rounded-xl input-focus"
                    style={inputStyle}
                    disabled={loading}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full font-medium py-3 px-4 rounded-xl transition-colors btn-press flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'var(--accent-600)', color: 'white' }}
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    登录
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <span style={{ color: 'var(--text-2)' }}>还没有账号？</span>
              <Link
                to="/register"
                className="font-medium ml-1"
                style={{ color: 'var(--accent-400)' }}
              >
                立即注册
              </Link>
            </div>
          </div>

          <p className="text-center text-sm mt-6" style={{ color: 'var(--text-2)' }}>
            登录即表示您同意我们的服务条款和隐私政策
          </p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;







