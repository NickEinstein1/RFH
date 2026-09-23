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
  const canFamilyLinks = canInvite;
  const [creds, setCreds] = useState<Credential[]>([]);
  const [alerts, setAlerts] = useState<CredAlert[]>([]);
  const [familyLinks, setFamilyLinks] = useState<
    Array<{
      id: string;
      relationship: string;
      user: { id: string; firstName: string; lastName: string; email: string };
      resident: { id: string; firstName: string; lastName: string; room: string | null };
    }>
  >([]);
  const [familyUsers, setFamilyUsers] = useState<
    Array<{ id: string; email: string; firstName: string; lastName: string; role: string }>
  >([]);
  const [residents, setResidents] = useState<
    Array<{ id: string; firstName: string; lastName: string; room: string | null }>
  >([]);
  const [linkForm, setLinkForm] = useState({ userId: '', residentId: '', relationship: 'Family' });
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
      if (canFamilyLinks) {
        const [links, users, res] = await Promise.all([
          api<typeof familyLinks>('/staff/family-links'),
          canInvite
            ? api<typeof familyUsers>('/staff/users').catch(() => [] as typeof familyUsers)
            : Promise.resolve([] as typeof familyUsers),
          api<typeof residents>('/residents'),
        ]);
        setFamilyLinks(links);
        setFamilyUsers(users.filter((u) => u.role === 'FAMILY_VIEWER'));
        setResidents(res);
        if (!linkForm.userId && users.find((u) => u.role === 'FAMILY_VIEWER')) {
          setLinkForm((f) => ({
            ...f,
            userId: users.find((u) => u.role === 'FAMILY_VIEWER')!.id,
            residentId: res[0]?.id || '',
          }));
        }
      }
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

  async function createFamilyLink(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/staff/family-links', {
        method: 'POST',
        body: JSON.stringify(linkForm),
      });
      setInviteMsg('Family link saved.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link family');
    } finally {
      setBusy(false);
    }
  }

  const now = Date.now();

  return (
    <div className="page-enter">
      <h1 className="page-title">Staff</h1>
      <p className="page-sub">Credentials, family portal links, and SMTP invites.</p>
      {error ? <div className="error">{error}</div> : null}
      {inviteMsg ? <div className="toast toast-success">{inviteMsg}</div> : null}

      {canInvite ? (
        <form className="download-panel" onSubmit={sendInvite} style={{ marginBottom: '1.5rem' }}>
          <h2>Invite staff</h2>
          <p className="meta">
            Password must be 12+ with upper, lower, number, and symbol. An invite email is attempted
            via SMTP. Use role FAMILY_VIEWER for family portal accounts.
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

      {canFamilyLinks ? (
        <section className="download-panel" style={{ marginBottom: '1.5rem' }}>
          <h2>Family portal links</h2>
          <p className="meta">
            Link a FAMILY_VIEWER account to a resident so they see today’s given meds, notes, and can
            message the nurse.
          </p>
          <form className="download-controls" onSubmit={createFamilyLink}>
            <div className="field">
              <label>Family account</label>
              <select
                value={linkForm.userId}
                onChange={(e) => setLinkForm((f) => ({ ...f, userId: e.target.value }))}
                required
              >
                <option value="">Select…</option>
                {familyUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.lastName}, {u.firstName} · {u.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Resident</label>
              <select
                value={linkForm.residentId}
                onChange={(e) => setLinkForm((f) => ({ ...f, residentId: e.target.value }))}
                required
              >
                <option value="">Select…</option>
                {residents.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.lastName}, {r.firstName}
                    {r.room ? ` · Rm ${r.room}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Relationship</label>
              <input
                value={linkForm.relationship}
                onChange={(e) => setLinkForm((f) => ({ ...f, relationship: e.target.value }))}
                required
              />
            </div>
            <button className="btn" type="submit" disabled={busy || !familyUsers.length}>
              Link family
            </button>
          </form>
          <div className="stack" style={{ marginTop: '1rem' }}>
            {familyLinks.length === 0 ? <p className="empty">No family links yet.</p> : null}
            {familyLinks.map((l) => (
              <div key={l.id} className="home-row" style={{ cursor: 'default' }}>
                <div>
                  <strong>
                    {l.user.lastName}, {l.user.firstName}
                  </strong>
                  <div className="meta">
                    {l.user.email} · {l.relationship} · resident {l.resident.lastName},{' '}
                    {l.resident.firstName}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
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
