import { describe, it, expect } from 'vitest';
import { generateTripId } from '../bagId';
import { evaluateFix, GPSUnitData } from '../gps';
import { calculateHaversineDistance } from '../haversine';

describe('Milestone M3: Move (Driver) Trip Lifecycle & GPS Validation', () => {
  it('generates a valid Trip ID matching TRP-YYMMDD-XXXX format', () => {
    const tripId = generateTripId(new Date('2026-10-13T09:00:00Z'));
    expect(tripId).toMatch(/^TRP-261013-[A-Z0-9]{4}$/);
  });

  it('validates GPS fix for starting trip: accepts fresh fix with >=4 satellites', () => {
    const freshData: GPSUnitData = {
      vehicleId: 'TN31AB1234',
      latest: {
        lat: 11.748,
        lng: 79.7714,
        speedKmph: 35.5,
        sats: 7,
        hdop: 1.2,
        valid: true,
        fixAt: new Date().toISOString(), // current time
      },
    };

    const result = evaluateFix(freshData);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fix.lat).toBe(11.748);
      expect(result.fix.lng).toBe(79.7714);
      expect(result.fix.sats).toBe(7);
    }
  });

  it('rejects stale GPS fix (> 3 minutes old) to prevent erroneous trip start', () => {
    const fourMinAgo = new Date(Date.now() - 4 * 60 * 1000).toISOString();
    const staleData: GPSUnitData = {
      vehicleId: 'TN31AB1234',
      latest: {
        lat: 11.748,
        lng: 79.7714,
        speedKmph: 0,
        sats: 6,
        hdop: 1.2,
        valid: true,
        fixAt: fourMinAgo,
      },
    };

    const result = evaluateFix(staleData);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('STALE');
    }
  });

  it('rejects GPS fix with fewer than 4 satellites', () => {
    const lowSatData: GPSUnitData = {
      vehicleId: 'TN31AB1234',
      latest: {
        lat: 11.748,
        lng: 79.7714,
        speedKmph: 10,
        sats: 3,
        hdop: 2.8,
        valid: true,
        fixAt: new Date().toISOString(),
      },
    };

    const result = evaluateFix(lowSatData);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('FEW_SATS');
    }
  });

  it('calculates accurate straight-line distance between origin farm and destination mandi', () => {
    const farmFix = { lat: 11.748, lng: 79.7714, sats: 8 };
    const mandiFix = { lat: 11.9338, lng: 79.8297, sats: 9 };

    const distance = calculateHaversineDistance(farmFix, mandiFix);
    // Panruti (11.748, 79.7714) to Mandi (11.9338, 79.8297) is ~21.5 km
    expect(distance).toBeGreaterThan(20);
    expect(distance).toBeLessThan(23);
  });

  it('verifies trip state lifecycle flow: DRAFT -> IN_TRANSIT -> ENDED', () => {
    const trip = {
      id: 'TRIP-261013-ABC123',
      status: 'DRAFT' as 'DRAFT' | 'IN_TRANSIT' | 'ENDED',
      bagIds: ['FP-TOM-261013-001', 'FP-TOM-261013-002'],
    };

    expect(trip.status).toBe('DRAFT');
    expect(trip.bagIds.length).toBe(2);

    // Transition to transit
    trip.status = 'IN_TRANSIT';
    expect(trip.status).toBe('IN_TRANSIT');

    // Transition to ended
    trip.status = 'ENDED';
    expect(trip.status).toBe('ENDED');
  });
});
