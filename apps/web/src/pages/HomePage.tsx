import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { formatInFacilityTz } from '../time';
import { pendingCount } from '../offlineQueue';

type MedAlert = {
  id: string;
  type: string;
  status: string;
  triggeredAt: string;
  administration?: {
    resident?: { id: string; firstName: string; lastName: string; room: string | null };
    order?: { drugName: string };
  };
};

type Incident = {
  id: string;
  title: string;
  severity: string;
  status: string;
  occurredAt: string;
  resident: { firstName: string; lastName: string };
};

type DueSlot = {
  residentId: string;
  residentName: string;
  room: string | null;
  drugName: string;
  scheduledAt: string;
};

type SurveyAction = {
  findingId: string;
  severity: 'warn' | 'critical';
  title: string;
  detail: string;
  cta: string;
  href: string;
};

type Survey = {
  score: number;
  label: string;
  actions?: SurveyAction[];
  actionCount?: number;
};

function currentMonthYm() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function HomePage({ timezone }: { timezone: string }) {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<MedAlert[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [due, setDue] = useState<DueSlot[]>([]);
  const [error, setError] = useState('');
  const [syncPending, setSyncPending] = useState(pendingCount());
  const [survey, setSurvey] = useState<Survey | null>(null);
  const month = currentMonthYm();
  const isFamily = user?.role === 'FAMILY_VIEWER';
  const showReports = ['OWNER', 'ADMIN', 'NURSE'].includes(user?.role || '');

  useEffect(() => {
    const onQueue = () => setSyncPending(pendingCount());
    window.addEventListener('rfh-offline-queue', onQueue);
    return () => window.removeEventListener('rfh-offline-queue', onQueue);
  }, []);

  useEffect(() => {
    if (isFamily) return;
    void (async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const [alertRows, incidentRows, dueBoard, readiness] = await Promise.all([
          api<MedAlert[]>('/emar/alerts').catch(() => [] as MedAlert[]),
          api<Incident[]>('/incidents').catch(() => [] as Incident[]),
          api<{ slots: DueSlot[] }>(
            `/emar/med-pass/due?date=${encodeURIComponent(today)}&limit=12`,
          ).catch(() => ({ slots: [] as DueSlot[] })),
          showReports
            ? api<Survey>('/reports/survey-readiness').catch(() => null)
            : Promise.resolve(null),
        ]);

        if (readiness) setSurvey(readiness);
        setAlerts(alertRows.slice(0, 6));
        setIncidents(incidentRows.filter((i) => i.status !== 'CLOSED').slice(0, 5));
        setDue(dueBoard.slots || []);
        setError('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load today');
      }
    })();
  }, [isFamily, showReports]);

  if (isFamily) return <Navigate to="/family" replace />;

  return (
    <div className="home-today page-enter">
      <header className="home-hero">
        <p className="home-eyebrow">
          {user?.tenantName}
          {user?.role === 'CAREGIVER' && user.firstName
            ? ` — ${user.firstName} ${user.lastName} (caregiver)`
            : ''}
        </p>
        <h1 className="page-title">Today’s care</h1>
        <p className="page-sub">
          Start with who’s due, what’s open, and what families need — then move through the home with
          calm focus.
          {syncPending ? ` · ${syncPending} pending offline sync` : ''}
        </p>
        {survey ? (
          <Link className="survey-pill" to="/reports">
            <span className="survey-pill-score">{survey.score}%</span>
            <span>{survey.label}</span>
          </Link>
        ) : null}
        <div className="home-cta-row">
          <Link className="btn" to="/residents">
            Residents
          </Link>
          <Link className="btn secondary" to="/alerts">
            Med alerts
          </Link>
          <Link className="btn ghost" to="/downloads">
            Downloads
          </Link>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}

      {survey?.actions?.length ? (
        <section className="home-section">
          <h2>Survey fix-it queue ({survey.actionCount ?? survey.actions.length})</h2>
          <p className="meta" style={{ marginTop: '-0.35rem', marginBottom: '0.75rem' }}>
            Close these gaps to raise readiness. Tap through to the work.
          </p>
          <div className="stack">
            {survey.actions.map((a) => (
              <Link key={a.findingId} className="home-row action-row" to={a.href}>
                <div>
                  <strong>{a.title}</strong>
                  <div className="meta">{a.detail}</div>
                </div>
                <span className={`badge ${a.severity === 'critical' ? 'danger' : 'warn'}`}>
                  {a.cta}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="home-section">
        <h2>Due medications</h2>
        <div className="stack">
          {due.length === 0 ? <p className="empty">No due doses in the current sample.</p> : null}
          {due.map((d, i) => (
            <Link
              key={`${d.residentId}-${d.scheduledAt}-${i}`}
              className="home-row"
              to={`/residents/${d.residentId}`}
            >
              <div>
                <strong>{d.drugName}</strong>
                <div className="meta">
                  {d.residentName}
                  {d.room ? ` · Rm ${d.room}` : ''} ·{' '}
                  {formatInFacilityTz(d.scheduledAt, timezone, { timeStyle: 'short' })}
                </div>
              </div>
              <span className="badge warn">Due</span>
            </Link>
          ))}
        </div>
        {due[0] ? (
          <Link className="meta home-more" to={`/residents/${due[0].residentId}/mar?month=${month}`}>
            Open MAR →
          </Link>
        ) : null}
      </section>

      <section className="home-section">
        <h2>Open alerts</h2>
        <div className="stack">
          {alerts.length === 0 ? <p className="empty">No open med alerts.</p> : null}
          {alerts.map((a) => (
            <Link key={a.id} className="home-row" to="/alerts">
              <div>
                <strong>{a.type}</strong>
                <div className="meta">
                  {a.administration?.resident
                    ? `${a.administration.resident.lastName}, ${a.administration.resident.firstName}`
                    : 'Resident'}
                  {a.administration?.order?.drugName
                    ? ` · ${a.administration.order.drugName}`
                    : ''}{' '}
                  · {formatInFacilityTz(a.triggeredAt, timezone)}
                </div>
              </div>
              <span className="badge danger">Open</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-section">
        <h2>Recent CBHS notes</h2>
        <div className="stack">
          {incidents.length === 0 ? <p className="empty">No open notes.</p> : null}
          {incidents.map((i) => (
            <Link key={i.id} className="home-row" to="/incidents">
              <div>
                <strong>{i.title}</strong>
                <div className="meta">
                  {i.resident.lastName}, {i.resident.firstName} · {i.severity} ·{' '}
                  {formatInFacilityTz(i.occurredAt, timezone)}
                </div>
              </div>
              <span
                className={`badge ${
                  i.severity === 'CRITICAL' || i.severity === 'HIGH' ? 'danger' : 'warn'
                }`}
              >
                {i.status}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
