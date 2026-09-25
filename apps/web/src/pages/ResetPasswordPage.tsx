import { useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';

export function ResetPasswordPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/today" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/auth/password-reset/confirm', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-panel page-enter" onSubmit={onSubmit}>
        <h1>RFH Care</h1>
        <p className="page-sub">Choose a new password (12+ chars with upper, lower, number, symbol).</p>
        {error ? <div className="error">{error}</div> : null}
        {done ? (
          <p className="empty">
            Password updated. <Link to="/login">Sign in</Link>
          </p>
        ) : (
          <>
            <div className="field">
              <label htmlFor="password">New password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={12}
              />
            </div>
            <button className="btn" type="submit" disabled={busy || !token}>
              {busy ? 'Saving…' : 'Update password'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
