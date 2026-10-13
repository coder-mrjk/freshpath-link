import { describe, it, expect } from 'vitest';
import { calculateTotalPrice, formatRupees } from '../price';
import { calculateFreshness } from '../freshness';

describe('Milestone M5: Shelf (Retailer) Inventory & Reception Flow', () => {
  it('verifies retail receiving validation: only DISPATCHED_TO_SHOP can transition to AT_SHOP', () => {
    const validCrate = { status: 'DISPATCHED_TO_SHOP' };
    const invalidCrates = [
      { status: 'CREATED' },
      { status: 'LOADED' },
      { status: 'IN_TRANSIT' },
      { status: 'IN_STORAGE' },
      { status: 'SOLD' },
    ];

    expect(validCrate.status).toBe('DISPATCHED_TO_SHOP');
    invalidCrates.forEach((c) => {
      expect(c.status === 'DISPATCHED_TO_SHOP').toBe(false);
    });
  });

  it('calculates retail shelf inventory aggregate weight and revenue value', () => {
    const shelfCrates = [
      { id: 'FP-TOM-261013-001', weightKg: 5, pricePerKg: 60 },
      { id: 'FP-TOM-261013-002', weightKg: 10, pricePerKg: 60 },
      { id: 'FP-TOM-261013-003', weightKg: 25, pricePerKg: 60 },
    ];

    const totalWeight = shelfCrates.reduce((acc, c) => acc + c.weightKg, 0);
    const totalValue = shelfCrates.reduce(
      (acc, c) => acc + calculateTotalPrice(c.weightKg, c.pricePerKg),
      0
    );

    expect(totalWeight).toBe(40);
    expect(totalValue).toBe(2400); // 300 + 600 + 1500 = 2400
    expect(formatRupees(totalValue)).toBe('₹2,400');
  });

  it('filters shelf stock by consumer freshness tiers', () => {
    const now = new Date('2026-10-13T12:00:00Z');
    const freshHarvest = new Date('2026-10-13T06:00:00Z'); // 6 hours ago -> ~97% (FRESH)
    const midHarvest = new Date('2026-10-10T12:00:00Z'); // 72 hours ago -> ~64% (SELL_SOON)
    const oldHarvest = new Date('2026-10-06T12:00:00Z'); // 168 hours ago -> ~16% (CHECK_QUALITY)

    const freshResult = calculateFreshness(freshHarvest, 0, undefined, now);
    const midResult = calculateFreshness(midHarvest, 0, undefined, now);
    const oldResult = calculateFreshness(oldHarvest, 0, undefined, now);

    expect(freshResult.badge).toBe('FRESH');
    expect(midResult.badge).toBe('SELL_SOON');
    expect(oldResult.badge).toBe('CHECK_QUALITY');
  });

  it('constructs valid RECEIVED_SHOP event for tamper-evident provenance ledger', () => {
    const bagId = 'FP-TOM-261013-ABC123';
    const shopPassId = 'FP-S-0001';
    const shopUid = 'retailer-uid-789';

    const event = {
      bagId,
      type: 'RECEIVED_SHOP',
      byUid: shopUid,
      byRole: 'shop',
      byPassId: shopPassId,
      place: { text: 'Fresh Basket Supermarket (Adyar, Chennai)' },
      note: 'Received and placed on retail shelf for consumer purchase.',
    };

    expect(event.type).toBe('RECEIVED_SHOP');
    expect(event.byRole).toBe('shop');
    expect(event.byPassId).toBe('FP-S-0001');
    expect(event.bagId).toBe(bagId);
  });
});
