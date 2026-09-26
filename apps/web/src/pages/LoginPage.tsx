import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';

const HERO_SRC = '/images/rfh-login-care-hero.jpg';

export function LoginPage() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [resetMsg, setResetMsg] = useState('');
  const [heroReady, setHeroReady] = useState(false);
  const [heroFailed, setHeroFailed] = useState(false);

  useEffect(() => {
    const existing = document.querySelector(`link[data-rfh-hero="login"]`);
    if (existing) return;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = HERO_SRC;
    link.setAttribute('data-rfh-hero', 'login');
    document.head.appendChild(link);
    return () => {
      link.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.decoding = 'async';
    img.fetchPriority = 'high';
    img.onload = () => {
      if (!cancelled) {
        setHeroReady(true);
        setHeroFailed(false);
      }
    };
    img.onerror = () => {
      if (!cancelled) {
        setHeroFailed(true);
        setHeroReady(false);
      }
    };
    img.src = HERO_SRC;
    if (img.complete && img.naturalWidth > 0) {
      setHeroReady(true);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  if (user) return <Navigate to="/today" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setResetMsg('');
    try {
      if (mode === 'reset') {
        await api('/auth/password-reset/request', {
          method: 'POST',
          body: JSON.stringify({ email }),
        });
        setResetMsg(
          'If an account exists for that email, a reset link was sent (or logged when SMTP is off).',
        );
      } else {
        // Email alone resolves the facility relationship on the server.
        await login(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`login-stage ${heroReady ? 'is-hero-ready' : ''} ${heroFailed ? 'is-hero-fallback' : ''}`}
    >
      <div className="login-hero" aria-hidden="true">
        <div className="login-hero__fallback" />
        {!heroFailed ? (
          <img
            className="login-hero__photo"
            src={HERO_SRC}
            alt=""
            width={1280}
            height={720}
            decoding="async"
            loading="eager"
            fetchPriority="high"
            onLoad={() => setHeroReady(true)}
            onError={() => {
              setHeroFailed(true);
              setHeroReady(false);
            }}
          />
        ) : null}
        <div className="login-hero__veil" />
        <div className="login-hero__grain" />
      </div>

      <section className="login-visual">
        <Link to="/" className="login-brand-mark login-brand-link">
          RFH Care
        </Link>
        <h1 className="login-visual-title">Presence for every med pass</h1>
        <p className="login-visual-copy">
          Built for adult family homes — calm charting, trusted handoffs, and room to care.
        </p>
      </section>

      <form className="login-panel page-enter" onSubmit={onSubmit}>
        <p className="login-brand">Sign in</p>
        <h2 className="login-facility">Welcome back</h2>
        <p className="login-caregiver login-caregiver--muted">
          Use the email on your facility account — we’ll open the right home automatically.
        </p>
        <p className="login-lede">
          {mode === 'login'
            ? 'Enter your email and password to open today’s care board.'
            : 'Enter your email and we’ll send a reset link if an account exists.'}
        </p>

        {error ? <div className="error">{error}</div> : null}
        {resetMsg ? <div className="toast toast-success">{resetMsg}</div> : null}

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
          <p className="auth-switch">
            New home? <Link to="/signup">Create an account</Link>
            {' · '}
            <Link to="/">Landing</Link>
          </p>
        </div>
      </form>
    </div>
  );
}
