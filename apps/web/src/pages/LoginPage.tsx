import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth';

export function LoginPage() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('care@sunrise.demo');
  const [password, setPassword] = useState('Password123!');
  const [tenantName, setTenantName] = useState('Sunrise Adult Family Home');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password, tenantName || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-panel" onSubmit={onSubmit}>
        <h1>RFH Care</h1>
        <p className="page-sub">Sign in for med pass and resident care.</p>
        {error ? <div className="error">{error}</div> : null}
        <div className="field">
          <label htmlFor="tenant">Facility</label>
          <input
            id="tenant"
            value={tenantName}
            onChange={(e) => setTenantName(e.target.value)}
            autoComplete="organization"
          />
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
        <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
