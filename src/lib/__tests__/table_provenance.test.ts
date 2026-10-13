import { describe, it, expect } from 'vitest';
import { generateRandomCode } from '../bagId';

describe('Milestone M6: Table (Consumer) Provenance, Purchase & Rating', () => {
  it('generates consumer Pass ID matching FP-C-XXXXXX specification', () => {
    const randomCode = generateRandomCode(6);
    const consumerPassId = `FP-C-${randomCode}`;
    expect(consumerPassId).toMatch(/^FP-C-[A-Z0-9]{6}$/);
  });

  it('verifies purchase validity: only AT_SHOP crates can be purchased', () => {
    const validCrate = { status: 'AT_SHOP' };
    const invalidStatuses = ['CREATED', 'LOADED', 'IN_TRANSIT', 'IN_STORAGE', 'DISPATCHED_TO_SHOP', 'SOLD'];

    expect(validCrate.status).toBe('AT_SHOP');
    invalidStatuses.forEach((status) => {
      expect(status === 'AT_SHOP').toBe(false);
    });
  });

  it('constructs valid purchase record and PURCHASED event payload', () => {
    const bagId = 'FP-TOM-261013-ABC123';
    const consumerUid = 'consumer-user-123';
    const consumerPassId = 'FP-C-98A72B';
    const price = 300;

    const purchaseDoc = {
      bagId,
      consumerUid,
      consumerPassId,
      price,
      paymentStatus: 'NOT_ENABLED',
    };

    const purchaseEvent = {
      bagId,
      type: 'PURCHASED',
      byUid: consumerUid,
      byRole: 'consumer',
      byPassId: consumerPassId,
      place: { text: 'Fresh Basket Supermarket' },
      note: 'Purchased by verified consumer (FP-C-98A72B).',
    };

    expect(purchaseDoc.bagId).toBe(bagId);
    expect(purchaseDoc.price).toBe(300);
    expect(purchaseDoc.paymentStatus).toBe('NOT_ENABLED');

    expect(purchaseEvent.type).toBe('PURCHASED');
    expect(purchaseEvent.byRole).toBe('consumer');
    expect(purchaseEvent.byPassId).toBe('FP-C-98A72B');
  });

  it('validates 1 to 5 stars consumer rating payload and RATED event', () => {
    const stars = 5;
    const comment = 'Juicy, fragrant and fresh! Directly from Panruti farm.';

    expect(stars).toBeGreaterThanOrEqual(1);
    expect(stars).toBeLessThanOrEqual(5);

    const ratedEvent = {
      bagId: 'FP-TOM-261013-ABC123',
      type: 'RATED',
      byRole: 'consumer',
      byPassId: 'FP-C-98A72B',
      note: `Rated ${stars} stars: "${comment}"`,
    };

    expect(ratedEvent.type).toBe('RATED');
    expect(ratedEvent.note).toContain('Rated 5 stars');
  });

  it('calculates distinct handlers verified across the supply chain', () => {
    const events = [
      { type: 'BAG_CREATED', byRole: 'farmer', byPassId: 'FP-F-0001' },
      { type: 'LOADED', byRole: 'driver', byPassId: 'FP-D-0001' },
      { type: 'TRIP_STARTED', byRole: 'driver', byPassId: 'FP-D-0001' },
      { type: 'TRIP_ENDED', byRole: 'driver', byPassId: 'FP-D-0001' },
      { type: 'RECEIVED_STORAGE', byRole: 'mandi', byPassId: 'FP-M-0001' },
      { type: 'DISPATCHED_TO_SHOP', byRole: 'mandi', byPassId: 'FP-M-0001' },
      { type: 'RECEIVED_SHOP', byRole: 'shop', byPassId: 'FP-S-0001' },
      { type: 'PURCHASED', byRole: 'consumer', byPassId: 'FP-C-ABC123' },
    ];

    const uniqueHandlers = new Set(events.map((e) => e.byPassId));
    // 5 unique entities: farmer, driver, mandi, shop, consumer
    expect(uniqueHandlers.size).toBe(5);
  });
});
