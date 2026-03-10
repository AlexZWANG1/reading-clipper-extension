import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Scale, Mail, Lock, Loader2, ArrowRight } from 'lucide-react';
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

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-base)' }}>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-8">
            <div
              className="inline-flex items-center justify-center w-16 h-16 rounded-2xl shadow-lg mb-4"
              style={{ background: 'var(--interactive-primary)' }}
            >
              <Scale className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Verity
            </h1>
            <p className="mt-1" style={{ color: 'var(--text-tertiary)' }}>
              求真 · 研究验证工具
            </p>
          </div>

          {/* Login form */}
          <div
            className="card rounded-2xl shadow-xl p-8"
            style={{ background: 'var(--surface)', border: '1px solid var(--border-primary)' }}
          >
            <h2 className="text-xl font-semibold mb-6" style={{ color: 'var(--text-primary)' }}>
              欢迎回来
            </h2>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  邮箱地址
                </label>
                <div className="relative">
                  <Mail
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5"
                    style={{ color: 'var(--text-tertiary)' }}
                  />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="input w-full pl-11 pr-4 py-3 rounded-xl"
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  密码
                </label>
                <div className="relative">
                  <Lock
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5"
                    style={{ color: 'var(--text-tertiary)' }}
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input w-full pl-11 pr-4 py-3 rounded-xl"
                    disabled={loading}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2"
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
              <span style={{ color: 'var(--text-tertiary)' }}>还没有账号？</span>
              <Link
                to="/register"
                className="font-medium ml-1 hover:underline"
                style={{ color: 'var(--accent-blue)' }}
              >
                立即注册
              </Link>
            </div>
          </div>

          <p className="text-center text-sm mt-6" style={{ color: 'var(--text-tertiary)' }}>
            登录即表示您同意我们的服务条款和隐私政策
          </p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
