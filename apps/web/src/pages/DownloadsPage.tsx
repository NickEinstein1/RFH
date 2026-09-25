import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadFile } from '../api';
import { useAuth } from '../auth';

type Resident = {
  id: string;
  firstName: string;
  lastName: string;
  room: string | null;
};

type CarePlan = { id: string; title: string; status: string; residentId: string };
type Incident = {
  id: string;
  title: string;
  status: string;
  resident: { firstName: string; lastName: string };
};

function currentMonthYm() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function defaultRange() {
  const to = new Date().toISOString();
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return { from, to };
}

export function DownloadsPage() {
  const { user } = useAuth();
  const [residents, setResidents] = useState<Resident[]>([]);
  const [residentId, setResidentId] = useState('');
  const [month, setMonth] = useState(currentMonthYm());
  const [carePlans, setCarePlans] = useState<CarePlan[]>([]);
  const [planId, setPlanId] = useState('');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [incidentId, setIncidentId] = useState('');
  const [range, setRange] = useState(defaultRange);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  const showReports = ['OWNER', 'ADMIN', 'NURSE'].includes(user?.role || '');
  const showAudit = ['OWNER', 'ADMIN', 'NURSE'].includes(user?.role || '');
  const canMar = user?.role !== 'FAMILY_VIEWER';

  useEffect(() => {
    void (async () => {
      try {
        const [r, i] = await Promise.all([
          api<Resident[]>('/residents'),
          api<Incident[]>('/incidents'),
        ]);
        setResidents(r);
        setIncidents(i);
        if (r[0]) setResidentId(r[0].id);
        if (i[0]) setIncidentId(i[0].id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      }
    })();
  }, []);

  useEffect(() => {
    if (!residentId) {
      setCarePlans([]);
      setPlanId('');
      return;
    }
    void (async () => {
      try {
        const plans = await api<CarePlan[]>(`/care/plans?residentId=${encodeURIComponent(residentId)}`);
        setCarePlans(plans);
        setPlanId(plans[0]?.id || '');
      } catch {
        setCarePlans([]);
        setPlanId('');
      }
    })();
  }, [residentId]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function run(label: string, path: string, fallback: string) {
    setBusy(true);
    setError('');
    try {
      const name = await downloadFile(path, fallback);
      setToast(`${label} ready · ${name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="downloads-page">
      <h1 className="page-title">Downloads</h1>
      <p className="page-sub">
        Export clinical PDFs for survey, handoff, and chart copies. Every download is audited.
      </p>
      {error ? <div className="error">{error}</div> : null}
      {toast ? <div className="toast toast-success">{toast}</div> : null}

      {canMar ? (
        <section className="download-panel">
          <h2>Monthly MAR</h2>
          <p className="meta">Front page marks plus PRN back log.</p>
          <div className="download-controls">
            <div className="field">
              <label>Resident</label>
              <select value={residentId} onChange={(e) => setResidentId(e.target.value)}>
                {residents.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.lastName}, {r.firstName}
                    {r.room ? ` · Rm ${r.room}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Month</label>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
            <button
              className="btn"
              type="button"
              disabled={busy || !residentId}
              onClick={() =>
                void run(
                  'MAR PDF',
                  `/downloads/mar?residentId=${encodeURIComponent(residentId)}&month=${encodeURIComponent(month)}`,
                  `MAR_${month}.pdf`,
                )
              }
            >
              Download MAR PDF
            </button>
            {residentId ? (
              <Link className="btn secondary" to={`/residents/${residentId}/mar?month=${month}`}>
                Open MAR
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="download-panel">
        <h2>Negotiated Care Plan</h2>
        <p className="meta">Uses the care plan selected for the resident above.</p>
        <div className="download-controls">
          <div className="field">
            <label>Care plan</label>
            <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
              {carePlans.length === 0 ? <option value="">No plans</option> : null}
              {carePlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.status})
                </option>
              ))}
            </select>
          </div>
          <button
            className="btn"
            type="button"
            disabled={busy || !planId}
            onClick={() =>
              void run('Care plan PDF', `/downloads/care-plan/${planId}`, 'CarePlan.pdf')
            }
          >
            Download care plan PDF
          </button>
        </div>
      </section>

      <section className="download-panel">
          <h2>CBHS note / incident</h2>
          <p className="meta">
            PDF matches the original CBHS Word layout — Client Information (Field / Entry) plus the
            Date · Time Interval · Behavior Observed · Standard Intervention Applied table.
          </p>
        <p className="meta">Shared Notes & Incidents form export.</p>
        <div className="download-controls">
          <div className="field">
            <label>Report</label>
            <select value={incidentId} onChange={(e) => setIncidentId(e.target.value)}>
              {incidents.length === 0 ? <option value="">No reports</option> : null}
              {incidents.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.resident.lastName}, {i.resident.firstName} · {i.title}
                </option>
              ))}
            </select>
          </div>
          <button
            className="btn"
            type="button"
            disabled={busy || !incidentId}
            onClick={() =>
              void run('CBHS PDF', `/downloads/incident/${incidentId}`, 'CBHS.pdf')
            }
          >
            Download CBHS PDF
          </button>
        </div>
      </section>

      {showReports ? (
        <section className="download-panel">
          <h2>Inspection pack</h2>
          <p className="meta">Census, eMAR outcomes, incidents, credentials (PDF).</p>
          <div className="download-controls">
            <div className="field">
              <label>From</label>
              <input
                type="datetime-local"
                value={range.from.slice(0, 16)}
                onChange={(e) =>
                  setRange((r) => ({ ...r, from: new Date(e.target.value).toISOString() }))
                }
              />
            </div>
            <div className="field">
              <label>To</label>
              <input
                type="datetime-local"
                value={range.to.slice(0, 16)}
                onChange={(e) =>
                  setRange((r) => ({ ...r, to: new Date(e.target.value).toISOString() }))
                }
              />
            </div>
            <button
              className="btn"
              type="button"
              disabled={busy}
              onClick={() =>
                void run(
                  'Inspection pack',
                  `/downloads/inspection-pack?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
                  'InspectionPack.pdf',
                )
              }
            >
              Download inspection PDF
            </button>
            <Link className="btn secondary" to="/reports">
              Open reports
            </Link>
          </div>
        </section>
      ) : null}

      {showAudit ? (
        <section className="download-panel">
          <h2>Audit log</h2>
          <p className="meta">CSV export for nurse+ / owner (no narrative PHI columns).</p>
          <button
            className="btn secondary"
            type="button"
            disabled={busy}
            onClick={() =>
              void run(
                'Audit CSV',
                `/downloads/audit.csv?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
                'Audit.csv',
              )
            }
          >
            Download audit CSV
          </button>
        </section>
      ) : null}

      <section className="download-panel">
        <h2>Blank forms (templates)</h2>
        <p className="meta">Fillable Word templates for admissions — not resident-specific PHI.</p>
        <div className="download-controls">
          <a
            className="btn secondary"
            href="/templates/Admission-Agreement_Medicaid-TEMPLATE-02.06.2026.docx"
            download
          >
            Medicaid admission agreement template
          </a>
        </div>
        <p className="meta" style={{ marginTop: '0.75rem' }}>
          Loving Garden facility chart packets and signed Word sources are kept in the repo folder{' '}
          <code>Loving garden documents</code> (care plans, CBHS notes, resident info sheets, and photos).
        </p>
      </section>
    </div>
  );
}
