import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Scale, Mail, Lock, User, Loader2, ArrowRight, Ticket, CheckCircle, XCircle } from 'lucide-react';
import { useAuthStore, useUIStore } from '../lib/store';
import { invitesApi } from '../lib/api';

function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuthStore();
  const { showToast } = useUIStore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteCodeStatus, setInviteCodeStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!inviteCode || inviteCode.trim().length === 0) {
      setInviteCodeStatus(null);
      return;
    }

    const timer = setTimeout(async () => {
      setInviteCodeStatus('validating');
      try {
        const result = await invitesApi.validate(inviteCode.trim());
        if (result.ok && result.valid) {
          setInviteCodeStatus('valid');
        } else {
          setInviteCodeStatus('invalid');
        }
      } catch (error) {
        if (error.status === 404 || error.message?.includes('404')) {
          setInviteCodeStatus(null);
        } else {
          setInviteCodeStatus('invalid');
        }
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [inviteCode]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email || !password) {
      showToast('请填写邮箱和密码', 'error');
      return;
    }

    if (password !== confirmPassword) {
      showToast('两次输入的密码不一致', 'error');
      return;
    }

    if (password.length < 6) {
      showToast('密码至少需要 6 个字符', 'error');
      return;
    }

    if (inviteCode.trim() && inviteCodeStatus === 'invalid') {
      showToast('邀请码无效，请检查后重试', 'error');
      return;
    }

    setLoading(true);
    try {
      await register(email, password, name, inviteCode.trim() || undefined);
      showToast('注册成功，请登录', 'success');
      navigate('/login');
    } catch (error) {
      if (error.message?.includes('invite') || error.message?.includes('邀请码')) {
        showToast(error.message || '邀请码无效', 'error');
      } else {
        showToast(error.message || '注册失败', 'error');
      }
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

          {/* Register form */}
          <div
            className="card rounded-2xl shadow-xl p-8"
            style={{ background: 'var(--surface)', border: '1px solid var(--border-primary)' }}
          >
            <h2 className="text-xl font-semibold mb-6" style={{ color: 'var(--text-primary)' }}>
              创建账号
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  昵称 <span style={{ color: 'var(--text-tertiary)' }}>(可选)</span>
                </label>
                <div className="relative">
                  <User
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5"
                    style={{ color: 'var(--text-tertiary)' }}
                  />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="你的昵称"
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
                  邀请码 <span style={{ color: 'var(--error)' }}>*</span>
                </label>
                <div className="relative">
                  <Ticket
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5"
                    style={{
                      color: inviteCodeStatus === 'valid' ? 'var(--success)' :
                             inviteCodeStatus === 'invalid' ? 'var(--error)' :
                             'var(--text-tertiary)'
                    }}
                  />
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    placeholder="RC-XXXX-XXXX-XXXX"
                    className="input w-full pl-11 pr-10 py-3 rounded-xl"
                    style={{
                      ...(inviteCodeStatus === 'valid' ? {
                        borderColor: 'var(--success)',
                        background: 'var(--success-subtle)'
                      } : inviteCodeStatus === 'invalid' ? {
                        borderColor: 'var(--error)',
                        background: 'var(--error-subtle)'
                      } : {})
                    }}
                    disabled={loading}
                    required
                  />
                  {inviteCodeStatus === 'validating' && (
                    <Loader2
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 animate-spin"
                      style={{ color: 'var(--text-tertiary)' }}
                    />
                  )}
                  {inviteCodeStatus === 'valid' && (
                    <CheckCircle
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5"
                      style={{ color: 'var(--success)' }}
                    />
                  )}
                  {inviteCodeStatus === 'invalid' && (
                    <XCircle
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5"
                      style={{ color: 'var(--error)' }}
                    />
                  )}
                </div>
                {inviteCodeStatus === 'invalid' && (
                  <p className="mt-1.5 text-xs" style={{ color: 'var(--error)' }}>
                    邀请码无效或已过期
                  </p>
                )}
                {inviteCodeStatus === 'valid' && (
                  <p className="mt-1.5 text-xs" style={{ color: 'var(--success)' }}>
                    邀请码有效
                  </p>
                )}
              </div>

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
                    required
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
                    placeholder="至少 6 个字符"
                    className="input w-full pl-11 pr-4 py-3 rounded-xl"
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  确认密码
                </label>
                <div className="relative">
                  <Lock
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5"
                    style={{ color: 'var(--text-tertiary)' }}
                  />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="再次输入密码"
                    className="input w-full pl-11 pr-4 py-3 rounded-xl"
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 mt-6"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    创建账号
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <span style={{ color: 'var(--text-tertiary)' }}>已有账号？</span>
              <Link
                to="/login"
                className="font-medium ml-1 hover:underline"
                style={{ color: 'var(--accent-blue)' }}
              >
                立即登录
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RegisterPage;
