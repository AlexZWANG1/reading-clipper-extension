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

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-surface-50 flex flex-col">
      {/* 装饰背景 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-primary-100/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-primary-200/20 rounded-full blur-3xl" />
      </div>

      <div className="flex-1 flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-2xl shadow-lg shadow-primary-500/30 mb-4">
              <BookOpen className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-surface-900">Reading Clipper</h1>
            <p className="text-surface-500 mt-1">知识卡片管理平台</p>
          </div>

          {/* 注册表单 */}
          <div className="bg-white rounded-2xl shadow-xl shadow-surface-900/5 p-8 border border-surface-100">
            <h2 className="text-xl font-semibold text-surface-900 mb-6">创建账号</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1.5">
                  昵称 <span className="text-surface-400">(可选)</span>
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-400" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="你的昵称"
                    className="w-full pl-11 pr-4 py-3 bg-surface-50 border border-surface-200 rounded-xl text-surface-900 placeholder-surface-400 input-focus"
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1.5">
                  邀请码 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Ticket className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 ${
                    inviteCodeStatus === 'valid' ? 'text-green-500' :
                    inviteCodeStatus === 'invalid' ? 'text-red-500' :
                    'text-surface-400'
                  }`} />
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    placeholder="RC-XXXX-XXXX-XXXX"
                    className={`w-full pl-11 pr-10 py-3 bg-surface-50 border rounded-xl text-surface-900 placeholder-surface-400 input-focus ${
                      inviteCodeStatus === 'valid' ? 'border-green-300 bg-green-50/50' :
                      inviteCodeStatus === 'invalid' ? 'border-red-300 bg-red-50/50' :
                      'border-surface-200'
                    }`}
                    disabled={loading}
                    required
                  />
                  {inviteCodeStatus === 'validating' && (
                    <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-400 animate-spin" />
                  )}
                  {inviteCodeStatus === 'valid' && (
                    <CheckCircle className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
                  )}
                  {inviteCodeStatus === 'invalid' && (
                    <XCircle className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-red-500" />
                  )}
                </div>
                {inviteCodeStatus === 'invalid' && (
                  <p className="mt-1.5 text-xs text-red-600">邀请码无效或已过期</p>
                )}
                {inviteCodeStatus === 'valid' && (
                  <p className="mt-1.5 text-xs text-green-600">邀请码有效</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1.5">
                  邮箱地址
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full pl-11 pr-4 py-3 bg-surface-50 border border-surface-200 rounded-xl text-surface-900 placeholder-surface-400 input-focus"
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1.5">
                  密码
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="至少 6 个字符"
                    className="w-full pl-11 pr-4 py-3 bg-surface-50 border border-surface-200 rounded-xl text-surface-900 placeholder-surface-400 input-focus"
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1.5">
                  确认密码
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-400" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="再次输入密码"
                    className="w-full pl-11 pr-4 py-3 bg-surface-50 border border-surface-200 rounded-xl text-surface-900 placeholder-surface-400 input-focus"
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-3 px-4 rounded-xl transition-colors btn-press flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-6"
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
              <span className="text-surface-500">已有账号？</span>
              <Link
                to="/login"
                className="text-primary-600 hover:text-primary-700 font-medium ml-1"
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






