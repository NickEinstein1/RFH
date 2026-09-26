import { useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { AuthFrame, PasswordHint } from '../components/AuthFrame';

const TIMEZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Phoenix',
  'Pacific/Honolulu',
] as const;

function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 12) issues.push('at least 12 characters');
  if (!/[a-z]/.test(password)) issues.push('a lowercase letter');
  if (!/[A-Z]/.test(password)) issues.push('an uppercase letter');
  if (!/\d/.test(password)) issues.push('a number');
  if (!/[^A-Za-z0-9]/.test(password)) issues.push('a symbol');
  return issues;
}

export function SignupPage() {
  const { user, signup } = useAuth();
  const [tenantName, setTenantName] = useState('');
  const [timezone, setTimezone] = useState<string>(TIMEZONES[0]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const issues = useMemo(() => passwordIssues(password), [password]);

  if (user) return <Navigate to="/today" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (issues.length) {
        throw new Error(`Password needs ${issues.join(', ')}.`);
      }
      if (password !== confirm) {
        throw new Error('Passwords do not match.');
      }
      await signup({
        tenantName: tenantName.trim(),
        timezone,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        password,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame visualLine="Register your adult family home. Your email becomes your sign-in.">
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <Link to="/" className="auth-form__back">
          ← Back to home
        </Link>
        <h1 className="auth-form__title">Create your home</h1>
        <p className="auth-form__lede">
          You become the owner. Invite nurses and caregivers after you sign in.
        </p>

        {error ? (
          <div className="error" role="alert">
            {error}
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="tenantName">Facility name</label>
          <input
            id="tenantName"
            value={tenantName}
            onChange={(e) => setTenantName(e.target.value)}
            placeholder="Licensed home name"
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

        <div className="auth-form__name-row">
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
            placeholder="owner@yourfacility.com"
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
          <PasswordHint />
        </div>

        <div className="field">
          <label htmlFor="confirm">Confirm password</label>
          <input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={12}
            autoComplete="new-password"
          />
        </div>

        <div className="auth-form__actions">
          <button className="btn auth-form__submit" type="submit" disabled={busy}>
            {busy ? 'Creating home…' : 'Create account'}
          </button>
          <p className="auth-form__switch">
            Already registered? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </form>
    </AuthFrame>
  );
}
