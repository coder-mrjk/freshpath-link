import { describe, it, expect } from 'vitest';
import { formatIST, formatDateIST, timeAgoIST } from '../time';

describe('formatIST Time Utility', () => {
  it('formats UTC instant correctly to IST (UTC+5:30)', () => {
    // 00:40:12 UTC + 5:30 = 06:10:12 IST
    const utcDate = new Date('2026-10-13T00:40:12Z');
    const result = formatIST(utcDate);
    expect(result).toBe('13 Oct 2026, 06:10:12 AM IST');
  });

  it('handles midnight rollover into next day correctly in IST', () => {
    // 2026-10-12T19:00:00Z + 5:30 = 2026-10-13 00:30:00 (12:30 AM) IST
    const utcDate = new Date('2026-10-12T19:00:00Z');
    const result = formatIST(utcDate);
    expect(result).toBe('13 Oct 2026, 12:30:00 AM IST');
  });

  it('formats date only in IST', () => {
    const utcDate = new Date('2026-10-13T00:40:12Z');
    expect(formatDateIST(utcDate)).toBe('13 Oct 2026');
  });

  it('handles Firestore-style Timestamp object with seconds', () => {
    // 2026-10-13T00:40:12Z = 1791852012
    const timestamp = { seconds: 1791852012 };
    expect(formatIST(timestamp)).toBe('13 Oct 2026, 06:10:12 AM IST');
  });

  it('returns – for null or undefined input', () => {
    expect(formatIST(null)).toBe('–');
    expect(formatIST(undefined)).toBe('–');
  });

  it('returns correct relative time strings', () => {
    const now = Date.now();
    expect(timeAgoIST(new Date(now - 30 * 1000))).toBe('just now');
    expect(timeAgoIST(new Date(now - 120 * 1000))).toBe('2 mins ago');
    expect(timeAgoIST(new Date(now - 2 * 3600 * 1000))).toBe('2 hours ago');
    expect(timeAgoIST(new Date(now - 2 * 86400 * 1000))).toBe('2 days ago');
  });
});
