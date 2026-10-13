import { describe, it, expect } from 'vitest';
import { generateBagId, isValidBagId, parseScannedBagId, sanitizeVehicleId } from '../bagId';

describe('Bag ID Generator & Scanner Utilities', () => {
  it('generates Bag ID conforming to FP-TOM-YYMMDD-XXXXXX format', () => {
    const bagId = generateBagId(new Date('2026-10-13T10:00:00Z'));
    expect(bagId).toMatch(/^FP-TOM-\d{6}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(isValidBagId(bagId)).toBe(true);
  });

  it('generates unique IDs on multiple consecutive invocations', () => {
    const set = new Set<string>();
    for (let i = 0; i < 50; i++) {
      set.add(generateBagId());
    }
    expect(set.size).toBe(50);
  });

  it('rejects invalid or malformed Bag IDs', () => {
    expect(isValidBagId('FP-POTATO-261013-ABC123')).toBe(false);
    expect(isValidBagId('FP-TOM-261013-ABC')).toBe(false);
    expect(isValidBagId('random-string')).toBe(false);
    expect(isValidBagId('')).toBe(false);
  });

  it('correctly extracts Bag ID from scanned URLs and raw text', () => {
    const raw = 'FP-TOM-261013-ABC234';
    expect(parseScannedBagId(`https://freshpath-link.web.app/b/${raw}`)).toBe(raw);
    expect(parseScannedBagId(`/b/${raw}`)).toBe(raw);
    expect(parseScannedBagId(raw)).toBe(raw);
    expect(parseScannedBagId('invalid-qr-code')).toBeNull();
  });

  it('sanitizes vehicle registration numbers to standard uppercase ID', () => {
    expect(sanitizeVehicleId('tn 01 ab 1234')).toBe('TN01AB1234');
    expect(sanitizeVehicleId('TN 32 C 9999')).toBe('TN32C9999');
  });
});
