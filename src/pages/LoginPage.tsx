import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { attemptLogin, setAuthSession, isAuthenticated } from '../lib/authSession';

export function LoginPage() {
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  // If already authenticated, go directly home
  useEffect(() => {
    if (isAuthenticated()) navigate('/', { replace: true });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginId.trim() || !password) {
      setError('Please enter your username and password.');
      triggerShake();
      return;
    }
    setLoading(true);
    setError(null);

    const result = await attemptLogin(loginId, password);
    setLoading(false);

    if (result.success === false) {
      setError(result.error);
      triggerShake();
      return;
    }

    // Store full session
    setAuthSession(result.user);

    // Navigate — ChangePasswordModal on HomePage will intercept if temp password
    navigate('/', { replace: true });
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, hsl(210,55%,91%) 0%, hsl(215,65%,82%) 50%, hsl(220,70%,76%) 100%)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'Inter', sans-serif",
      overflow: 'hidden',
    }}>

      {/* Main Content — Split Layout */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 540px', minHeight: 0 }}>

        {/* ===== LEFT PANEL — Brand ===== */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem 2rem 2rem 3rem',
        }}>
          <img
            src="/logos/Login left Main Logo.png"
            alt="CLINIcare Pro — Integrated Health Care Solutions"
            style={{
              width: 'min(600px, 82%)',
              objectFit: 'contain',
              filter: 'drop-shadow(0 6px 20px rgba(0,40,120,0.14))',
            }}
          />
        </div>

        {/* ===== RIGHT PANEL — Login ===== */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          justifyContent: 'center',
          padding: '2rem 3rem 2rem 1rem',
        }}>

          {/* Glass Card */}
          <div
            style={{
              background: 'rgba(255,255,255,0.62)',
              backdropFilter: 'blur(16px) saturate(160%)',
              WebkitBackdropFilter: 'blur(16px) saturate(160%)',
              borderRadius: '1.75rem',
              border: '1px solid rgba(255,255,255,0.45)',
              boxShadow: '0 20px 60px rgba(0,40,120,0.14), 0 2px 8px rgba(0,0,0,0.06)',
              padding: '2.75rem 3rem',
              width: '100%',
              maxWidth: '460px',
              transition: 'transform 0.15s ease',
              animation: shake ? 'shake 0.4s ease' : 'none',
            }}
          >
            {/* Icon */}
            <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
              <img
                src="/logos/Figure Transparent only.png"
                alt="CLINIcare"
                style={{ height: '64px', width: '64px', objectFit: 'contain', margin: '0 auto 0.875rem' }}
              />
              <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'hsl(220,40%,22%)', margin: '0 0 0.3rem' }}>
                Welcome Back
              </h1>
              <p style={{ fontSize: '0.8rem', color: 'hsl(220,30%,46%)', margin: 0 }}>
                Securely access your CLINICare Pro dashboard.
              </p>
            </div>

            {/* Error Banner */}
            {error && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.6rem',
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '0.75rem', padding: '0.75rem 1rem',
                marginBottom: '1.25rem',
                color: 'hsl(0,70%,40%)', fontSize: '0.8rem', fontWeight: 600,
              }}>
                <ShieldAlert size={16} style={{ shrink: 0 }} />
                {error}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              {/* Username */}
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)',
                  fontSize: '1rem', color: 'hsl(220,30%,55%)', pointerEvents: 'none',
                }}>
                  👤
                </span>
                <input
                  type="text"
                  placeholder="Username"
                  value={loginId}
                  onChange={e => setLoginId(e.target.value)}
                  autoComplete="username"
                  style={inputStyle}
                />
              </div>

              {/* Password */}
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)',
                  fontSize: '1rem', color: 'hsl(220,30%,55%)', pointerEvents: 'none',
                }}>
                  🔒
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  style={{ ...inputStyle, paddingRight: '3rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  style={{
                    position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'hsl(220,30%,55%)', display: 'flex', alignItems: 'center',
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {/* Remember + Forgot */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'hsl(220,30%,46%)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                    style={{ accentColor: 'hsl(220,72%,54%)', width: 14, height: 14 }}
                  />
                  Remember me
                </label>
                <a href="#" style={{ color: 'hsl(270,60%,58%)', fontWeight: 600, textDecoration: 'none', fontSize: '0.78rem' }}>
                  Forgot password?
                </a>
              </div>

              {/* Sign In Button */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '0.9rem',
                  background: loading ? 'hsl(220,72%,65%)' : 'hsl(220,72%,54%)',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  border: 'none',
                  borderRadius: '0.875rem',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 16px hsla(220,72%,54%,0.4)',
                  transition: 'background 0.2s, box-shadow 0.2s, transform 0.1s',
                  letterSpacing: '0.02em',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                }}
              >
                {loading ? (
                  <>
                    <span style={{
                      width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)',
                      borderTop: '2px solid white', borderRadius: '50%',
                      display: 'inline-block', animation: 'spin 0.8s linear infinite',
                    }} />
                    Verifying...
                  </>
                ) : 'Sign In'}
              </button>
            </form>

            {/* Support */}
            <p style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.75rem', color: 'hsl(220,30%,52%)' }}>
              Need help?{' '}
              <a href="#" style={{ color: 'hsl(270,60%,58%)', fontWeight: 600, textDecoration: 'none' }}>Contact Support</a>
            </p>

          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '0.75rem 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '0.68rem',
        color: 'hsl(220,30%,50%)',
        borderTop: '1px solid rgba(255,255,255,0.3)',
        background: 'rgba(255,255,255,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <img src="/logos/Figure Transparent only.png" alt="" style={{ height: 16, opacity: 0.6 }} />
          <span>© 2025 CLINICare Pro Solutions. All rights reserved.</span>
          <span style={{ margin: '0 0.4rem' }}>|</span>
          <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>Privacy Policy</a>
        </div>
        <p style={{ margin: 0 }}>Authorized access only. Activity may be monitored.</p>
      </div>

      {/* Keyframe Animations */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%       { transform: translateX(-8px); }
          40%       { transform: translateX(8px); }
          60%       { transform: translateX(-5px); }
          80%       { transform: translateX(5px); }
        }
        input:focus { outline: none; box-shadow: 0 0 0 3px hsla(220,72%,54%,0.2); border-color: hsl(220,72%,54%) !important; background: rgba(255,255,255,0.85) !important; }
        @media (max-width: 768px) {
          .login-grid { grid-template-columns: 1fr !important; }
          .left-panel { display: none !important; }
        }
      `}</style>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.75rem 0.875rem 0.75rem 2.6rem',
  background: 'rgba(255,255,255,0.6)',
  border: '1px solid hsl(220,30%,72%)',
  borderRadius: '0.75rem',
  color: 'hsl(220,40%,22%)',
  fontSize: '0.9rem',
  fontFamily: "'Inter', sans-serif",
  transition: 'all 0.2s',
  boxSizing: 'border-box' as const,
};
