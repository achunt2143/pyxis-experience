/**
 * Local-timezone calendar date helpers (`YYYY-MM-DD`) so apps like Contacts
 * and Tasks avoid UTC midnight / `toISOString()` off-by-one-day shifts.
 */

/** Formats a `Date` as `YYYY-MM-DD` in the local timezone (or `''` if invalid). */
export function formatLocalDate(d: Date): string {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  const y = String(d.getFullYear()).padStart(4, '0');
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parses a `YYYY-MM-DD` string as local midnight `new Date(y, m - 1, d)`,
 * returning `null` for malformed or non-existent calendar dates.
 */
export function parseLocalDate(ymd: string): Date | null {
  if (typeof ymd !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d);
  if (y >= 0 && y < 100) date.setFullYear(y);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date;
}
