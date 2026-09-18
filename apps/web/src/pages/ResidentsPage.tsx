import { useEffect, useState } from 'react';
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
  const month = currentMonthYm();
  const isFamily = user?.role === 'FAMILY_VIEWER';

  useEffect(() => {
    api<Resident[]>('/residents')
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="page-title">Residents</h1>
      <p className="page-sub">
        {user?.tenantName ? `${user.tenantName} · ` : ''}
        Active census · times shown in {timezone} ·{' '}
        {formatInFacilityTz(new Date().toISOString(), timezone)}
      </p>
      {error ? <div className="error">{error}</div> : null}
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
                <Link className="btn secondary" to={`/residents/${r.id}/mar?month=${month}`}>
                  MAR
                </Link>
              ) : null}
              <span className={`badge ${r.status === 'ACTIVE' ? 'ok' : 'neutral'}`}>{r.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
