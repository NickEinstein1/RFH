import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { formatInFacilityTz, todayUtcDate } from '../time';
import {
  cacheSnapshot,
  enqueueMedEvent,
  flushOfflineQueue,
  isOnline,
  pendingCount,
  readSnapshot,
} from '../offlineQueue';

type Resident = {
  id: string;
  firstName: string;
  lastName: string;
  room: string | null;
  allergies: string[];
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

type Note = {
  id: string;
  body: string;
  noteType: string;
  occurredAt: string;
  author: { firstName: string; lastName: string };
};

type CarePlan = {
  id: string;
  title: string;
  goals: string | null;
  status: string;
  careTasks: { id: string; title: string; category: string }[];
};

const OUTCOMES = ['GIVEN', 'REFUSED', 'HELD', 'MISSED'] as const;
const TASK_OUTCOMES = ['DONE', 'REFUSED', 'UNABLE', 'SKIPPED'] as const;

export function ResidentDetailPage({ timezone }: { timezone: string }) {
  const { id } = useParams();
  const { user } = useAuth();
  const isFamily = user?.role === 'FAMILY_VIEWER';
  const [tab, setTab] = useState<'meds' | 'tasks' | 'notes' | 'plan'>(
    isFamily ? 'plan' : 'meds',
  );
  const [resident, setResident] = useState<Resident | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [taskSlots, setTaskSlots] = useState<TaskSlot[]>([]);
  const [plans, setPlans] = useState<CarePlan[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteBody, setNoteBody] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, setPending] = useState(() => pendingCount());
  const [online, setOnline] = useState(() => isOnline());

  const load = useCallback(async () => {
    if (!id) return;
    setError('');
    const date = todayUtcDate();
    try {
      const r = await api<Resident>(`/residents/${id}`);
      setResident(r);

      const notesP = api<Note[]>(`/notes?residentId=${id}`);
      const plansP = api<CarePlan[]>(`/care/plans?residentId=${id}`);

      if (isFamily) {
        const [n, p] = await Promise.all([notesP, plansP]);
        setNotes(n);
        setPlans(p);
        setSlots([]);
        setTaskSlots([]);
      } else {
        const snapP = api<{ slots: Slot[] }>(
          `/emar/sync/snapshot?residentId=${id}&date=${date}`,
        );
        const [snap, tasks, n, p] = await Promise.all([
          snapP,
          api<{ slots: TaskSlot[] }>(`/care/task-board?residentId=${id}&date=${date}`),
          notesP,
          plansP,
        ]);
        setSlots(snap.slots);
        cacheSnapshot(id, date, snap);
        setTaskSlots(tasks.slots);
        setNotes(n);
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
  }, [id, isFamily]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void flushOfflineQueue()
        .then(() => setPending(pendingCount()))
        .then(() => load())
        .catch(() => undefined);
    };
    const onOffline = () => setOnline(false);
    const onQueue = () => setPending(pendingCount());
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('rfh-offline-queue', onQueue);
    if (navigator.onLine) {
      void flushOfflineQueue().then(() => setPending(pendingCount()));
    }
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('rfh-offline-queue', onQueue);
    };
  }, [load]);

  async function record(slot: Slot, outcome: (typeof OUTCOMES)[number]) {
    if (!slot.scheduledAt && !slot.isPrn) return;
    if (!id) return;
    setBusyId(`${slot.order.id}-${outcome}`);
    setError('');
    const clientEventId = crypto.randomUUID();
    const payload = {
      orderId: slot.order.id,
      scheduledAt: slot.scheduledAt ?? new Date().toISOString(),
      outcome,
      administeredAt: outcome === 'GIVEN' ? new Date().toISOString() : undefined,
      clientEventId,
      residentId: id,
    };
    try {
      if (!navigator.onLine) {
        enqueueMedEvent(payload);
        setPending(pendingCount());
        setSlots((prev) =>
          prev.map((s) =>
            s.order.id === slot.order.id && s.scheduledAt === slot.scheduledAt
              ? {
                  ...s,
                  administration: {
                    id: clientEventId,
                    outcome,
                    administeredAt: payload.administeredAt ?? null,
                  },
                }
              : s,
          ),
        );
        setError('Saved offline — will sync when connection returns.');
        return;
      }
      await api('/emar/administrations', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await load();
    } catch (e) {
      // Network failure mid-request → queue for sync
      enqueueMedEvent(payload);
      setPending(pendingCount());
      setError(
        e instanceof Error
          ? `${e.message} — queued offline for retry`
          : 'Failed to record dose — queued offline',
      );
    } finally {
      setBusyId(null);
    }
  }

  async function recordTask(slot: TaskSlot, outcome: (typeof TASK_OUTCOMES)[number]) {
    setBusyId(`${slot.task.id}-${outcome}`);
    setError('');
    try {
      await api('/care/completions', {
        method: 'POST',
        body: JSON.stringify({
          careTaskId: slot.task.id,
          scheduledAt: slot.scheduledAt,
          outcome,
          completedAt: new Date().toISOString(),
          clientEventId: crypto.randomUUID(),
        }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to record task');
    } finally {
      setBusyId(null);
    }
  }

  async function submitNote(e: FormEvent) {
    e.preventDefault();
    if (!id || !noteBody.trim()) return;
    setError('');
    try {
      await api('/notes', {
        method: 'POST',
        body: JSON.stringify({
          residentId: id,
          body: noteBody.trim(),
          occurredAt: new Date().toISOString(),
          noteType: 'PROGRESS',
        }),
      });
      setNoteBody('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note');
    }
  }

  if (!resident && !error) return <p className="empty">Loading…</p>;

  return (
    <div>
      <Link to="/" className="meta">
        ← Residents
      </Link>
      <h1 className="page-title" style={{ marginTop: '0.5rem' }}>
        {resident ? `${resident.lastName}, ${resident.firstName}` : 'Resident'}
      </h1>
      <p className="page-sub">
        Room {resident?.room || '—'}
        {resident?.allergies?.length ? ` · Allergies: ${resident.allergies.join(', ')}` : ''}
        {!isFamily ? ` · ${online ? 'Online' : 'Offline'}${pending ? ` · ${pending} queued` : ''}` : ''}
      </p>
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
          Notes
        </button>
      </div>

      {tab === 'meds' ? (
        <div className="stack">
          {slots.length === 0 ? <p className="empty">No medications due today.</p> : null}
          {slots.map((slot) => {
            const done = Boolean(slot.administration);
            return (
              <div
                key={`${slot.order.id}-${slot.scheduledAt}`}
                className="slot-row"
                style={{ alignItems: 'stretch', flexDirection: 'column' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div>
                    <strong style={{ fontSize: '1.25rem' }}>
                      {slot.order.drugName} {slot.order.dose}
                    </strong>
                    <div className="meta">
                      {slot.order.route}
                      {slot.isPrn
                        ? ' · PRN'
                        : ` · Due ${slot.scheduledAt ? formatInFacilityTz(slot.scheduledAt, timezone, { timeStyle: 'short' }) : ''}`}
                    </div>
                    {slot.order.instructions ? (
                      <div className="meta" style={{ marginTop: 4 }}>
                        {slot.order.instructions}
                      </div>
                    ) : null}
                  </div>
                  {done ? (
                    <span
                      className={`badge ${
                        slot.administration?.outcome === 'GIVEN'
                          ? 'ok'
                          : slot.administration?.outcome === 'HELD'
                            ? 'warn'
                            : 'danger'
                      }`}
                    >
                      {slot.administration?.outcome}
                    </span>
                  ) : (
                    <span className="badge warn">DUE</span>
                  )}
                </div>
                {!done ? (
                  <div className="outcome-grid">
                    {OUTCOMES.map((o) => (
                      <button
                        key={o}
                        className={`btn ${o === 'GIVEN' ? '' : o === 'HELD' ? 'warn' : 'danger'}`}
                        disabled={busyId !== null}
                        onClick={() => void record(slot, o)}
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
          {plans.length === 0 ? <p className="empty">No care plan on file.</p> : null}
          {plans.map((p) => (
            <div key={p.id} className="note-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                <strong style={{ fontSize: '1.2rem' }}>{p.title}</strong>
                <span className={`badge ${p.status === 'ACTIVE' ? 'ok' : 'neutral'}`}>{p.status}</span>
              </div>
              {p.goals ? <p style={{ margin: '0.5rem 0' }}>{p.goals}</p> : null}
              <div className="meta">Tasks: {p.careTasks.map((t) => t.title).join(' · ') || '—'}</div>
            </div>
          ))}
        </div>
      ) : null}

      {tab === 'notes' ? (
        <div>
          {!isFamily ? (
            <form onSubmit={submitNote} style={{ marginBottom: '1.25rem' }}>
              <div className="field">
                <label htmlFor="note">New progress note</label>
                <textarea
                  id="note"
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  placeholder="Document care observations…"
                  required
                />
              </div>
              <button className="btn" type="submit">
                Save note
              </button>
            </form>
          ) : null}
          <div className="stack">
            {notes.map((n) => (
              <div key={n.id} className="note-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <div className="meta">
                  {formatInFacilityTz(n.occurredAt, timezone)} · {n.author.firstName} {n.author.lastName} ·{' '}
                  {n.noteType}
                </div>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: '1.1rem' }}>{n.body}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
