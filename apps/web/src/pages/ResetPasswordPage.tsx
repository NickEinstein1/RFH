import { useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { AuthFrame, PasswordHint } from '../components/AuthFrame';

export function ResetPasswordPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/today" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (password !== confirm) {
        throw new Error('Passwords do not match.');
      }
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
    <AuthFrame visualLine="Choose a new password for your facility account.">
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <Link to="/" className="auth-back">
          ← RFH Care
        </Link>
        <h1 className="auth-form-title">New password</h1>
        <p className="auth-form-lede">
          {token
            ? 'Set a strong password, then sign in with your email.'
            : 'This reset link is missing or invalid. Request a new one from sign in.'}
        </p>
        {error ? (
          <div className="error" role="alert">
            {error}
          </div>
        ) : null}
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
                autoComplete="new-password"
                disabled={!token}
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
                disabled={!token}
              />
            </div>
            <div className="login-actions">
              <button className="btn login-submit" type="submit" disabled={busy || !token}>
                {busy ? 'Saving…' : 'Update password'}
              </button>
              <p className="auth-switch">
                <Link to="/login">Back to sign in</Link>
              </p>
            </div>
          </>
        )}
      </form>
    </AuthFrame>
  );
}
