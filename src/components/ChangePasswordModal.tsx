import React, { useState } from 'react';
import { Key, Eye, EyeOff, Check, ShieldAlert } from 'lucide-react';
import { changePassword } from '../lib/userStorage';
import { getAuthSession, setAuthSession } from '../lib/authSession';

interface ChangePasswordModalProps {
  userId: string;
  onComplete: () => void;
}

export function ChangePasswordModal({ userId, onComplete }: ChangePasswordModalProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const rules = [
    { label: 'At least 8 characters', ok: newPassword.length >= 8 },
    { label: 'Contains uppercase letter', ok: /[A-Z]/.test(newPassword) },
    { label: 'Contains number', ok: /[0-9]/.test(newPassword) },
    { label: 'Passwords match', ok: newPassword.length > 0 && newPassword === confirmPassword },
  ];
  const allPassed = rules.every(r => r.ok);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allPassed) {
      setError('Please ensure all password requirements are met.');
      return;
    }
    setError(null);

    await changePassword(userId, newPassword);

    const session = getAuthSession();
    if (session) setAuthSession(session);

    setSaved(true);
    setTimeout(() => onComplete(), 1200);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-7 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Set New Password</h2>
              <p className="text-amber-100 text-sm">Your account was assigned a temporary password.</p>
            </div>
          </div>
          <p className="text-[11px] text-amber-100/80 mt-3 leading-relaxed">
            You must set a new secure password before accessing the system. This is a one-time requirement.
          </p>
        </div>

        {/* Form */}
        <div className="p-7">
          {saved ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                <Check className="w-7 h-7 text-emerald-600" />
              </div>
              <p className="font-bold text-slate-800 dark:text-slate-200 text-lg">Password Updated!</p>
              <p className="text-slate-500 text-sm text-center">Redirecting you to the system...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              {/* New Password */}
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wider">New Password</label>
                <div className="relative">
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full px-4 py-3 pr-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm font-medium focus:outline-none focus:border-[#2960DC] focus:ring-2 focus:ring-[#2960DC]/20 transition-all"
                  />
                  <button type="button" onClick={() => setShowNew(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Confirm Password</label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full px-4 py-3 pr-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm font-medium focus:outline-none focus:border-[#2960DC] focus:ring-2 focus:ring-[#2960DC]/20 transition-all"
                  />
                  <button type="button" onClick={() => setShowConfirm(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Rules */}
              <div className="grid grid-cols-2 gap-1.5">
                {rules.map(rule => (
                  <div key={rule.label} className={`flex items-center gap-1.5 text-xs font-medium ${rule.ok ? 'text-emerald-600' : 'text-slate-400'}`}>
                    <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${rule.ok ? 'bg-emerald-100' : 'bg-slate-100 dark:bg-slate-800'}`}>
                      {rule.ok && <Check className="w-2 h-2 text-emerald-600" />}
                    </div>
                    {rule.label}
                  </div>
                ))}
              </div>

              <button
                type="submit"
                disabled={!allPassed}
                className="w-full py-3 bg-[#2960DC] text-white font-bold rounded-xl hover:bg-[#1a3fa8] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-blue-200 dark:shadow-none text-sm"
              >
                Save Password & Continue
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
