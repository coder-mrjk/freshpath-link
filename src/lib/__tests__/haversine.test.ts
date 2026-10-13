import { describe, it, expect } from 'vitest';
import { calculateHaversineDistance, formatStraightLineDistance } from '../haversine';

describe('Haversine Straight-Line Distance', () => {
  it('calculates known city pair (Chennai to Madurai) within 1% accuracy', () => {
    // Chennai: 13.0827° N, 80.2707° E
    const chennai = { lat: 13.0827, lng: 80.2707 };
    // Madurai: 9.9252° N, 78.1198° E
    const madurai = { lat: 9.9252, lng: 78.1198 };

    const distance = calculateHaversineDistance(chennai, madurai);
    // Expected straight-line distance is ~420-422 km
    expect(distance).toBeGreaterThan(415);
    expect(distance).toBeLessThan(425);
  });

  it('returns 0 km for identical coordinates', () => {
    const point = { lat: 11.748, lng: 79.7714 };
    expect(calculateHaversineDistance(point, point)).toBe(0);
  });

  it('formats straight-line distance with explicit label', () => {
    expect(formatStraightLineDistance(42.5)).toBe('42.5 km (straight-line)');
  });
});
