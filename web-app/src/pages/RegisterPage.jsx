import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Mail, Lock, User, Loader2, ArrowRight, Ticket, CheckCircle, XCircle } from 'lucide-react';
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
  const [inviteCodeStatus, setInviteCodeStatus] = useState(null); // null, 'validating', 'valid', 'invalid'
  const [loading, setLoading] = useState(false);

  // 验证邀请码
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
        // 如果是local mode，可能没有邀请码API，允许继续
        if (error.status === 404 || error.message?.includes('404')) {
          setInviteCodeStatus(null); // Local mode下忽略邀请码验证
        } else {
          setInviteCodeStatus('invalid');
        }
      }
    }, 500); // 防抖

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

    // 检查邀请码（如果正在验证或无效）
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
      // 如果是邀请码错误，显示更友好的提示
      if (error.message?.includes('invite') || error.message?.includes('邀请码')) {
        showToast(error.message || '邀请码无效', 'error');
      } else {
        showToast(error.message || '注册失败', 'error');
      }
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

          {/* Register form */}
          <div className="rounded-2xl shadow-xl p-8" style={{ background: 'var(--surface-0)', border: '1px solid var(--stroke-0)' }}>
            <h2 className="text-xl font-semibold mb-6" style={{ color: 'var(--text-0)' }}>创建账号</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-1)' }}>
                  昵称 <span style={{ color: 'var(--text-2)' }}>(可选)</span>
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--text-2)' }} />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="你的昵称"
                    className="w-full pl-11 pr-4 py-3 rounded-xl input-focus"
                    style={inputStyle}
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-1)' }}>
                  邀请码 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Ticket className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: inviteCodeStatus === 'valid' ? '#34D399' : inviteCodeStatus === 'invalid' ? '#FB7185' : 'var(--text-2)' }} />
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    placeholder="RC-XXXX-XXXX-XXXX"
                    className="w-full pl-11 pr-10 py-3 rounded-xl input-focus"
                    style={{
                      ...inputStyle,
                      ...(inviteCodeStatus === 'valid' ? { borderColor: '#34D399', background: 'rgba(52,211,153,0.05)' } :
                        inviteCodeStatus === 'invalid' ? { borderColor: '#FB7185', background: 'rgba(251,113,133,0.05)' } : {})
                    }}
                    disabled={loading}
                    required
                  />
                  {inviteCodeStatus === 'validating' && (
                    <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 animate-spin" style={{ color: 'var(--text-2)' }} />
                  )}
                  {inviteCodeStatus === 'valid' && (
                    <CheckCircle className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: '#34D399' }} />
                  )}
                  {inviteCodeStatus === 'invalid' && (
                    <XCircle className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: '#FB7185' }} />
                  )}
                </div>
                {inviteCodeStatus === 'invalid' && (
                  <p className="mt-1.5 text-xs" style={{ color: '#FB7185' }}>邀请码无效或已过期</p>
                )}
                {inviteCodeStatus === 'valid' && (
                  <p className="mt-1.5 text-xs" style={{ color: '#34D399' }}>邀请码有效</p>
                )}
              </div>

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
                    required
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
                    placeholder="至少 6 个字符"
                    className="w-full pl-11 pr-4 py-3 rounded-xl input-focus"
                    style={inputStyle}
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-1)' }}>
                  确认密码
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--text-2)' }} />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="再次输入密码"
                    className="w-full pl-11 pr-4 py-3 rounded-xl input-focus"
                    style={inputStyle}
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full font-medium py-3 px-4 rounded-xl transition-colors btn-press flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-6"
                style={{ background: 'var(--accent-600)', color: 'white' }}
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
              <span style={{ color: 'var(--text-2)' }}>已有账号？</span>
              <Link
                to="/login"
                className="font-medium ml-1"
                style={{ color: 'var(--accent-400)' }}
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






