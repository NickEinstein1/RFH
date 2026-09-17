import { useEffect, useState } from 'react';
import { api } from '../api';
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

export function StaffPage({ timezone }: { timezone: string }) {
  const [creds, setCreds] = useState<Credential[]>([]);
  const [alerts, setAlerts] = useState<CredAlert[]>([]);
  const [error, setError] = useState('');

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

  const now = Date.now();

  return (
    <div>
      <h1 className="page-title">Staff credentials</h1>
      <p className="page-sub">Licenses and cards with expiration tracking.</p>
      {error ? <div className="error">{error}</div> : null}

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
