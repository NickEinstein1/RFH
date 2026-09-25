import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';

const HERO_SRC = '/images/rfh-login-care-hero.jpg';

const FACILITIES = [
  {
    id: 'loving-garden',
    name: 'Loving Garden AFH',
    email: 'lovinggardenafh@gmail.com',
    password: 'LovinggardenAFH_2026',
    label: 'Loving Garden AFH',
    caregiverName: 'Jane Mburu',
    caregiverRole: 'Provider',
  },
  {
    id: 'sunrise',
    name: 'Sunrise Adult Family Home',
    email: 'care@sunrise.demo',
    password: 'Password123!',
    label: 'Sunrise Adult Family Home',
    caregiverName: null,
    caregiverRole: null,
  },
  {
    id: 'portfolio',
    name: 'Loving Garden AFH',
    email: 'owner@portfolio.demo',
    password: 'Password123!',
    label: 'Portfolio owner (multi-home)',
    caregiverName: null,
    caregiverRole: null,
  },
  {
    id: 'sunrise-family',
    name: 'Sunrise Adult Family Home',
    email: 'family@sunrise.demo',
    password: 'Password123!',
    label: 'Family portal (Sunrise)',
    caregiverName: null,
    caregiverRole: null,
  },
  {
    id: 'custom',
    name: '',
    email: '',
    password: '',
    label: 'My facility (enter name)',
    caregiverName: null,
    caregiverRole: null,
  },
] as const;

function facilityOptionLabel(f: (typeof FACILITIES)[number]) {
  if (f.caregiverName) {
    return `${f.label} — ${f.caregiverName} (${(f.caregiverRole || 'caregiver').toLowerCase()})`;
  }
  return f.label;
}

export function LoginPage() {
  const { user, login } = useAuth();
  const [facilityId, setFacilityId] = useState<string>(FACILITIES[0].id);
  const facility = FACILITIES.find((f) => f.id === facilityId) || FACILITIES[0];
  const [customTenant, setCustomTenant] = useState('');
  const [email, setEmail] = useState<string>(FACILITIES[0].email);
  const [password, setPassword] = useState(FACILITIES[0].password);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [resetMsg, setResetMsg] = useState('');
  const [heroReady, setHeroReady] = useState(false);
  const [heroFailed, setHeroFailed] = useState(false);

  const tenantName = facilityId === 'custom' ? customTenant.trim() : facility.name;

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

  function onFacilityChange(id: string) {
    setFacilityId(id);
    const match = FACILITIES.find((f) => f.id === id);
    if (match && match.id !== 'custom') {
      setEmail(match.email);
      setPassword(match.password || '');
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setResetMsg('');
    try {
      if (!tenantName) {
        throw new Error('Enter your facility name');
      }
      if (mode === 'reset') {
        await api('/auth/password-reset/request', {
          method: 'POST',
          body: JSON.stringify({ email, tenantName }),
        });
        setResetMsg('If an account exists, a reset link was emailed (or logged when SMTP is off).');
      } else {
        await login(email, password, tenantName);
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
        <h2 className="login-facility">
          {facilityId === 'custom' ? 'Your facility' : facility.label}
        </h2>
        {facility.caregiverName ? (
          <p className="login-caregiver">
            {facility.caregiverName}
            <span> · {facility.caregiverRole || 'Caregiver'}</span>
          </p>
        ) : (
          <p className="login-caregiver login-caregiver--muted">
            Choose a demo home or enter your facility name
          </p>
        )}
        <p className="login-lede">
          {mode === 'login'
            ? 'Enter your facility credentials to open today’s care board.'
            : 'We’ll email a reset link for this facility if the account exists.'}
        </p>

        {error ? <div className="error">{error}</div> : null}
        {resetMsg ? <div className="toast toast-success">{resetMsg}</div> : null}

        <div className="field">
          <label htmlFor="tenant">Facility</label>
          <select
            id="tenant"
            value={facilityId}
            onChange={(e) => onFacilityChange(e.target.value)}
            required
          >
            {FACILITIES.map((f) => (
              <option key={f.id} value={f.id}>
                {facilityOptionLabel(f)}
              </option>
            ))}
          </select>
        </div>
        {facilityId === 'custom' ? (
          <div className="field">
            <label htmlFor="customTenant">Facility name</label>
            <input
              id="customTenant"
              value={customTenant}
              onChange={(e) => setCustomTenant(e.target.value)}
              placeholder="Exact facility name"
              required
              autoComplete="organization"
            />
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
            required
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
