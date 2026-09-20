/** Display UTC ISO timestamps in facility timezone. Storage remains UTC. */
export function formatInFacilityTz(
  iso: string | Date,
  timeZone: string,
  opts: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short',
  },
) {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(undefined, { ...opts, timeZone }).format(d);
}

export function todayUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

/** Facility-local calendar date (YYYY-MM-DD) for med pass / task boards. */
export function todayInFacilityTz(timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
