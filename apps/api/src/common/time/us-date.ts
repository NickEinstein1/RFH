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
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (us) {
    return `${us[1].padStart(2, '0')}/${us[2].padStart(2, '0')}/${us[3]}`;
  }
  return s;
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
