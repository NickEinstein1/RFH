import { api } from './api';

const QUEUE_KEY = 'rfh_med_offline_queue';
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
};

export function getOfflineQueue(): QueuedMedEvent[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') as QueuedMedEvent[];
  } catch {
    return [];
  }
}

function saveQueue(events: QueuedMedEvent[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(events));
  window.dispatchEvent(new CustomEvent('rfh-offline-queue'));
}

export function enqueueMedEvent(event: Omit<QueuedMedEvent, 'queuedAt'>) {
  const queue = getOfflineQueue();
  queue.push({ ...event, queuedAt: new Date().toISOString() });
  saveQueue(queue);
}

export function pendingCount() {
  return getOfflineQueue().length;
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
  saveQueue(remaining);

  return {
    flushed: queue.length - remaining.length,
    conflicts: result.results.filter((r) => r.status === 'conflict').length,
    errors: result.results.filter((r) => r.status === 'error').length,
  };
}

export function isOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}
