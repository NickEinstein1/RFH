import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { AuthFrame, PasswordHint } from '../components/AuthFrame';

export function LoginPage() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [resetMsg, setResetMsg] = useState('');

  useEffect(() => {
    const existing = document.querySelector(`link[data-rfh-hero="auth"]`);
    if (existing) return;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = '/images/rfh-login-care-hero.jpg';
    link.setAttribute('data-rfh-hero', 'auth');
    document.head.appendChild(link);
    return () => {
      link.remove();
    };
  }, []);

  if (user) return <Navigate to="/today" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setResetMsg('');
    try {
      const normalized = email.trim().toLowerCase();
      if (mode === 'reset') {
        await api('/auth/password-reset/request', {
          method: 'POST',
          body: JSON.stringify({ email: normalized }),
        });
        setResetMsg(
          'If an account exists for that email, a reset link was sent (or logged when SMTP is off).',
        );
      } else {
        await login(normalized, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame visualLine="Sign in with the email on your facility account.">
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <Link to="/" className="auth-back">
          ← RFH Care
        </Link>
        <h1 className="auth-form-title">{mode === 'login' ? 'Sign in' : 'Reset password'}</h1>
        <p className="auth-form-lede">
          {mode === 'login'
            ? 'Your email opens the correct home. Multi-home owners switch facilities after sign-in.'
            : 'We’ll email a reset link if that address is registered.'}
        </p>

        {error ? (
          <div className="error" role="alert">
            {error}
          </div>
        ) : null}
        {resetMsg ? (
          <div className="toast toast-success" role="status">
            {resetMsg}
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            placeholder="you@yourfacility.com"
            required
            autoFocus
          />
        </div>
        {mode === 'login' ? (
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              minLength={8}
            />
          </div>
        ) : null}

        <div className="login-actions">
          <button className="btn login-submit" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Send reset link'}
          </button>
          <button
            className="btn ghost"
            type="button"
            onClick={() => {
              setMode((m) => (m === 'login' ? 'reset' : 'login'));
              setError('');
              setResetMsg('');
            }}
          >
            {mode === 'login' ? 'Forgot password?' : 'Back to sign in'}
          </button>
          {mode === 'login' ? <PasswordHint /> : null}
          <p className="auth-switch">
            New home? <Link to="/signup">Create an account</Link>
          </p>
        </div>
      </form>
    </AuthFrame>
  );
}
