import React, { useState } from 'react';
import { Database, ShieldCheck, Sparkles, Cpu, ArrowRight, KeyRound, CheckCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { api } from '../api.js';

export const AuthPage: React.FC = () => {
  const { login, guestLogin, setAuthenticatedUser } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'otp'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpMessage, setOtpMessage] = useState('');
  const [previewOtp, setPreviewOtp] = useState<string | undefined>(undefined);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(email, password);
      } else if (mode === 'register') {
        const res = await api.register(name, email, password);
        setOtpMessage(res.message || 'OTP verification code sent.');
        if (res.previewOtp) setPreviewOtp(res.previewOtp);
        setMode('otp');
      } else if (mode === 'otp') {
        const res = await api.verifyOtp(email, otpCode);
        if (res.token && res.user) {
          setAuthenticatedUser(res.user, res.token);
        } else {
          // If token wasn't issued in verify, attempt login
          await login(email, password);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await api.sendOtp(email);
      setOtpMessage(res.message);
      if (res.previewOtp) setPreviewOtp(res.previewOtp);
    } catch (err: any) {
      setError(err.message || 'Resend OTP failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = async () => {
    setError('');
    setLoading(true);
    try {
      await guestLogin();
    } catch (err: any) {
      setError(err.message || 'Guest login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-sky-500/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-md relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 mx-auto mb-4 shadow-lg shadow-sky-500/5">
            <Database className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">AI Powered Database Reviewer</h1>
          <p className="text-sm text-slate-400 mt-1">
            Autonomous schema auditing, security scanning & SQL optimization
          </p>
        </div>

        {/* Guest Fast Track Banner */}
        <div className="mb-6 p-4 rounded-xl bg-sky-950/40 border border-sky-800/40">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-sky-300 uppercase tracking-wider">Demonstration Mode</h4>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Evaluating the platform? Enter instantly with a demo guest account:
              </p>
              <button
                id="btn-guest-login"
                type="button"
                onClick={handleGuest}
                disabled={loading}
                className="mt-3 w-full py-2 px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm disabled:opacity-50"
              >
                <span>Launch Demo Account (Guest User)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Auth Form Box */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl backdrop-blur-xl">
          {/* Mode Selector */}
          {mode !== 'otp' && (
            <div className="flex border-b border-slate-800 mb-5">
              <button
                onClick={() => { setMode('login'); setError(''); }}
                className={`flex-1 pb-3 text-xs font-semibold text-center transition-colors relative ${
                  mode === 'login' ? 'text-sky-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sign In
                {mode === 'login' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-400"></span>
                )}
              </button>
              <button
                onClick={() => { setMode('register'); setError(''); }}
                className={`flex-1 pb-3 text-xs font-semibold text-center transition-colors relative ${
                  mode === 'register' ? 'text-sky-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Register New Account
                {mode === 'register' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-400"></span>
                )}
              </button>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
              {error}
            </div>
          )}

          {otpMessage && mode === 'otp' && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2">
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p>{otpMessage}</p>
                {previewOtp && (
                  <p className="font-mono text-xs mt-1 text-emerald-200 font-bold">
                    Dev Code: <span className="bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-700">{previewOtp}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Alex Johnson"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                />
              </div>
            )}

            {mode !== 'otp' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </>
            )}

            {mode === 'otp' && (
              <div className="space-y-3">
                <div className="text-center py-2">
                  <KeyRound className="w-8 h-8 text-sky-400 mx-auto mb-2" />
                  <h3 className="text-sm font-bold text-slate-100">Enter Verification Code</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Enter 6-digit OTP code sent to <strong>{email}</strong></p>
                </div>

                <div>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={otpCode}
                    onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-full tracking-[12px] text-center text-lg font-mono font-bold px-3 py-2.5 rounded-lg bg-slate-950 border border-sky-500/50 text-sky-300 focus:outline-none focus:border-sky-400"
                  />
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <button
                    type="button"
                    onClick={() => setMode('register')}
                    className="text-slate-400 hover:text-slate-200"
                  >
                    &larr; Back
                  </button>
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={loading}
                    className="text-sky-400 hover:text-sky-300 font-semibold"
                  >
                    Resend Code
                  </button>
                </div>
              </div>
            )}

            <button
              id="btn-auth-submit"
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-slate-100 hover:bg-white text-slate-950 text-xs font-bold transition-colors disabled:opacity-50 mt-2"
            >
              {loading
                ? 'Processing...'
                : mode === 'login'
                ? 'Sign In to Workspace'
                : mode === 'register'
                ? 'Send Verification OTP'
                : 'Verify Code & Access Workspace'}
            </button>
          </form>
        </div>

        {/* Feature Highlights Footer */}
        <div className="mt-8 flex items-center justify-center gap-6 text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-sky-400" />
            <span>Ollama RAG AI</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Secure Encryption</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-amber-400" />
            <span>Real DB Connectors</span>
          </div>
        </div>
      </div>
    </div>
  );
};
