import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { CareAtmosphere } from '../components/CareAtmosphere';

const FACILITIES = [
  {
    id: 'loving-garden',
    name: 'Loving Garden AFH',
    email: 'care@lovinggarden.demo',
    label: 'Loving Garden AFH',
  },
  {
    id: 'sunrise',
    name: 'Sunrise Adult Family Home',
    email: 'care@sunrise.demo',
    label: 'Sunrise Adult Family Home',
  },
  {
    id: 'portfolio',
    name: 'Loving Garden AFH',
    email: 'owner@portfolio.demo',
    label: 'Portfolio owner (multi-home)',
  },
  {
    id: 'sunrise-family',
    name: 'Sunrise Adult Family Home',
    email: 'family@sunrise.demo',
    label: 'Family portal (Sunrise)',
  },
] as const;

export function LoginPage() {
  const { user, login } = useAuth();
  const [facilityId, setFacilityId] = useState<string>(FACILITIES[0].id);
  const facility = FACILITIES.find((f) => f.id === facilityId) || FACILITIES[0];
  const [email, setEmail] = useState<string>(FACILITIES[0].email);
  const [password, setPassword] = useState('Password123!');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [resetMsg, setResetMsg] = useState('');

  if (user) return <Navigate to="/" replace />;

  function onFacilityChange(id: string) {
    setFacilityId(id);
    const match = FACILITIES.find((f) => f.id === id);
    if (match) setEmail(match.email);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setResetMsg('');
    try {
      if (mode === 'reset') {
        await api('/auth/password-reset/request', {
          method: 'POST',
          body: JSON.stringify({ email, tenantName: facility.name }),
        });
        setResetMsg('If an account exists, a reset link was emailed (or logged when SMTP is off).');
      } else {
        await login(email, password, facility.name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <CareAtmosphere variant="login" />
      <form className="login-panel page-enter" onSubmit={onSubmit}>
        <div className="login-brand">RFH Care</div>
        <h1>{facility.label}</h1>
        <p className="page-sub">
          {mode === 'login'
            ? 'Quiet tools for med pass, notes, and family trust — built for adult family homes.'
            : 'Request a password reset email for this facility.'}
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
                {f.label}
              </option>
            ))}
          </select>
        </div>
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
        <button className="btn" type="submit" disabled={busy}>
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
      </form>
    </div>
  );
}
