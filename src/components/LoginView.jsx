import React, { useState } from 'react';
import { Loader2, Mail, Lock, LogIn, ExternalLink } from 'lucide-react';
import { Button } from './Button';
import { Input } from './Input';
import { login } from '../api/auth';

export function LoginView({ onLoginSuccess }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            await login(email, password);
            onLoginSuccess?.();
        } catch (err) {
            setError(err.message || '登录失败，请检查邮箱和密码');
        } finally {
            setLoading(false);
        }
    };

    const openWebApp = () => {
        chrome.tabs.create({ url: 'http://localhost:5173/register' });
    };

    return (
        <div className="min-h-screen bg-surface-50 font-sans">
            {/* 背景效果 */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-primary-100/40 rounded-full blur-[100px] -z-10"></div>
            </div>

            <div className="px-5 py-6">
                {/* Logo 和标题 */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-50 rounded-2xl mb-4">
                        <LogIn className="w-8 h-8 text-primary-600" />
                    </div>
                    <h1 className="text-xl font-bold text-surface-900">Reading Clipper</h1>
                    <p className="text-sm text-surface-500 mt-1">登录以同步你的卡片</p>
                </div>

                {/* 登录表单 */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-surface-500 mb-2 uppercase tracking-wider">
                            邮箱
                        </label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                            <Input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="your@email.com"
                                required
                                className="pl-10"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-surface-500 mb-2 uppercase tracking-wider">
                            密码
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                            <Input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                className="pl-10"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
                            {error}
                        </div>
                    )}

                    <Button
                        type="submit"
                        variant="primary"
                        className="w-full h-11 text-base shadow-lg shadow-primary-500/20"
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                登录中...
                            </>
                        ) : (
                            '登录'
                        )}
                    </Button>
                </form>

                {/* 注册链接 */}
                <div className="mt-6 text-center">
                    <p className="text-sm text-surface-500">
                        还没有账号？
                    </p>
                    <button
                        onClick={openWebApp}
                        className="mt-2 inline-flex items-center text-sm text-primary-600 hover:text-primary-700 font-medium"
                    >
                        前往网页端注册
                        <ExternalLink className="w-3 h-3 ml-1" />
                    </button>
                </div>
            </div>
        </div>
    );
}
