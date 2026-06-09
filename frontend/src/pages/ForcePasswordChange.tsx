import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Lock, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { validatePassword, getPasswordStrength } from '../utils/passwordValidator';

export default function ForcePasswordChange() {
  const navigate = useNavigate();
  const { updateUser } = useAuth();
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/api/auth/change-password', {
        currentPassword,
        newPassword
      });
      return res.data;
    },
    onSuccess: () => {
      updateUser({ passwordMustChange: false });
      navigate('/dashboard', { replace: true });
    },
    onError: (err: any) => {
      setPasswordError(err.response?.data?.error || err.response?.data?.message || '密码修改失败');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    
    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的新密码不一致');
      return;
    }
    
    const passwordCheck = validatePassword(newPassword);
    if (!passwordCheck.valid) {
      setPasswordError(passwordCheck.message);
      return;
    }
    
    changePasswordMutation.mutate();
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-background">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,var(--color-primary)_0%,transparent_34%)] opacity-10" />
      </div>

      <div className="relative z-10 w-full max-w-md px-4">
        <div className="bg-surface/95 backdrop-blur-2xl rounded-3xl p-8 border border-border shadow-2xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-yellow-500/30">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">需要修改密码</h1>
            <p className="text-slate-400 text-sm">首次登录，请修改初始密码</p>
          </div>

          <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <p className="text-yellow-200 text-sm">
              为了您的账户安全，修改密码后才能继续使用
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                当前密码
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="请输入当前密码"
                className="w-full px-4 py-3 bg-background border border-border rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/35 focus:border-yellow-500/45 transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                新密码
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="请输入新密码（至少8位）"
                className="w-full px-4 py-3 bg-background border border-border rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/45 transition-all"
                required
              />
              {newPassword && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">密码强度</span>
                    <span className={`text-xs font-medium ${getPasswordStrength(newPassword).color}`}>
                      {getPasswordStrength(newPassword).label}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className={`h-1.5 flex-1 rounded-full ${
                          i <= getPasswordStrength(newPassword).score
                            ? getPasswordStrength(newPassword).color.replace('text-', 'bg-')
                            : 'bg-white/10'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                确认新密码
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="请再次输入新密码"
                className="w-full px-4 py-3 bg-background border border-border rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/45 transition-all"
                required
              />
              {confirmPassword && newPassword && (
                <div className="mt-2 flex items-center gap-1 text-xs">
                  {newPassword === confirmPassword ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                      <span className="text-green-400">密码匹配</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4 text-red-400" />
                      <span className="text-red-400">密码不匹配</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {passwordError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-red-300 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {passwordError}
              </div>
            )}

            <button
              type="submit"
              disabled={changePasswordMutation.isPending}
              className="w-full py-3.5 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-black/25 hover:shadow-xl hover:shadow-black/35 transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2"
            >
              {changePasswordMutation.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  修改中...
                </>
              ) : (
                '修改密码并继续'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
