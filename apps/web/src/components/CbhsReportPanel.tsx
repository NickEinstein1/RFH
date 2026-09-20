import { useCallback, useEffect, useState } from 'react';
import { api, downloadFile } from '../api';
import { useAuth } from '../auth';
import { formatInFacilityTz } from '../time';
import { enqueueNoteEvent, pendingCount } from '../offlineQueue';
import {
  addBehaviorDay,
  blankCbhsIncidentForm,
  type CbhsIncidentForm,
} from '../templates/cbhsIncidentReport';

export type CbhsIncidentRecord = {
  id: string;
  title: string;
  category: string;
  severity: string;
  status: string;
  occurredAt: string;
  narrative: string;
  immediateActions: string | null;
  formData?: CbhsIncidentForm | null;
  resident: {
    id: string;
    firstName: string;
    lastName: string;
    room: string | null;
    dateOfBirth?: string;
  };
  reportedBy: { firstName: string; lastName: string };
};

type ResidentOption = {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
};

const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

type Props = {
  timezone: string;
  /** When set, list/create are scoped to this resident (Notes tab). */
  lockedResidentId?: string;
  lockedResident?: ResidentOption | null;
  heading?: string;
  subheading?: string;
};

export function CbhsReportPanel({
  timezone,
  lockedResidentId,
  lockedResident,
  heading = 'Notes & incident reports',
  subheading,
}: Props) {
  const { user } = useAuth();
  const canWrite = user?.role !== 'FAMILY_VIEWER';
  const canClose = ['OWNER', 'ADMIN', 'NURSE'].includes(user?.role || '');
  const [rows, setRows] = useState<CbhsIncidentRecord[]>([]);
  const [residents, setResidents] = useState<ResidentOption[]>([]);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [residentId, setResidentId] = useState(lockedResidentId || '');
  const [severity, setSeverity] = useState('MEDIUM');
  const [form, setForm] = useState<CbhsIncidentForm | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const qs = lockedResidentId
        ? `?residentId=${encodeURIComponent(lockedResidentId)}`
        : '';
      if (lockedResidentId) {
        const inc = await api<CbhsIncidentRecord[]>(`/incidents${qs}`);
        setRows(inc);
        if (lockedResident) {
          setResidents([lockedResident]);
          setResidentId(lockedResident.id);
        }
      } else {
        const [inc, res] = await Promise.all([
          api<CbhsIncidentRecord[]>('/incidents'),
          api<ResidentOption[]>('/residents'),
        ]);
        setRows(inc);
        setResidents(res);
        if (!residentId && res[0]) setResidentId(res[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reports');
    }
  }, [lockedResidentId, lockedResident, residentId]);

  useEffect(() => {
    void load();
  }, [load]);

  function resolveResident(): ResidentOption | undefined {
    if (lockedResident) return lockedResident;
    return residents.find((x) => x.id === residentId) || residents[0];
  }

  function startNew() {
    const r = resolveResident();
    if (!r) {
      setError('Add a resident first');
      return;
    }
    setResidentId(r.id);
    setEditingId(null);
    setSeverity('MEDIUM');
    setForm(
      blankCbhsIncidentForm({
        fullLegalName: `${r.lastName}, ${r.firstName}`,
        dateOfBirth: r.dateOfBirth?.slice(0, 10),
        facilityName: user?.tenantName,
        monthYearServices: new Date().toLocaleString('en-US', {
          month: 'long',
          year: 'numeric',
        }),
        caregiverInitials: user
          ? `${user.firstName[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase()
          : '',
      }),
    );
    setMode('edit');
  }

  function startEdit(inc: CbhsIncidentRecord) {
    setEditingId(inc.id);
    setResidentId(inc.resident.id);
    setSeverity(inc.severity);
    setForm(
      (inc.formData as CbhsIncidentForm) ||
        blankCbhsIncidentForm({
          fullLegalName: `${inc.resident.lastName}, ${inc.resident.firstName}`,
          facilityName: user?.tenantName,
        }),
    );
    setMode('edit');
  }

  async function save() {
    if (!form || !residentId) return;
    setBusy(true);
    setError('');
    const filled = form.entries.filter(
      (e) => e.behaviorObserved.trim() || e.interventionApplied.trim(),
    );
    const narrative =
      filled
        .slice(0, 8)
        .map(
          (e) =>
            `${e.date} ${e.timeInterval}: ${e.behaviorObserved} → ${e.interventionApplied}`,
        )
        .join('\n') || 'CBHS note / incident log';
    const title = `CBHS Note / Incident — ${form.client.monthYearServices || form.client.fullLegalName}`;
    try {
      if (editingId) {
        await api(`/incidents/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title,
            narrative,
            severity,
            category: 'BEHAVIOR',
            formData: form,
            immediateActions: filled
              .map((e) => e.interventionApplied)
              .filter(Boolean)
              .join('; '),
          }),
        });
      } else {
        const payload = {
          residentId,
          occurredAt: new Date().toISOString(),
          category: 'BEHAVIOR',
          severity,
          title,
          narrative,
          immediateActions: filled
            .map((e) => e.interventionApplied)
            .filter(Boolean)
            .join('; '),
          formData: form,
          clientEventId: crypto.randomUUID(),
        };
        if (!navigator.onLine) {
          enqueueNoteEvent(payload);
          setError(`Offline — note queued (${pendingCount()} pending sync)`);
          setMode('list');
          setForm(null);
          return;
        }
        await api('/incidents', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setMode('list');
      setForm(null);
      setEditingId(null);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      if (!editingId && /failed to fetch|network|offline/i.test(msg) && form && residentId) {
        enqueueNoteEvent({
          clientEventId: crypto.randomUUID(),
          residentId,
          occurredAt: new Date().toISOString(),
          category: 'BEHAVIOR',
          severity,
          title,
          narrative,
          immediateActions: filled
            .map((x) => x.interventionApplied)
            .filter(Boolean)
            .join('; '),
          formData: form as unknown as Record<string, unknown>,
        });
        setError(`${msg} — queued offline`);
        setMode('list');
        setForm(null);
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  async function closeIncident(id: string) {
    try {
      await api(`/incidents/${id}/close`, { method: 'POST' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Close failed');
    }
  }

  async function deleteIncident(id: string) {
    if (!confirm('Delete this note / incident report?')) return;
    try {
      await api(`/incidents/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  if (mode === 'edit' && form) {
    return (
      <div className="tpl-page">
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            setMode('list');
            setForm(null);
          }}
        >
          ← All notes & reports
        </button>
        <header className="tpl-doc-header">
          <div>
            <div className="mar-title">{form.documentTitle}</div>
            <div className="meta">
              {user?.tenantName} · saved to shared incident notes database
            </div>
          </div>
          <div className="resident-row-actions">
            <button className="btn" type="button" disabled={busy} onClick={() => void save()}>
              {busy ? 'Saving…' : editingId ? 'Update report' : 'Save report'}
            </button>
            {editingId ? (
              <button
                className="btn secondary"
                type="button"
                onClick={() => {
                  void downloadFile(`/downloads/incident/${editingId}`, 'CBHS.pdf').catch((e) =>
                    setError(e instanceof Error ? e.message : 'Download failed'),
                  );
                }}
              >
                Download PDF
              </button>
            ) : null}
          </div>
        </header>
        {error ? <div className="error">{error}</div> : null}

        <section className="tpl-section">
          <h2>Client information</h2>
          <div className="tpl-grid">
            {!lockedResidentId ? (
              <div className="field">
                <label>Resident</label>
                <select
                  value={residentId}
                  disabled={Boolean(editingId)}
                  onChange={(e) => {
                    const id = e.target.value;
                    setResidentId(id);
                    const r = residents.find((x) => x.id === id);
                    if (r) {
                      setForm({
                        ...form,
                        client: {
                          ...form.client,
                          fullLegalName: `${r.lastName}, ${r.firstName}`,
                          dateOfBirth:
                            r.dateOfBirth?.slice(0, 10) || form.client.dateOfBirth,
                        },
                      });
                    }
                  }}
                >
                  {residents.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.lastName}, {r.firstName}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="field">
              <label>Severity</label>
              <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            {(
              [
                ['fullLegalName', 'Full legal name of resident'],
                ['dateOfBirth', "Client's date of birth"],
                ['providerOneId', 'ProviderOne ID'],
                ['facilityName', 'Facility providing services'],
                ['facilityAddress', 'Facility address'],
                ['tierLevel', 'Tier level'],
                ['monthYearServices', 'Month & year CBHS services provided'],
                ['caregiverInitials', 'Caregiver initials'],
              ] as const
            ).map(([key, label]) => (
              <div className="field" key={key}>
                <label>{label}</label>
                <input
                  value={form.client[key]}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      client: { ...form.client, [key]: e.target.value },
                    })
                  }
                />
              </div>
            ))}
          </div>
        </section>

        <section className="tpl-section">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <h2 style={{ margin: 0 }}>Behaviors and standard interventions</h2>
            <button
              type="button"
              className="btn secondary"
              onClick={() =>
                setForm(addBehaviorDay(form, new Date().toISOString().slice(0, 10)))
              }
            >
              Add day (6 intervals)
            </button>
          </div>
          <div className="tpl-table-wrap">
            <table className="tpl-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time interval</th>
                  <th>Behavior observed</th>
                  <th>Standard intervention applied (first-person)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {form.entries.map((entry, i) => (
                  <tr key={entry.id}>
                    <td>
                      <input
                        value={entry.date}
                        onChange={(e) => {
                          const entries = form.entries.map((x, idx) =>
                            idx === i ? { ...x, date: e.target.value } : x,
                          );
                          setForm({ ...form, entries });
                        }}
                      />
                    </td>
                    <td>
                      <input
                        value={entry.timeInterval}
                        onChange={(e) => {
                          const entries = form.entries.map((x, idx) =>
                            idx === i ? { ...x, timeInterval: e.target.value } : x,
                          );
                          setForm({ ...form, entries });
                        }}
                      />
                    </td>
                    <td>
                      <textarea
                        rows={2}
                        value={entry.behaviorObserved}
                        onChange={(e) => {
                          const entries = form.entries.map((x, idx) =>
                            idx === i ? { ...x, behaviorObserved: e.target.value } : x,
                          );
                          setForm({ ...form, entries });
                        }}
                      />
                    </td>
                    <td>
                      <textarea
                        rows={2}
                        value={entry.interventionApplied}
                        onChange={(e) => {
                          const entries = form.entries.map((x, idx) =>
                            idx === i ? { ...x, interventionApplied: e.target.value } : x,
                          );
                          setForm({ ...form, entries });
                        }}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() =>
                          setForm({
                            ...form,
                            entries: form.entries.filter((_, idx) => idx !== i),
                          })
                        }
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="mar-actions">
          <button className="btn" type="button" disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : editingId ? 'Update report' : 'Save report'}
          </button>
          <button
            className="btn ghost"
            type="button"
            onClick={() => {
              setMode('list');
              setForm(null);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title" style={{ fontSize: lockedResidentId ? '1.4rem' : undefined }}>
        {heading}
      </h1>
      <p className="page-sub">
        {subheading ||
          `CBHS note/incident form · ${user?.tenantName || 'Facility'} · same database for Notes and Incidents`}
      </p>
      {error ? <div className="error">{error}</div> : null}
      {canWrite ? (
        <div style={{ marginBottom: '1rem' }}>
          <button className="btn" type="button" onClick={startNew}>
            New note / incident report
          </button>
        </div>
      ) : null}
      <div className="stack">
        {rows.length === 0 ? (
          <p className="empty">No notes or incident reports yet.</p>
        ) : null}
        {rows.map((i) => (
          <div
            key={i.id}
            className="note-row"
            style={{ flexDirection: 'column', alignItems: 'stretch' }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '1rem',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <strong>{i.title}</strong>
                <div className="meta">
                  {i.resident.lastName}, {i.resident.firstName} · {i.category} · {i.severity} ·{' '}
                  {formatInFacilityTz(i.occurredAt, timezone)} · by {i.reportedBy.firstName}{' '}
                  {i.reportedBy.lastName}
                </div>
              </div>
              <span className={`badge ${i.status === 'CLOSED' ? 'ok' : 'warn'}`}>{i.status}</span>
            </div>
            <p style={{ margin: '0.75rem 0 0', whiteSpace: 'pre-wrap' }}>
              {i.narrative.length > 280 ? `${i.narrative.slice(0, 280)}…` : i.narrative}
            </p>
            <div className="resident-row-actions" style={{ marginTop: '0.75rem' }}>
              {canWrite ? (
                <button className="btn secondary" type="button" onClick={() => startEdit(i)}>
                  Edit
                </button>
              ) : null}
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  void downloadFile(`/downloads/incident/${i.id}`, 'CBHS.pdf').catch((e) =>
                    setError(e instanceof Error ? e.message : 'Download failed'),
                  );
                }}
              >
                PDF
              </button>
              {canClose && i.status !== 'CLOSED' ? (
                <button className="btn" type="button" onClick={() => void closeIncident(i.id)}>
                  Close
                </button>
              ) : null}
              {canClose ? (
                <button
                  className="btn danger"
                  type="button"
                  onClick={() => void deleteIncident(i.id)}
                >
                  Delete
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
