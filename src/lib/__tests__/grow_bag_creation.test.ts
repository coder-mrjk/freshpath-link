import { describe, it, expect } from 'vitest';
import { calculateTotalPrice, formatRupees } from '../price';
import { generateBagId, isValidBagId, parseScannedBagId } from '../bagId';

describe('Milestone M2: Grow (Farmer) Bag Creation & QR Label Specifications', () => {
  it('verifies 5 kg tomato bag calculates exactly ₹300 at standard ₹60/kg rate', () => {
    const weightKg = 5;
    const pricePerKg = 60;
    const total = calculateTotalPrice(weightKg, pricePerKg);
    expect(total).toBe(300);
    expect(formatRupees(total)).toBe('₹300');
  });

  it('verifies 25 kg crate calculates exactly ₹1,500 at standard ₹60/kg rate', () => {
    const weightKg = 25;
    const pricePerKg = 60;
    const total = calculateTotalPrice(weightKg, pricePerKg);
    expect(total).toBe(1500);
    expect(formatRupees(total)).toBe('₹1,500');
  });

  it('ensures bag creation generates valid Bag ID and QR URL target', () => {
    const bagId = generateBagId(new Date('2026-10-13T10:00:00Z'));
    expect(isValidBagId(bagId)).toBe(true);

    const dummyOrigin = 'https://freshpath-link.firebaseapp.com';
    const qrContent = `${dummyOrigin}/b/${bagId}`;
    expect(parseScannedBagId(qrContent)).toBe(bagId);
  });

  it('constructs valid BAG_CREATED event payload structure', () => {
    const bagId = 'FP-TOM-261013-ABC123';
    const farmerUid = 'test-farmer-uid-123';
    const farmerPassId = 'FP-F-0001';

    const eventPayload = {
      bagId,
      type: 'BAG_CREATED',
      byUid: farmerUid,
      byRole: 'farmer',
      byPassId: farmerPassId,
      place: { text: 'Vadakku Thottam, Panruti' },
      note: 'Harvested crate: 5 kg (45 pieces), Grade A.',
    };

    expect(eventPayload.type).toBe('BAG_CREATED');
    expect(eventPayload.byRole).toBe('farmer');
    expect(eventPayload.byPassId).toBe('FP-F-0001');
    expect(eventPayload.bagId).toBe(bagId);
  });
});
