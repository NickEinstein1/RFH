import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { formatInFacilityTz } from '../time';

type Resident = {
  id: string;
  firstName: string;
  lastName: string;
  room: string | null;
  status: string;
  allergies: string[];
};

export function ResidentsPage({ timezone }: { timezone: string }) {
  const [rows, setRows] = useState<Resident[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

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
        Active census · times shown in {timezone} · {formatInFacilityTz(new Date().toISOString(), timezone)}
      </p>
      {error ? <div className="error">{error}</div> : null}
      {loading ? <p className="empty">Loading…</p> : null}
      {!loading && rows.length === 0 ? <p className="empty">No residents yet.</p> : null}
      <div className="stack">
        {rows.map((r) => (
          <Link key={r.id} to={`/residents/${r.id}`} className="resident-row">
            <div>
              <strong style={{ fontSize: '1.2rem' }}>
                {r.lastName}, {r.firstName}
              </strong>
              <div className="meta">
                Room {r.room || '—'}
                {r.allergies.length ? ` · Allergies: ${r.allergies.join(', ')}` : ''}
              </div>
            </div>
            <span className={`badge ${r.status === 'ACTIVE' ? 'ok' : 'neutral'}`}>{r.status}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
