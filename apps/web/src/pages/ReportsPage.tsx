import { useEffect, useState } from 'react';
import { api, downloadFile } from '../api';
import { formatInFacilityTz } from '../time';
import { Link } from 'react-router-dom';

type Pack = {
  generatedAt: string;
  facilityTimezone: string;
  range: { from: string; to: string };
  surveyReadiness?: {
    score: number;
    label: string;
    findings: Array<{
      id: string;
      label: string;
      severity: 'ok' | 'warn' | 'critical';
      detail: string;
      penalty: number;
    }>;
  };
  census: { activeCount: number; residents: Array<{ lastName: string; firstName: string; room: string | null }> };
  emar: { outcomeCounts: Record<string, number>; openAlertCount: number };
  incidents: { count: number; items: Array<{ title: string; category: string; severity: string; status: string }> };
  credentials: {
    expiringOrExpiredCount: number;
    items: Array<{ label: string; expiresAt: string; user: { firstName: string; lastName: string } }>;
  };
  tasks: { outcomeCounts: Record<string, number> };
  audit: { eventCountInRange: number };
  retention: {
    softDeletedResidents: number;
    softDeletedNotes: number;
    hardDeletesOfClinicalRecords: number;
    note: string;
  };
};

export function ReportsPage({ timezone }: { timezone: string }) {
  const [pack, setPack] = useState<Pack | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const to = new Date().toISOString();
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    api<Pack>(`/reports/inspection-pack?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then(setPack)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load report'))
      .finally(() => setLoading(false));
  }, []);

  function downloadJson() {
    if (!pack) return;
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inspection-pack-${pack.generatedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <p className="empty">Building inspection pack…</p>;

  return (
    <div>
      <h1 className="page-title">Inspection pack</h1>
      <p className="page-sub">Live survey readiness + last 30 days summary with audit trail.</p>
      {error ? <div className="error">{error}</div> : null}
      {pack ? (
        <>
          {pack.surveyReadiness ? (
            <section className="survey-score-card page-enter">
              <div className="survey-score-num">{pack.surveyReadiness.score}%</div>
              <div>
                <strong>{pack.surveyReadiness.label}</strong>
                <p className="meta" style={{ margin: '0.35rem 0 0' }}>
                  State-survey readiness from credentials, med alerts, incident follow-up, and missed-dose rate.
                </p>
              </div>
              <div className="stack" style={{ gridColumn: '1 / -1', marginTop: '0.75rem' }}>
                {pack.surveyReadiness.findings.map((f) => (
                  <div key={f.id} className="home-row" style={{ cursor: 'default' }}>
                    <div>
                      <strong>{f.label}</strong>
                      <div className="meta">{f.detail}</div>
                    </div>
                    <span
                      className={`badge ${
                        f.severity === 'ok' ? 'ok' : f.severity === 'warn' ? 'warn' : 'danger'
                      }`}
                    >
                      {f.severity === 'ok' ? 'OK' : f.severity.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn" type="button" onClick={downloadJson}>
              Download JSON
            </button>
            <button
              className="btn secondary"
              type="button"
              onClick={() => {
                const to = new Date().toISOString();
                const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
                void downloadFile(
                  `/downloads/inspection-pack?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
                  'InspectionPack.pdf',
                ).catch((e) => setError(e instanceof Error ? e.message : 'Download failed'));
              }}
            >
              Download PDF
            </button>
            <Link className="btn ghost" to="/downloads">
              All downloads
            </Link>
          </div>
          <div className="stack">
            <div className="note-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <strong>Generated</strong>
              <div className="meta">
                {formatInFacilityTz(pack.generatedAt, timezone)} · range{' '}
                {formatInFacilityTz(pack.range.from, timezone, { dateStyle: 'medium' })} →{' '}
                {formatInFacilityTz(pack.range.to, timezone, { dateStyle: 'medium' })}
              </div>
            </div>
            <div className="note-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <strong>Census — {pack.census.activeCount} active</strong>
              <div className="meta">
                {pack.census.residents
                  .map((r) => `${r.lastName}, ${r.firstName} (Rm ${r.room || '—'})`)
                  .join(' · ') || '—'}
              </div>
            </div>
            <div className="note-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <strong>eMAR outcomes</strong>
              <div className="meta">
                {Object.entries(pack.emar.outcomeCounts)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(' · ') || 'None in range'}
                {' · '}
                Open alerts: {pack.emar.openAlertCount}
              </div>
            </div>
            <div className="note-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <strong>Incidents — {pack.incidents.count}</strong>
              <div className="meta">
                {pack.incidents.items.map((i) => `${i.title} (${i.category}/${i.severity})`).join(' · ') ||
                  'None'}
              </div>
            </div>
            <div className="note-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <strong>Credentials expiring/expired — {pack.credentials.expiringOrExpiredCount}</strong>
              <div className="meta">
                {pack.credentials.items
                  .map(
                    (c) =>
                      `${c.label} · ${c.user.lastName} · ${formatInFacilityTz(c.expiresAt, timezone, { dateStyle: 'medium' })}`,
                  )
                  .join(' · ') || 'None'}
              </div>
            </div>
            <div className="note-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <strong>ADL / care tasks</strong>
              <div className="meta">
                {Object.entries(pack.tasks.outcomeCounts)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(' · ') || 'None in range'}
              </div>
            </div>
            <div className="note-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <strong>Audit & retention</strong>
              <div className="meta">
                Audit events: {pack.audit.eventCountInRange} · Soft-deleted residents:{' '}
                {pack.retention.softDeletedResidents} · Soft-deleted notes:{' '}
                {pack.retention.softDeletedNotes} · Hard deletes:{' '}
                {pack.retention.hardDeletesOfClinicalRecords}
              </div>
              <div className="meta" style={{ marginTop: 4 }}>
                {pack.retention.note}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
