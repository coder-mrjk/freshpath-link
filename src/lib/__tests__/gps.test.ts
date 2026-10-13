import { describe, it, expect } from 'vitest';
import { evaluateFix, GPSUnitData } from '../gps';

describe('GPS Fix Evaluator', () => {
  const baseTime = new Date('2026-10-13T12:00:00Z');

  it('approves a fresh valid fix with adequate satellites', () => {
    const data: GPSUnitData = {
      latest: {
        lat: 11.748,
        lng: 79.7714,
        speedKmph: 24.5,
        sats: 8,
        hdop: 1.2,
        valid: true,
        fixAt: new Date(baseTime.getTime() - 60 * 1000).toISOString(), // 1 min old
      },
      receivedAt: baseTime.toISOString(),
    };

    const res = evaluateFix(data, baseTime);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.fix.lat).toBe(11.748);
      expect(res.fix.sats).toBe(8);
    }
  });

  it('returns NO_FIX if GPS fix is invalid or absent', () => {
    const invalidData: GPSUnitData = {
      latest: {
        lat: 0,
        lng: 0,
        speedKmph: 0,
        sats: 0,
        hdop: 99.9,
        valid: false,
        fixAt: baseTime.toISOString(),
      },
    };

    const res = evaluateFix(invalidData, baseTime);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('NO_FIX');
    }

    const emptyRes = evaluateFix(null, baseTime);
    expect(emptyRes.ok).toBe(false);
  });

  it('returns FEW_SATS if satellites are below threshold (< 4)', () => {
    const weakData: GPSUnitData = {
      latest: {
        lat: 11.748,
        lng: 79.7714,
        speedKmph: 0,
        sats: 3, // only 3 satellites
        hdop: 4.5,
        valid: true,
        fixAt: baseTime.toISOString(),
      },
    };

    const res = evaluateFix(weakData, baseTime);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('FEW_SATS');
    }
  });

  it('returns STALE if GPS fix is older than 3 minutes (180s)', () => {
    const staleData: GPSUnitData = {
      latest: {
        lat: 11.748,
        lng: 79.7714,
        speedKmph: 0,
        sats: 7,
        hdop: 1.1,
        valid: true,
        fixAt: new Date(baseTime.getTime() - 240 * 1000).toISOString(), // 4 mins old (> 3m)
      },
    };

    const res = evaluateFix(staleData, baseTime);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('STALE');
    }
  });
});
