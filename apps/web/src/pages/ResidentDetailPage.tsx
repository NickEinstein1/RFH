import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { formatInFacilityTz, todayInFacilityTz } from '../time';
import { formatUsDate } from '../usDate';
import {
  cacheSnapshot,
  enqueueMedEvent,
  enqueueTaskEvent,
  flushAllOfflineQueues,
  isOnline,
  pendingCount,
  readSnapshot,
} from '../offlineQueue';
import { fileToResidentPhotoDataUrl } from '../residentPhoto';
import { PrnRecordModal } from '../components/PrnRecordModal';
import { CbhsReportPanel } from '../components/CbhsReportPanel';
import { SafetyConfirmModal } from '../components/SafetyConfirmModal';
import { prnPayloadFromForm } from '../marBackGuides';
import { safetyWarningsFromError, type SafetyWarning } from '../safetyTypes';

type Resident = {
  id: string;
  firstName: string;
  lastName: string;
  room: string | null;
  allergies: string[];
  photoUrl: string | null;
  dateOfBirth?: string;
};

type Slot = {
  order: {
    id: string;
    drugName: string;
    dose: string;
    route: string;
    instructions: string | null;
  };
  scheduledAt: string | null;
  isPrn: boolean;
  administration: {
    id: string;
    outcome: string;
    administeredAt: string | null;
  } | null;
};

type TaskSlot = {
  task: {
    id: string;
    title: string;
    category: string;
    shift: string;
    instructions: string | null;
  };
  scheduledAt: string;
  completion: { id: string; outcome: string } | null;
};

type CarePlan = {
  id: string;
  title: string;
  goals: string | null;
  status: string;
  careTasks: { id: string; title: string; category: string }[];
};

const TASK_OUTCOMES = ['DONE', 'REFUSED', 'UNABLE', 'SKIPPED'] as const;

export function ResidentDetailPage({ timezone }: { timezone: string }) {
  const { id } = useParams();
  const { user } = useAuth();
  const isFamily = user?.role === 'FAMILY_VIEWER';
  const [tab, setTab] = useState<'meds' | 'tasks' | 'notes' | 'plan'>(
    isFamily ? 'notes' : 'meds',
  );
  const [resident, setResident] = useState<Resident | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [taskSlots, setTaskSlots] = useState<TaskSlot[]>([]);
  const [plans, setPlans] = useState<CarePlan[]>([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, setPending] = useState(() => pendingCount());
  const [online, setOnline] = useState(() => isOnline());
  const [photoBusy, setPhotoBusy] = useState(false);
  const [syncNote, setSyncNote] = useState('');
  const [prnSlot, setPrnSlot] = useState<Slot | null>(null);
  const [safety, setSafety] = useState<{
    warnings: SafetyWarning[];
    body: Record<string, unknown>;
    safetyChallengeToken?: string;
  } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError('');
    const date = todayInFacilityTz(timezone);
    try {
      const r = await api<Resident>(`/residents/${id}`);
      setResident(r);

      const plansP = api<CarePlan[]>(`/care/plans?residentId=${id}`);

      if (isFamily) {
        const p = await plansP;
        setPlans(p);
        setSlots([]);
        setTaskSlots([]);
      } else {
        const snapP = api<{ slots: Slot[] }>(
          `/emar/sync/snapshot?residentId=${id}&date=${date}`,
        );
        const [snap, tasks, p] = await Promise.all([
          snapP,
          api<{ slots: TaskSlot[] }>(`/care/task-board?residentId=${id}&date=${date}`),
          plansP,
        ]);
        setSlots(snap.slots);
        cacheSnapshot(id, date, snap);
        setTaskSlots(tasks.slots);
        setPlans(p);
      }
    } catch (e) {
      if (!isFamily && !navigator.onLine) {
        const cached = readSnapshot<{ slots: Slot[] }>(id, date);
        if (cached) {
          setSlots(cached.slots);
          setError('Offline — showing cached med pass. Doses will sync when online.');
          return;
        }
      }
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, [id, isFamily, timezone]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void flushAllOfflineQueues()
        .then((r) => {
          setPending(pendingCount());
          if (r.conflicts > 0) {
            setSyncNote(
              `${r.conflicts} dose(s) conflicted with server — facility record kept. Review those slots.`,
            );
          } else if (r.flushed > 0) {
            setSyncNote(`Synced ${r.flushed} offline action(s).`);
          }
        })
        .then(() => load())
        .catch(() => undefined);
    };
    const onOffline = () => setOnline(false);
    const onQueue = () => setPending(pendingCount());
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('rfh-offline-queue', onQueue);
    if (navigator.onLine) {
      void flushAllOfflineQueues().then(() => setPending(pendingCount()));
    }
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('rfh-offline-queue', onQueue);
    };
  }, [load]);

  async function record(
    slot: Slot,
    outcome: 'GIVEN' | 'REFUSED' | 'HELD' | 'MISSED',
    prn?: ReturnType<typeof prnPayloadFromForm>,
  ) {
    if (!slot.scheduledAt && !slot.isPrn) return;
    if (!id) return;
    if (outcome === 'GIVEN' && slot.isPrn && !prn) {
      setPrnSlot(slot);
      return;
    }
    setBusyId(`${slot.order.id}-${outcome}`);
    setError('');
    const clientEventId = crypto.randomUUID();
    const administeredAt = outcome === 'GIVEN' ? new Date().toISOString() : undefined;
    const body = {
      orderId: slot.order.id,
      scheduledAt: slot.scheduledAt ?? new Date().toISOString(),
      outcome,
      administeredAt,
      clientEventId,
      ...prn,
    };
    try {
      if (!navigator.onLine) {
        enqueueMedEvent({ ...body, residentId: id });
        setPending(pendingCount());
        setSlots((prev) =>
          prev.map((s) =>
            s.order.id === slot.order.id && s.scheduledAt === slot.scheduledAt
              ? {
                  ...s,
                  administration: {
                    id: clientEventId,
                    outcome,
                    administeredAt: administeredAt ?? null,
                  },
                }
              : s,
          ),
        );
        setPrnSlot(null);
        setSafety(null);
        setError('Saved offline — will sync when connection returns.');
        return;
      }
      await api('/emar/administrations', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setPrnSlot(null);
      setSafety(null);
      await load();
    } catch (e) {
      const warnings = safetyWarningsFromError(e);
      if (warnings && outcome === 'GIVEN') {
        setSafety({
          warnings: warnings.warnings,
          body,
          safetyChallengeToken: warnings.safetyChallengeToken,
        });
        return;
      }
      const msg = e instanceof Error ? e.message : 'Failed to record dose';
      const looksNetwork =
        !navigator.onLine || /failed to fetch|networkerror|load failed|offline/i.test(msg);
      if (looksNetwork) {
        enqueueMedEvent({ ...body, residentId: id });
        setPending(pendingCount());
        setError(`${msg} — queued offline for retry`);
      } else {
        setError(msg);
      }
    } finally {
      setBusyId(null);
    }
  }

  async function recordTask(slot: TaskSlot, outcome: (typeof TASK_OUTCOMES)[number]) {
    if (!id) return;
    setBusyId(`${slot.task.id}-${outcome}`);
    setError('');
    const clientEventId = crypto.randomUUID();
    const body = {
      careTaskId: slot.task.id,
      scheduledAt: slot.scheduledAt,
      outcome,
      completedAt: new Date().toISOString(),
      clientEventId,
    };
    try {
      if (!navigator.onLine) {
        enqueueTaskEvent({ ...body, residentId: id });
        setPending(pendingCount());
        setError('Offline — task queued for sync');
        return;
      }
      await api('/care/completions', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to record task';
      const looksNetwork = /failed to fetch|network|offline/i.test(msg);
      if (looksNetwork) {
        enqueueTaskEvent({ ...body, residentId: id });
        setPending(pendingCount());
        setError(`${msg} — queued offline for retry`);
      } else {
        setError(msg);
      }
    } finally {
      setBusyId(null);
    }
  }

  async function onPhotoSelected(file: File | null) {
    if (!file || !id) return;
    setPhotoBusy(true);
    setError('');
    try {
      const photoUrl = await fileToResidentPhotoDataUrl(file);
      const updated = await api<Resident>(`/residents/${id}/photo`, {
        method: 'POST',
        body: JSON.stringify({ photoUrl }),
      });
      setResident(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload photo');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function clearPhoto() {
    if (!id) return;
    setPhotoBusy(true);
    setError('');
    try {
      const updated = await api<Resident>(`/residents/${id}/photo`, { method: 'DELETE' });
      setResident(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove photo');
    } finally {
      setPhotoBusy(false);
    }
  }

  if (!resident && !error) return <p className="empty">Loading…</p>;

  return (
    <div>
      <Link to="/residents" className="meta">
        ← Residents
      </Link>

      <div className="resident-profile-header">
        <div className="resident-photo-wrap">
          {resident?.photoUrl ? (
            <img
              className="resident-photo"
              src={resident.photoUrl}
              alt={`${resident.lastName}, ${resident.firstName}`}
            />
          ) : (
            <div className="resident-photo placeholder" aria-hidden>
              {(resident?.firstName?.[0] || '?') + (resident?.lastName?.[0] || '')}
            </div>
          )}
          {!isFamily ? (
            <div className="resident-photo-actions">
              <label className="btn secondary photo-upload-btn">
                {photoBusy ? 'Saving…' : resident?.photoUrl ? 'Change photo' : 'Add photo'}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  disabled={photoBusy}
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    e.target.value = '';
                    void onPhotoSelected(file);
                  }}
                />
              </label>
              {resident?.photoUrl ? (
                <button
                  type="button"
                  className="btn ghost"
                  disabled={photoBusy}
                  onClick={() => void clearPhoto()}
                >
                  Remove
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div>
          <h1 className="page-title" style={{ marginTop: 0 }}>
            {resident ? `${resident.lastName}, ${resident.firstName}` : 'Resident'}
          </h1>
          <p className="page-sub">
            {user?.tenantName ? `${user.tenantName} · ` : ''}
            Room {resident?.room || '—'}
            {resident?.dateOfBirth ? ` · DOB ${formatUsDate(resident.dateOfBirth)}` : ''}
            {resident?.allergies?.length ? ` · Allergies: ${resident.allergies.join(', ')}` : ''}
            {!isFamily
              ? ` · ${online ? 'Online' : 'Offline'}${pending ? ` · ${pending} queued` : ''}`
              : ''}
          </p>
        </div>
      </div>
      {error ? <div className="error">{error}</div> : null}

      <div className="tabs">
        {!isFamily ? (
          <>
            <button className={`btn ${tab === 'meds' ? '' : 'secondary'}`} onClick={() => setTab('meds')}>
              Med Pass
            </button>
            <button className={`btn ${tab === 'tasks' ? '' : 'secondary'}`} onClick={() => setTab('tasks')}>
              Tasks
            </button>
          </>
        ) : null}
        <button className={`btn ${tab === 'plan' ? '' : 'secondary'}`} onClick={() => setTab('plan')}>
          Care plan
        </button>
        <button className={`btn ${tab === 'notes' ? '' : 'secondary'}`} onClick={() => setTab('notes')}>
          Notes / Incidents
        </button>
      </div>

      {tab === 'meds' ? (
        <div className="stack med-pass-panel">
          {syncNote ? (
            <div className={`toast ${syncNote.includes('conflict') ? 'toast-warn' : 'toast-success'}`}>
              {syncNote}
              <button className="btn ghost" type="button" onClick={() => setSyncNote('')}>
                Dismiss
              </button>
            </div>
          ) : null}
          <div className="med-pass-toolbar">
            <p className="meta" style={{ margin: 0 }}>
              Tap once — Record ✓ · Reject · Not given · Held. Soft safety checks before give.
            </p>
            <Link className="btn secondary" to={`/orders/intake?residentId=${id}`}>
              Order intake
            </Link>
            <Link
              className="btn secondary"
              to={`/residents/${id}/mar?month=${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`}
            >
              Open MAR sheet
            </Link>
          </div>
          {slots.length === 0 ? <p className="empty">No medications due today.</p> : null}
          {[...slots]
            .sort((a, b) => {
              if (a.isPrn !== b.isPrn) return a.isPrn ? 1 : -1;
              if (Boolean(a.administration) !== Boolean(b.administration)) {
                return a.administration ? 1 : -1;
              }
              return (a.scheduledAt || '').localeCompare(b.scheduledAt || '');
            })
            .map((slot) => {
            const outcome = slot.administration?.outcome;
            const mark =
              outcome === 'GIVEN' ? '✓' : outcome === 'REFUSED' || outcome === 'HELD' ? 'X' : outcome === 'MISSED' ? '-' : null;
            return (
              <div
                key={`${slot.order.id}-${slot.scheduledAt}`}
                className={`slot-row med-slot ${mark ? 'med-slot-done' : 'med-slot-due'}`}
              >
                <div className="med-slot-head">
                  <div>
                    <strong className="med-slot-title">
                      {slot.order.drugName} {slot.order.dose}
                      {slot.isPrn ? ' · PRN' : ''}
                    </strong>
                    <div className="meta">
                      {slot.order.route}
                      {slot.isPrn
                        ? ' · As needed'
                        : ` · Due ${slot.scheduledAt ? formatInFacilityTz(slot.scheduledAt, timezone, { timeStyle: 'short' }) : ''}`}
                    </div>
                    {slot.order.instructions ? (
                      <div className="meta" style={{ marginTop: 4 }}>
                        {slot.order.instructions}
                      </div>
                    ) : null}
                  </div>
                  {mark ? (
                    <span
                      className={`badge ${
                        mark === '✓' ? 'ok' : mark === 'X' ? 'danger' : 'warn'
                      }`}
                      title={outcome || undefined}
                    >
                      MAR {mark}
                    </span>
                  ) : (
                    <span className="badge warn">DUE</span>
                  )}
                </div>
                <div className="outcome-grid med-record-grid med-pass-actions">
                  <button
                    className="btn med-btn-primary"
                    disabled={busyId !== null}
                    onClick={() => void record(slot, 'GIVEN')}
                  >
                    {slot.isPrn ? 'PRN Record ✓' : 'Record ✓'}
                  </button>
                  <button
                    className="btn danger"
                    disabled={busyId !== null}
                    onClick={() => void record(slot, 'REFUSED')}
                  >
                    Reject X
                  </button>
                  <button
                    className="btn secondary"
                    disabled={busyId !== null}
                    onClick={() => void record(slot, 'MISSED')}
                  >
                    Not given -
                  </button>
                  <button
                    className="btn warn"
                    disabled={busyId !== null}
                    onClick={() => void record(slot, 'HELD')}
                  >
                    Held X
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {tab === 'tasks' ? (
        <div className="stack">
          {taskSlots.length === 0 ? <p className="empty">No tasks scheduled today.</p> : null}
          {taskSlots.map((slot) => {
            const done = Boolean(slot.completion);
            return (
              <div
                key={`${slot.task.id}-${slot.scheduledAt}`}
                className="slot-row"
                style={{ alignItems: 'stretch', flexDirection: 'column' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div>
                    <strong style={{ fontSize: '1.2rem' }}>{slot.task.title}</strong>
                    <div className="meta">
                      {slot.task.category} · {slot.task.shift} ·{' '}
                      {formatInFacilityTz(slot.scheduledAt, timezone, { timeStyle: 'short' })}
                    </div>
                    {slot.task.instructions ? (
                      <div className="meta" style={{ marginTop: 4 }}>
                        {slot.task.instructions}
                      </div>
                    ) : null}
                  </div>
                  {done ? (
                    <span className={`badge ${slot.completion?.outcome === 'DONE' ? 'ok' : 'warn'}`}>
                      {slot.completion?.outcome}
                    </span>
                  ) : (
                    <span className="badge warn">DUE</span>
                  )}
                </div>
                {!done ? (
                  <div className="outcome-grid">
                    {TASK_OUTCOMES.map((o) => (
                      <button
                        key={o}
                        className={`btn ${o === 'DONE' ? '' : 'secondary'}`}
                        disabled={busyId !== null}
                        onClick={() => void recordTask(slot, o)}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {tab === 'plan' ? (
        <div className="stack">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
            <p className="meta" style={{ margin: 0 }}>
              Negotiated Care Plan template (Word form)
            </p>
            <Link className="btn secondary" to={`/residents/${id}/care-plan`}>
              Open care plans
            </Link>
          </div>
          {plans.length === 0 ? <p className="empty">No care plan on file.</p> : null}
          {plans.map((p) => (
            <div key={p.id} className="note-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '1.2rem' }}>{p.title}</strong>
                <span className={`badge ${p.status === 'ACTIVE' ? 'ok' : 'neutral'}`}>{p.status}</span>
              </div>
              {p.goals ? <p style={{ margin: '0.5rem 0' }}>{p.goals}</p> : null}
              <div className="meta">Tasks: {p.careTasks.map((t) => t.title).join(' · ') || '—'}</div>
              <div style={{ marginTop: '0.75rem' }}>
                <Link className="btn secondary" to={`/residents/${id}/care-plan/${p.id}`}>
                  Edit negotiated care plan
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {tab === 'notes' && id ? (
        <CbhsReportPanel
          timezone={timezone}
          lockedResidentId={id}
          lockedResident={
            resident
              ? {
                  id: resident.id,
                  firstName: resident.firstName,
                  lastName: resident.lastName,
                  dateOfBirth: resident.dateOfBirth,
                }
              : null
          }
          heading="Notes & incident reports"
          subheading="Same CBHS form and Incident database as the facility Incidents page"
        />
      ) : null}

      {prnSlot ? (
        <PrnRecordModal
          medication={prnSlot.order.drugName}
          dose={prnSlot.order.dose}
          defaultRoute={prnSlot.order.route}
          patientName={
            resident ? `${resident.lastName}, ${resident.firstName}` : 'Resident'
          }
          facilityName={user?.tenantName || ''}
          busy={busyId !== null}
          onCancel={() => setPrnSlot(null)}
          onSubmit={(fields) => record(prnSlot, 'GIVEN', fields)}
        />
      ) : null}

      {safety ? (
        <SafetyConfirmModal
          warnings={safety.warnings}
          busy={busyId !== null}
          onCancel={() => setSafety(null)}
          onConfirm={() => {
            void (async () => {
              setBusyId('safety-ack');
              setError('');
              try {
                await api('/emar/administrations', {
                  method: 'POST',
                  body: JSON.stringify({
                    ...safety.body,
                    safetyChallengeToken: safety.safetyChallengeToken,
                  }),
                });
                setSafety(null);
                setPrnSlot(null);
                await load();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Failed to record after acknowledge');
              } finally {
                setBusyId(null);
              }
            })();
          }}
        />
      ) : null}
    </div>
  );
}
