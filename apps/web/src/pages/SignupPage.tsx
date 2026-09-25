import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth';

const TIMEZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Phoenix',
  'Pacific/Honolulu',
] as const;

export function SignupPage() {
  const { user, signup } = useAuth();
  const [tenantName, setTenantName] = useState('');
  const [timezone, setTimezone] = useState<string>(TIMEZONES[0]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/today" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signup({
        tenantName: tenantName.trim(),
        timezone,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        password,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-split">
      <aside className="auth-split-visual" aria-hidden="true">
        <img src="/images/rfh-login-care-hero.jpg" alt="" width={1280} height={720} />
        <div className="auth-split-veil" />
        <div className="auth-split-copy">
          <p className="login-brand-mark">RFH Care</p>
          <p className="login-visual-title">Open your adult family home on RFH</p>
        </div>
      </aside>

      <form className="login-panel auth-form" onSubmit={onSubmit}>
        <Link to="/" className="auth-back">
          ← RFH Care
        </Link>
        <p className="login-brand">Sign up</p>
        <h1 className="login-facility">Create your facility</h1>
        <p className="login-lede">
          Register as the home owner. You can invite nurses and caregivers after you sign in.
        </p>

        {error ? <div className="error">{error}</div> : null}

        <div className="field">
          <label htmlFor="tenantName">Facility name</label>
          <input
            id="tenantName"
            value={tenantName}
            onChange={(e) => setTenantName(e.target.value)}
            placeholder="e.g. Loving Garden AFH"
            required
            minLength={2}
            autoComplete="organization"
          />
        </div>
        <div className="field">
          <label htmlFor="timezone">Timezone</label>
          <select id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
        <div className="auth-name-row">
          <div className="field">
            <label htmlFor="firstName">First name</label>
            <input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              autoComplete="given-name"
            />
          </div>
          <div className="field">
            <label htmlFor="lastName">Last name</label>
            <input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              autoComplete="family-name"
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="email">Work email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={12}
            autoComplete="new-password"
          />
          <p className="field-hint">
            At least 12 characters with upper, lower, number, and symbol.
          </p>
        </div>

        <div className="login-actions">
          <button className="btn login-submit" type="submit" disabled={busy}>
            {busy ? 'Creating home…' : 'Create account'}
          </button>
          <p className="auth-switch">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </form>
    </div>
  );
}
