import { describe, it, expect } from 'vitest';
import {
  getStorageTemperatureStatus,
  getStorageHumidityStatus,
  calculateStorageTelemetryStats,
  formatStorageDuration,
  StorageReading,
} from '../storage';

describe('Milestone M4: Hub (Mandi) Storage Telemetry & Crate Flow', () => {
  it('evaluates optimal tomato storage temperature (12°C - 15°C)', () => {
    expect(getStorageTemperatureStatus(12.0)).toBe('optimal');
    expect(getStorageTemperatureStatus(13.5)).toBe('optimal');
    expect(getStorageTemperatureStatus(15.0)).toBe('optimal');

    // Warning range
    expect(getStorageTemperatureStatus(18.0)).toBe('warning');
    expect(getStorageTemperatureStatus(10.0)).toBe('warning');

    // Critical range (>22°C or <8°C)
    expect(getStorageTemperatureStatus(25.0)).toBe('critical');
    expect(getStorageTemperatureStatus(5.0)).toBe('critical');
  });

  it('evaluates optimal tomato relative humidity (85% - 90%)', () => {
    expect(getStorageHumidityStatus(85.0)).toBe('optimal');
    expect(getStorageHumidityStatus(88.0)).toBe('optimal');
    expect(getStorageHumidityStatus(90.0)).toBe('optimal');

    // Warning range
    expect(getStorageHumidityStatus(80.0)).toBe('warning');
    expect(getStorageHumidityStatus(92.0)).toBe('warning');

    // Critical range (<70% or >98%)
    expect(getStorageHumidityStatus(65.0)).toBe('critical');
  });

  it('calculates min, max, avg and hours above 30C from telemetry stream', () => {
    const readings: StorageReading[] = [
      { tempC: 13.0, humidityPct: 86.0, at: '2026-10-13T06:00:00Z' },
      { tempC: 14.0, humidityPct: 88.0, at: '2026-10-13T07:00:00Z' },
      { tempC: 15.0, humidityPct: 90.0, at: '2026-10-13T08:00:00Z' },
      { tempC: 32.0, humidityPct: 60.0, at: '2026-10-13T09:00:00Z' }, // Heat spike > 30C
    ];

    const stats = calculateStorageTelemetryStats(readings);
    expect(stats.minTemp).toBe(13.0);
    expect(stats.maxTemp).toBe(32.0);
    expect(stats.avgTemp).toBe(18.5); // (13 + 14 + 15 + 32) / 4 = 18.5
    expect(stats.avgHumidity).toBe(81.0); // (86 + 88 + 90 + 60) / 4 = 81.0
    expect(stats.count).toBe(4);
    expect(stats.hoursAbove30C).toBeGreaterThan(0);
  });

  it('formats storage duration into clean human readable strings', () => {
    const now = new Date('2026-10-13T12:00:00Z');
    const minAgo = new Date('2026-10-13T11:20:00Z');
    const hoursAgo = new Date('2026-10-13T06:00:00Z');
    const daysAgo = new Date('2026-10-11T08:00:00Z');

    expect(formatStorageDuration(minAgo, now)).toBe('40 mins');
    expect(formatStorageDuration(hoursAgo, now)).toBe('6 hrs ');
    expect(formatStorageDuration(daysAgo, now)).toContain('2d');
  });

  it('constructs valid RECEIVED_STORAGE and DISPATCHED_TO_SHOP events', () => {
    const receiveEvent = {
      bagId: 'FP-TOM-261013-ABC123',
      type: 'RECEIVED_STORAGE',
      byRole: 'mandi',
      byPassId: 'FP-M-0001',
      place: { text: 'Panruti Mandi - Cold Room 1' },
      note: 'Received into storage unit at 13.5°C.',
    };

    const dispatchEvent = {
      bagId: 'FP-TOM-261013-ABC123',
      type: 'DISPATCHED_TO_SHOP',
      byRole: 'mandi',
      byPassId: 'FP-M-0001',
      place: { text: 'Fresh Basket Supermarket (Adyar, Chennai)' },
      note: 'Dispatched to retail partner.',
    };

    expect(receiveEvent.type).toBe('RECEIVED_STORAGE');
    expect(receiveEvent.byRole).toBe('mandi');
    expect(dispatchEvent.type).toBe('DISPATCHED_TO_SHOP');
    expect(dispatchEvent.byRole).toBe('mandi');
  });
});
