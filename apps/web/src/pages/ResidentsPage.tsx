import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { formatInFacilityTz } from '../time';

type Resident = {
  id: string;
  firstName: string;
  lastName: string;
  room: string | null;
  status: string;
  allergies: string[];
  photoUrl?: string | null;
  dateOfBirth?: string;
};

function currentMonthYm() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function ResidentsPage({ timezone }: { timezone: string }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Resident[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    admitDate: new Date().toISOString().slice(0, 10),
    room: '',
    allergies: '',
  });
  const month = currentMonthYm();
  const isFamily = user?.role === 'FAMILY_VIEWER';
  const canWrite = ['OWNER', 'ADMIN', 'NURSE'].includes(user?.role || '');

  async function load() {
    setLoading(true);
    try {
      setRows(await api<Resident[]>('/residents'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createResident(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/residents', {
        method: 'POST',
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          dateOfBirth: form.dateOfBirth,
          admitDate: form.admitDate,
          room: form.room || undefined,
          allergies: form.allergies
            ? form.allergies.split(',').map((s) => s.trim()).filter(Boolean)
            : [],
        }),
      });
      setShowCreate(false);
      setForm({
        firstName: '',
        lastName: '',
        dateOfBirth: '',
        admitDate: new Date().toISOString().slice(0, 10),
        room: '',
        allergies: '',
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  async function softDelete(id: string) {
    if (!confirm('Remove this resident from the active census?')) return;
    try {
      await api(`/residents/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  return (
    <div>
      <h1 className="page-title">Residents</h1>
      <p className="page-sub">
        {user?.tenantName ? `${user.tenantName} · ` : ''}
        Active census · times shown in {timezone} ·{' '}
        {formatInFacilityTz(new Date().toISOString(), timezone)}
      </p>
      {error ? <div className="error">{error}</div> : null}

      {canWrite ? (
        <div style={{ marginBottom: '1rem' }}>
          <button className="btn" type="button" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? 'Cancel' : 'Add resident'}
          </button>
        </div>
      ) : null}

      {showCreate ? (
        <form className="note-row" style={{ flexDirection: 'column', alignItems: 'stretch', marginBottom: '1rem' }} onSubmit={createResident}>
          <div className="tpl-grid">
            <div className="field">
              <label>First name</label>
              <input
                required
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Last name</label>
              <input
                required
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Date of birth</label>
              <input
                type="date"
                required
                value={form.dateOfBirth}
                onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Admit date</label>
              <input
                type="date"
                required
                value={form.admitDate}
                onChange={(e) => setForm({ ...form, admitDate: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Room</label>
              <input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} />
            </div>
            <div className="field wide">
              <label>Allergies (comma-separated)</label>
              <input
                value={form.allergies}
                onChange={(e) => setForm({ ...form, allergies: e.target.value })}
              />
            </div>
          </div>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Create resident'}
          </button>
        </form>
      ) : null}

      {loading ? <p className="empty">Loading…</p> : null}
      {!loading && rows.length === 0 ? <p className="empty">No residents yet.</p> : null}
      <div className="stack">
        {rows.map((r) => (
          <div key={r.id} className="resident-row">
            <Link
              to={`/residents/${r.id}`}
              className="resident-row-main"
              style={{ flex: 1, textDecoration: 'none', color: 'inherit' }}
            >
              {r.photoUrl ? (
                <img className="resident-thumb" src={r.photoUrl} alt="" />
              ) : (
                <div className="resident-thumb placeholder" aria-hidden>
                  {(r.firstName[0] || '?') + (r.lastName[0] || '')}
                </div>
              )}
              <div>
                <strong style={{ fontSize: '1.2rem' }}>
                  {r.lastName}, {r.firstName}
                </strong>
                <div className="meta">
                  Room {r.room || '—'}
                  {r.allergies.length ? ` · Allergies: ${r.allergies.join(', ')}` : ''}
                </div>
              </div>
            </Link>
            <div className="resident-row-actions">
              {!isFamily ? (
                <>
                  <Link className="btn secondary" to={`/residents/${r.id}/mar?month=${month}`}>
                    MAR
                  </Link>
                  <Link className="btn secondary" to={`/residents/${r.id}/care-plan`}>
                    Care plan
                  </Link>
                </>
              ) : null}
              {canWrite ? (
                <button className="btn ghost" type="button" onClick={() => void softDelete(r.id)}>
                  Remove
                </button>
              ) : null}
              <span className={`badge ${r.status === 'ACTIVE' ? 'ok' : 'neutral'}`}>{r.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
