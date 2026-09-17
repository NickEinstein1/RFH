import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { formatInFacilityTz } from '../time';

type Incident = {
  id: string;
  title: string;
  category: string;
  severity: string;
  status: string;
  occurredAt: string;
  narrative: string;
  immediateActions: string | null;
  resident: { id: string; firstName: string; lastName: string; room: string | null };
  reportedBy: { firstName: string; lastName: string };
};

type Resident = { id: string; firstName: string; lastName: string };

const CATEGORIES = ['FALL', 'MED_ERROR', 'BEHAVIOR', 'INJURY', 'ELOPEMENT', 'OTHER'];
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export function IncidentsPage({ timezone }: { timezone: string }) {
  const [rows, setRows] = useState<Incident[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    residentId: '',
    category: 'FALL',
    severity: 'MEDIUM',
    title: '',
    narrative: '',
    immediateActions: '',
  });

  async function load() {
    setError('');
    try {
      const [inc, res] = await Promise.all([
        api<Incident[]>('/incidents'),
        api<Resident[]>('/residents'),
      ]);
      setRows(inc);
      setResidents(res);
      if (!form.residentId && res[0]) {
        setForm((f) => ({ ...f, residentId: res[0].id }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/incidents', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          occurredAt: new Date().toISOString(),
        }),
      });
      setShowForm(false);
      setForm((f) => ({ ...f, title: '', narrative: '', immediateActions: '' }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    }
  }

  async function closeIncident(id: string) {
    try {
      await api(`/incidents/${id}/close`, { method: 'POST' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Close failed (need nurse+)');
    }
  }

  return (
    <div>
      <h1 className="page-title">Incidents</h1>
      <p className="page-sub">Falls, med errors, and other reportable events.</p>
      {error ? <div className="error">{error}</div> : null}

      <div style={{ marginBottom: '1rem' }}>
        <button className="btn" type="button" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : 'Report incident'}
        </button>
      </div>

      {showForm ? (
        <form onSubmit={submit} className="note-row" style={{ flexDirection: 'column', alignItems: 'stretch', marginBottom: '1.25rem' }}>
          <div className="field">
            <label>Resident</label>
            <select
              value={form.residentId}
              onChange={(e) => setForm({ ...form, residentId: e.target.value })}
              required
            >
              {residents.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.lastName}, {r.firstName}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Severity</label>
            <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Title</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>
          <div className="field">
            <label>Narrative</label>
            <textarea
              value={form.narrative}
              onChange={(e) => setForm({ ...form, narrative: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>Immediate actions</label>
            <textarea
              value={form.immediateActions}
              onChange={(e) => setForm({ ...form, immediateActions: e.target.value })}
            />
          </div>
          <button className="btn" type="submit">
            Save incident
          </button>
        </form>
      ) : null}

      <div className="stack">
        {rows.length === 0 ? <p className="empty">No incidents recorded.</p> : null}
        {rows.map((i) => (
          <div key={i.id} className="alert-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                <strong style={{ fontSize: '1.15rem' }}>{i.title}</strong>
                <div className="meta">
                  <Link to={`/residents/${i.resident.id}`}>
                    {i.resident.lastName}, {i.resident.firstName}
                  </Link>
                  {' · '}
                  {i.category} · {formatInFacilityTz(i.occurredAt, timezone)} ·{' '}
                  {i.reportedBy.firstName} {i.reportedBy.lastName}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span className={`badge ${i.severity === 'CRITICAL' || i.severity === 'HIGH' ? 'danger' : 'warn'}`}>
                  {i.severity}
                </span>
                <span className={`badge ${i.status === 'CLOSED' ? 'ok' : 'neutral'}`}>{i.status}</span>
              </div>
            </div>
            <p style={{ margin: '0.75rem 0 0', whiteSpace: 'pre-wrap' }}>{i.narrative}</p>
            {i.immediateActions ? (
              <div className="meta" style={{ marginTop: 6 }}>
                Actions: {i.immediateActions}
              </div>
            ) : null}
            {i.status !== 'CLOSED' ? (
              <div style={{ marginTop: '0.75rem' }}>
                <button className="btn secondary" type="button" onClick={() => void closeIncident(i.id)}>
                  Close
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
