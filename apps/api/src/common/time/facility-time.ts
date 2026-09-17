/** Build a UTC Date for a facility-local calendar day + HH:MM wall clock. */
export function facilityLocalToUtc(
  dateYmd: string,
  hhmm: string,
  timeZone: string,
): Date {
  const [hour, minute] = hhmm.split(':').map(Number);
  const targetMin =
    Number(dateYmd.replace(/-/g, '')) * 24 * 60 + hour * 60 + minute;

  // Guess: treat YMD as UTC noon then adjust by observed offset
  let guess = new Date(`${dateYmd}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`);

  for (let i = 0; i < 5; i++) {
    const parts = wallParts(guess, timeZone);
    const wallMin =
      Number(`${parts.year}${parts.month}${parts.day}`) * 24 * 60 +
      Number(parts.hour) * 60 +
      Number(parts.minute);
    const deltaMin = targetMin - wallMin;
    if (deltaMin === 0) {
      // Strip seconds/ms — schedule slots are minute-precision
      return new Date(Date.UTC(
        guess.getUTCFullYear(),
        guess.getUTCMonth(),
        guess.getUTCDate(),
        guess.getUTCHours(),
        guess.getUTCMinutes(),
        0,
        0,
      ));
    }
    guess = new Date(guess.getTime() + deltaMin * 60_000);
  }

  return new Date(`${dateYmd}T${hhmm}:00.000Z`);
}

function wallParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

export function facilityTodayYmd(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function addDaysYmd(dateYmd: string, days: number): string {
  const d = new Date(`${dateYmd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
