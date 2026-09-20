import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { formatInFacilityTz } from '../time';

type Credential = {
  id: string;
  type: string;
  label: string;
  expiresAt: string;
  user: { firstName: string; lastName: string };
};

type CredAlert = {
  id: string;
  type: string;
  triggeredAt: string;
  credential: {
    label: string;
    expiresAt: string;
    user: { firstName: string; lastName: string };
  };
};

const ROLES = ['CAREGIVER', 'NURSE', 'ADMIN', 'OWNER', 'FAMILY_VIEWER'] as const;

export function StaffPage({ timezone }: { timezone: string }) {
  const { user } = useAuth();
  const canInvite = ['OWNER', 'ADMIN'].includes(user?.role || '');
  const [creds, setCreds] = useState<Credential[]>([]);
  const [alerts, setAlerts] = useState<CredAlert[]>([]);
  const [error, setError] = useState('');
  const [inviteMsg, setInviteMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState({
    email: '',
    firstName: '',
    lastName: '',
    password: '',
    role: 'CAREGIVER' as (typeof ROLES)[number],
  });

  async function load() {
    setError('');
    try {
      const [c, a] = await Promise.all([
        api<Credential[]>('/staff/credentials'),
        api<CredAlert[]>('/staff/credential-alerts'),
      ]);
      setCreds(c);
      setAlerts(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load staff data');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function ack(id: string) {
    try {
      await api(`/staff/credential-alerts/${id}/acknowledge`, { method: 'PATCH' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to acknowledge');
    }
  }

  async function sendInvite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInviteMsg('');
    try {
      await api('/auth/users', {
        method: 'POST',
        body: JSON.stringify({ ...invite, sendInvite: true }),
      });
      setInviteMsg(`Invite created for ${invite.email} (email sent if SMTP is configured).`);
      setInvite({
        email: '',
        firstName: '',
        lastName: '',
        password: '',
        role: 'CAREGIVER',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invite failed');
    } finally {
      setBusy(false);
    }
  }

  const now = Date.now();

  return (
    <div className="page-enter">
      <h1 className="page-title">Staff</h1>
      <p className="page-sub">Credentials, alerts, and SMTP staff invites.</p>
      {error ? <div className="error">{error}</div> : null}
      {inviteMsg ? <div className="toast toast-success">{inviteMsg}</div> : null}

      {canInvite ? (
        <form className="download-panel" onSubmit={sendInvite} style={{ marginBottom: '1.5rem' }}>
          <h2>Invite staff</h2>
          <p className="meta">
            Password must be 12+ with upper, lower, number, and symbol. An invite email is attempted
            via SMTP.
          </p>
          <div className="download-controls">
            <div className="field">
              <label>First name</label>
              <input
                value={invite.firstName}
                onChange={(e) => setInvite((v) => ({ ...v, firstName: e.target.value }))}
                required
              />
            </div>
            <div className="field">
              <label>Last name</label>
              <input
                value={invite.lastName}
                onChange={(e) => setInvite((v) => ({ ...v, lastName: e.target.value }))}
                required
              />
            </div>
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                value={invite.email}
                onChange={(e) => setInvite((v) => ({ ...v, email: e.target.value }))}
                required
              />
            </div>
            <div className="field">
              <label>Temp password</label>
              <input
                type="password"
                value={invite.password}
                onChange={(e) => setInvite((v) => ({ ...v, password: e.target.value }))}
                required
                minLength={12}
              />
            </div>
            <div className="field">
              <label>Role</label>
              <select
                value={invite.role}
                onChange={(e) =>
                  setInvite((v) => ({ ...v, role: e.target.value as (typeof ROLES)[number] }))
                }
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Create & email invite'}
            </button>
          </div>
        </form>
      ) : null}

      <h2 style={{ fontFamily: 'var(--font-display)', marginTop: '1.5rem' }}>Open alerts</h2>
      <div className="stack" style={{ marginBottom: '1.5rem' }}>
        {alerts.length === 0 ? <p className="empty">No credential alerts.</p> : null}
        {alerts.map((a) => (
          <div key={a.id} className="alert-row">
            <div>
              <strong>
                {a.type} · {a.credential.label}
              </strong>
              <div className="meta">
                {a.credential.user.lastName}, {a.credential.user.firstName} · expires{' '}
                {formatInFacilityTz(a.credential.expiresAt, timezone, { dateStyle: 'medium' })}
              </div>
            </div>
            <button className="btn secondary" onClick={() => void ack(a.id)}>
              Acknowledge
            </button>
          </div>
        ))}
      </div>

      <h2 style={{ fontFamily: 'var(--font-display)' }}>All credentials</h2>
      <div className="stack">
        {creds.map((c) => {
          const expired = new Date(c.expiresAt).getTime() < now;
          const soon =
            !expired && new Date(c.expiresAt).getTime() < now + 30 * 24 * 60 * 60 * 1000;
          return (
            <div key={c.id} className="resident-row">
              <div>
                <strong style={{ fontSize: '1.1rem' }}>{c.label}</strong>
                <div className="meta">
                  {c.user.lastName}, {c.user.firstName} · {c.type} · expires{' '}
                  {formatInFacilityTz(c.expiresAt, timezone, { dateStyle: 'medium' })}
                </div>
              </div>
              <span className={`badge ${expired ? 'danger' : soon ? 'warn' : 'ok'}`}>
                {expired ? 'EXPIRED' : soon ? 'EXPIRING' : 'VALID'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
