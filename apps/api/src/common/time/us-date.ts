/** Format calendar dates as month/day/year (US AFH charting). */
export function formatUsDate(value: string | Date | null | undefined): string {
  if (value == null || value === '') return '—';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '—';
    const mm = String(value.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(value.getUTCDate()).padStart(2, '0');
    const yyyy = value.getUTCFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }
  const s = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  const usSlash = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (usSlash) {
    const yyyy = usSlash[3].length === 2 ? `20${usSlash[3]}` : usSlash[3];
    return `${usSlash[1].padStart(2, '0')}/${usSlash[2].padStart(2, '0')}/${yyyy}`;
  }
  const usDash = /^(\d{1,2})-(\d{1,2})-(\d{2,4})$/.exec(s);
  if (usDash) {
    const yyyy = usDash[3].length === 2 ? `20${usDash[3]}` : usDash[3];
    return `${usDash[1].padStart(2, '0')}/${usDash[2].padStart(2, '0')}/${yyyy}`;
  }
  return s;
}

/** Parse MM/DD/YYYY or YYYY-MM-DD into a UTC calendar Date (for DB date columns). */
export function parseUsDate(value: string | Date | null | undefined): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const s = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  const us = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s);
  if (us) {
    const yyyy = us[3].length === 2 ? Number(`20${us[3]}`) : Number(us[3]);
    return new Date(Date.UTC(yyyy, Number(us[1]) - 1, Number(us[2])));
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatUsMonth(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const idx = Number(m[2]) - 1;
  return `${months[idx] || m[2]} ${m[1]}`;
}
