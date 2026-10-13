/**
 * FreshPath Time Utility
 * Strict IST (Asia/Kolkata, UTC+5:30) formatting.
 * Rule: Store Firestore Timestamp (UTC). Display ONLY through formatIST().
 */

export type TimestampInput =
  | Date
  | string
  | number
  | { seconds: number; nanoseconds?: number }
  | { toDate: () => Date }
  | null
  | undefined;

/**
 * Converts any timestamp-like input to a JS Date.
 */
export function toDate(val: TimestampInput): Date {
  if (!val) return new Date();
  if (val instanceof Date) return val;
  if (typeof val === 'string' || typeof val === 'number') return new Date(val);
  if (typeof (val as { toDate?: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate();
  }
  if (typeof (val as { seconds?: number }).seconds === 'number') {
    return new Date((val as { seconds: number }).seconds * 1000);
  }
  return new Date();
}

/**
 * Formats a timestamp into Indian Standard Time (IST):
 * Format: "13 Oct 2026, 06:10:12 AM IST"
 */
export function formatIST(val: TimestampInput): string {
  if (!val) return '–';
  const date = toDate(val);
  if (isNaN(date.getTime())) return '–';

  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';

  const day = get('day');
  const month = get('month');
  const year = get('year');
  const hour = get('hour');
  const minute = get('minute');
  const second = get('second');
  const dayPeriod = get('dayPeriod').toUpperCase();

  return `${day} ${month} ${year}, ${hour}:${minute}:${second} ${dayPeriod} IST`;
}

/**
 * Formats date-only in IST: "13 Oct 2026"
 */
export function formatDateIST(val: TimestampInput): string {
  if (!val) return '–';
  const date = toDate(val);
  if (isNaN(date.getTime())) return '–';

  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return `${get('day')} ${get('month')} ${get('year')}`;
}

/**
 * Returns human-readable relative time (e.g. "2 hours ago", "just now")
 */
export function timeAgoIST(val: TimestampInput): string {
  if (!val) return '';
  const date = toDate(val);
  if (isNaN(date.getTime())) return '';

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin === 1) return '1 min ago';
  if (diffMin < 60) return `${diffMin} mins ago`;
  if (diffHours === 1) return '1 hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return '1 day ago';
  return `${diffDays} days ago`;
}
