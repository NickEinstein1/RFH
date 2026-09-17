import { useEffect, useState } from 'react';
import { api } from '../api';
import { formatInFacilityTz } from '../time';

type Pack = {
  generatedAt: string;
  facilityTimezone: string;
  range: { from: string; to: string };
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
      <p className="page-sub">Last 30 days · survey-ready summary with audit trail.</p>
      {error ? <div className="error">{error}</div> : null}
      {pack ? (
        <>
          <div style={{ marginBottom: '1rem' }}>
            <button className="btn" type="button" onClick={downloadJson}>
              Download JSON
            </button>
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
