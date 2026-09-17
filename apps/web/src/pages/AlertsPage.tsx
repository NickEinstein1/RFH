import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { formatInFacilityTz } from '../time';

type Alert = {
  id: string;
  type: string;
  triggeredAt: string;
  administration: {
    resident: { id: string; firstName: string; lastName: string };
    order: { drugName: string; dose: string };
  };
};

export function AlertsPage({ timezone }: { timezone: string }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState('');

  async function load() {
    try {
      setAlerts(await api<Alert[]>('/emar/alerts'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load alerts');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function ack(id: string) {
    setError('');
    try {
      await api(`/emar/alerts/${id}/acknowledge`, { method: 'PATCH' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to acknowledge');
    }
  }

  return (
    <div>
      <h1 className="page-title">Med alerts</h1>
      <p className="page-sub">Missed, late, and refused doses requiring follow-up.</p>
      {error ? <div className="error">{error}</div> : null}
      <div className="stack">
        {alerts.length === 0 ? <p className="empty">No open alerts.</p> : null}
        {alerts.map((a) => (
          <div key={a.id} className="alert-row">
            <div>
              <strong style={{ fontSize: '1.15rem' }}>
                {a.type} · {a.administration.order.drugName} {a.administration.order.dose}
              </strong>
              <div className="meta">
                <Link to={`/residents/${a.administration.resident.id}`}>
                  {a.administration.resident.lastName}, {a.administration.resident.firstName}
                </Link>
                {' · '}
                {formatInFacilityTz(a.triggeredAt, timezone)}
              </div>
            </div>
            <button className="btn secondary" onClick={() => void ack(a.id)}>
              Acknowledge
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
