import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';

type Resident = {
  id: string;
  firstName: string;
  lastName: string;
  room: string | null;
};

type Draft = {
  drugName: string;
  dose: string;
  route: string;
  frequency: string;
  scheduleTimes: string[];
  isPrn: boolean;
  instructions?: string;
  brand?: string;
  rxNumber?: string;
  imprint?: string;
  categoryLabel?: string;
  prescriber?: string;
  highAlert?: boolean;
  startDate?: string;
};

type Intake = {
  id: string;
  residentId: string;
  fileName: string;
  contentType: string;
  hasImage: boolean;
  rawText: string | null;
  drafts: Draft[];
  status: string;
  extractNote: string | null;
  createdAt: string;
  aiEnabled: boolean;
};

const emptyDraft = (): Draft => ({
  drugName: '',
  dose: '',
  route: 'PO',
  frequency: 'Daily',
  scheduleTimes: ['08:00'],
  isPrn: false,
  instructions: '',
  startDate: new Date().toISOString().slice(0, 10),
  highAlert: false,
});

async function fileToDataUrl(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  const b64 = btoa(binary);
  return `data:${file.type || 'application/octet-stream'};base64,${b64}`;
}

export function OrderIntakePage() {
  const { user } = useAuth();
  const canWrite = ['OWNER', 'ADMIN', 'NURSE'].includes(user?.role || '');
  const [params] = useSearchParams();
  const [residents, setResidents] = useState<Resident[]>([]);
  const [residentId, setResidentId] = useState(params.get('residentId') || '');
  const [rawText, setRawText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [intake, setIntake] = useState<Intake | null>(null);
  const [history, setHistory] = useState<Intake[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);

  async function loadResidents() {
    const rows = await api<Resident[]>('/residents');
    setResidents(rows);
    if (!residentId && rows[0]) setResidentId(rows[0].id);
  }

  async function loadHistory(rid: string) {
    if (!rid) return;
    const rows = await api<Intake[]>(`/emar/order-intake?residentId=${encodeURIComponent(rid)}`);
    setHistory(rows);
  }

  useEffect(() => {
    void loadResidents().catch((e) =>
      setError(e instanceof Error ? e.message : 'Failed to load residents'),
    );
    api<{ aiEnabled: boolean }>('/emar/order-intake/status')
      .then((s) => setAiEnabled(s.aiEnabled))
      .catch(() => setAiEnabled(false));
  }, []);

  useEffect(() => {
    if (residentId) void loadHistory(residentId).catch(() => setHistory([]));
  }, [residentId]);

  async function submitUpload(e: FormEvent) {
    e.preventDefault();
    if (!canWrite || !residentId) return;
    setBusy(true);
    setError('');
    setToast('');
    try {
      let dataUrl: string | undefined;
      let contentType = 'text/plain';
      let fileName = 'pasted-order.txt';
      if (file) {
        if (file.size > 1_800_000) throw new Error('File too large (max ~1.5MB)');
        dataUrl = await fileToDataUrl(file);
        contentType = file.type || 'application/octet-stream';
        fileName = file.name;
      }
      const result = await api<Intake>('/emar/order-intake', {
        method: 'POST',
        body: JSON.stringify({
          residentId,
          fileName,
          contentType,
          dataUrl,
          rawText: rawText.trim() || undefined,
        }),
      });
      setIntake(result);
      setDrafts(result.drafts.length ? result.drafts : [emptyDraft()]);
      setToast(result.extractNote || 'Extracted — review drafts');
      setAiEnabled(result.aiEnabled);
      await loadHistory(residentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function saveDrafts() {
    if (!intake) return;
    setBusy(true);
    setError('');
    try {
      const updated = await api<Intake>(`/emar/order-intake/${intake.id}/drafts`, {
        method: 'PATCH',
        body: JSON.stringify({ drafts }),
      });
      setIntake(updated);
      setToast('Drafts saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!intake) return;
    setBusy(true);
    setError('');
    try {
      await api(`/emar/order-intake/${intake.id}/drafts`, {
        method: 'PATCH',
        body: JSON.stringify({ drafts }),
      });
      const result = await api<{ orders: Array<{ id: string; drugName: string }> }>(
        `/emar/order-intake/${intake.id}/approve`,
        { method: 'POST', body: '{}' },
      );
      setToast(`Approved ${result.orders.length} order(s) onto eMAR`);
      setIntake(null);
      setDrafts([]);
      setRawText('');
      setFile(null);
      await loadHistory(residentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approve failed');
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!intake) return;
    setBusy(true);
    try {
      await api(`/emar/order-intake/${intake.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reviewNotes: 'Rejected from order intake UI' }),
      });
      setToast('Intake rejected');
      setIntake(null);
      setDrafts([]);
      await loadHistory(residentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reject failed');
    } finally {
      setBusy(false);
    }
  }

  function updateDraft(i: number, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  if (!canWrite) {
    return (
      <div className="page-enter">
        <h1 className="page-title">Order intake</h1>
        <p className="empty">Nurse / admin access required to approve medication orders.</p>
      </div>
    );
  }

  return (
    <div className="order-intake page-enter">
      <h1 className="page-title">Order intake</h1>
      <p className="page-sub">
        Upload a doctor/pharmacy order or paste text → review drafts → approve onto eMAR.
        {aiEnabled ? ' AI vision is enabled.' : ' Paste text works offline; set OPENAI_API_KEY for photo OCR.'}
      </p>
      {error ? <div className="error">{error}</div> : null}
      {toast ? <div className="toast toast-success">{toast}</div> : null}

      <form className="download-panel" onSubmit={submitUpload}>
        <h2>New intake</h2>
        <div className="download-controls">
          <div className="field">
            <label>Resident</label>
            <select value={residentId} onChange={(e) => setResidentId(e.target.value)} required>
              {residents.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.lastName}, {r.firstName}
                  {r.room ? ` · Rm ${r.room}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Photo / PDF (optional)</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
        </div>
        <div className="field" style={{ marginTop: '0.75rem' }}>
          <label>Order text (paste or type)</label>
          <textarea
            rows={5}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={'Lisinopril 10 mg PO Daily 08:00, 20:00\nAcetaminophen 650 mg PO PRN pain'}
          />
        </div>
        <button className="btn" type="submit" disabled={busy || (!file && !rawText.trim())}>
          {busy ? 'Working…' : 'Upload & extract'}
        </button>
        {residentId ? (
          <Link className="btn secondary" to={`/residents/${residentId}`} style={{ marginLeft: '0.5rem' }}>
            Open chart
          </Link>
        ) : null}
      </form>

      {intake && drafts.length ? (
        <section className="download-panel" style={{ marginTop: '1.25rem' }}>
          <h2>
            Review drafts · <span className="badge warn">{intake.status}</span>
          </h2>
          <p className="meta">{intake.extractNote}</p>
          {drafts.map((d, i) => (
            <div key={i} className="intake-draft">
              <div className="download-controls">
                <div className="field">
                  <label>Drug</label>
                  <input
                    value={d.drugName}
                    onChange={(e) => updateDraft(i, { drugName: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label>Dose</label>
                  <input value={d.dose} onChange={(e) => updateDraft(i, { dose: e.target.value })} />
                </div>
                <div className="field">
                  <label>Route</label>
                  <input value={d.route} onChange={(e) => updateDraft(i, { route: e.target.value })} />
                </div>
                <div className="field">
                  <label>Frequency</label>
                  <input
                    value={d.frequency}
                    onChange={(e) => updateDraft(i, { frequency: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Times (HH:MM, comma)</label>
                  <input
                    value={d.scheduleTimes.join(', ')}
                    disabled={d.isPrn}
                    onChange={(e) =>
                      updateDraft(i, {
                        scheduleTimes: e.target.value
                          .split(',')
                          .map((t) => t.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </div>
                <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={d.isPrn}
                    onChange={(e) =>
                      updateDraft(i, {
                        isPrn: e.target.checked,
                        scheduleTimes: e.target.checked ? [] : d.scheduleTimes.length ? d.scheduleTimes : ['08:00'],
                        frequency: e.target.checked ? 'PRN' : d.frequency || 'Daily',
                      })
                    }
                  />
                  PRN
                </label>
                <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(d.highAlert)}
                    onChange={(e) => updateDraft(i, { highAlert: e.target.checked })}
                  />
                  High alert
                </label>
              </div>
              <div className="field">
                <label>Instructions</label>
                <input
                  value={d.instructions || ''}
                  onChange={(e) => updateDraft(i, { instructions: e.target.value })}
                />
              </div>
              <button
                className="btn ghost"
                type="button"
                onClick={() => setDrafts((prev) => prev.filter((_, idx) => idx !== i))}
              >
                Remove draft
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
            <button className="btn secondary" type="button" onClick={() => setDrafts((p) => [...p, emptyDraft()])}>
              Add draft
            </button>
            <button className="btn secondary" type="button" disabled={busy} onClick={() => void saveDrafts()}>
              Save drafts
            </button>
            <button className="btn" type="button" disabled={busy} onClick={() => void approve()}>
              Approve to eMAR
            </button>
            <button className="btn ghost" type="button" disabled={busy} onClick={() => void reject()}>
              Reject
            </button>
          </div>
        </section>
      ) : null}

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontFamily: 'var(--font-display)' }}>Recent intakes</h2>
        <div className="stack">
          {history.length === 0 ? <p className="empty">No intakes for this resident yet.</p> : null}
          {history.map((h) => (
            <button
              key={h.id}
              type="button"
              className="home-row"
              onClick={() => {
                setIntake(h);
                setDrafts(h.drafts?.length ? h.drafts : [emptyDraft()]);
              }}
            >
              <div>
                <strong>{h.fileName}</strong>
                <div className="meta">{new Date(h.createdAt).toLocaleString()}</div>
              </div>
              <span className={`badge ${h.status === 'APPROVED' ? 'ok' : h.status === 'REJECTED' ? 'danger' : 'warn'}`}>
                {h.status}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
