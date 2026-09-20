import { api } from './api';

const MED_QUEUE_KEY = 'rfh_med_offline_queue';
const NOTE_QUEUE_KEY = 'rfh_note_offline_queue';
const TASK_QUEUE_KEY = 'rfh_task_offline_queue';
const SNAPSHOT_PREFIX = 'rfh_med_snap_';

export type QueuedMedEvent = {
  orderId: string;
  scheduledAt: string;
  outcome: string;
  administeredAt?: string;
  notes?: string;
  clientEventId: string;
  residentId: string;
  queuedAt: string;
  prnReason?: string;
  prnRouteSite?: string;
  prnBmi?: string;
  prnBmiOther?: string;
  prnResult?: string;
  prnMse?: string;
  prnMseOther?: string;
  prnPainScore?: number;
};

export type QueuedNoteEvent = {
  clientEventId: string;
  residentId: string;
  occurredAt: string;
  category: string;
  severity: string;
  title: string;
  narrative: string;
  immediateActions?: string;
  formData?: Record<string, unknown>;
  queuedAt: string;
};

export type QueuedTaskEvent = {
  clientEventId: string;
  careTaskId: string;
  residentId: string;
  scheduledAt: string;
  completedAt?: string;
  outcome: string;
  notes?: string;
  queuedAt: string;
};

function readQueue<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]') as T[];
  } catch {
    return [];
  }
}

function writeQueue(key: string, events: unknown[]) {
  localStorage.setItem(key, JSON.stringify(events));
  window.dispatchEvent(new CustomEvent('rfh-offline-queue'));
}

export function getOfflineQueue(): QueuedMedEvent[] {
  return readQueue<QueuedMedEvent>(MED_QUEUE_KEY);
}

export function enqueueMedEvent(event: Omit<QueuedMedEvent, 'queuedAt'>) {
  const queue = getOfflineQueue();
  queue.push({ ...event, queuedAt: new Date().toISOString() });
  writeQueue(MED_QUEUE_KEY, queue);
}

export function enqueueNoteEvent(event: Omit<QueuedNoteEvent, 'queuedAt'>) {
  const queue = readQueue<QueuedNoteEvent>(NOTE_QUEUE_KEY);
  queue.push({ ...event, queuedAt: new Date().toISOString() });
  writeQueue(NOTE_QUEUE_KEY, queue);
}

export function enqueueTaskEvent(event: Omit<QueuedTaskEvent, 'queuedAt'>) {
  const queue = readQueue<QueuedTaskEvent>(TASK_QUEUE_KEY);
  queue.push({ ...event, queuedAt: new Date().toISOString() });
  writeQueue(TASK_QUEUE_KEY, queue);
}

export function pendingCount() {
  return (
    readQueue(MED_QUEUE_KEY).length +
    readQueue(NOTE_QUEUE_KEY).length +
    readQueue(TASK_QUEUE_KEY).length
  );
}

export function cacheSnapshot(residentId: string, date: string, data: unknown) {
  localStorage.setItem(`${SNAPSHOT_PREFIX}${residentId}_${date}`, JSON.stringify(data));
}

export function readSnapshot<T>(residentId: string, date: string): T | null {
  const raw = localStorage.getItem(`${SNAPSHOT_PREFIX}${residentId}_${date}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function flushOfflineQueue(): Promise<{
  flushed: number;
  conflicts: number;
  errors: number;
}> {
  const queue = getOfflineQueue();
  if (!queue.length) return { flushed: 0, conflicts: 0, errors: 0 };
  if (!navigator.onLine) return { flushed: 0, conflicts: 0, errors: 0 };

  const result = await api<{
    results: Array<{ status: string; clientEventId: string | null }>;
  }>('/emar/sync/batch', {
    method: 'POST',
    body: JSON.stringify({
      events: queue.map(({ residentId: _r, queuedAt: _q, ...e }) => e),
    }),
  });

  const doneIds = new Set(
    result.results
      .filter((r) => r.status === 'created' || r.status === 'duplicate' || r.status === 'conflict')
      .map((r) => r.clientEventId)
      .filter(Boolean),
  );

  const remaining = queue.filter((e) => !doneIds.has(e.clientEventId));
  writeQueue(MED_QUEUE_KEY, remaining);

  return {
    flushed: queue.length - remaining.length,
    conflicts: result.results.filter((r) => r.status === 'conflict').length,
    errors: result.results.filter((r) => r.status === 'error').length,
  };
}

export async function flushNoteQueue() {
  const queue = readQueue<QueuedNoteEvent>(NOTE_QUEUE_KEY);
  if (!queue.length || !navigator.onLine) return { flushed: 0, errors: 0 };
  const remaining: QueuedNoteEvent[] = [];
  let flushed = 0;
  let errors = 0;
  for (const event of queue) {
    try {
      const { queuedAt: _q, ...body } = event;
      await api('/incidents', { method: 'POST', body: JSON.stringify(body) });
      flushed += 1;
    } catch {
      remaining.push(event);
      errors += 1;
    }
  }
  writeQueue(NOTE_QUEUE_KEY, remaining);
  return { flushed, errors };
}

export async function flushTaskQueue() {
  const queue = readQueue<QueuedTaskEvent>(TASK_QUEUE_KEY);
  if (!queue.length || !navigator.onLine) return { flushed: 0, errors: 0 };
  const remaining: QueuedTaskEvent[] = [];
  let flushed = 0;
  let errors = 0;
  for (const event of queue) {
    try {
      const { queuedAt: _q, residentId: _r, ...body } = event;
      await api('/care/completions', { method: 'POST', body: JSON.stringify(body) });
      flushed += 1;
    } catch {
      remaining.push(event);
      errors += 1;
    }
  }
  writeQueue(TASK_QUEUE_KEY, remaining);
  return { flushed, errors };
}

export async function flushAllOfflineQueues() {
  const med = await flushOfflineQueue().catch(() => ({ flushed: 0, conflicts: 0, errors: 0 }));
  const notes = await flushNoteQueue().catch(() => ({ flushed: 0, errors: 0 }));
  const tasks = await flushTaskQueue().catch(() => ({ flushed: 0, errors: 0 }));
  return {
    flushed: med.flushed + notes.flushed + tasks.flushed,
    conflicts: med.conflicts,
    errors: med.errors + notes.errors + tasks.errors,
  };
}

export function isOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}
