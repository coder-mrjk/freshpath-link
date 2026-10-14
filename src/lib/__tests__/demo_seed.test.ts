import { describe, it, expect } from 'vitest';
import { calculateTotalPrice } from '../price';
import { isValidBagId } from '../bagId';
import { getStorageTemperatureStatus } from '../storage';

describe('Milestone M9: Demo Seed Data Specification & Integrity', () => {
  const demoCrates = [
    { id: 'FP-TOM-261013-STAGE2', weightKg: 5, status: 'CREATED' },
    { id: 'FP-TOM-261013-STAGE3', weightKg: 10, status: 'LOADED' },
    { id: 'FP-TOM-261013-STAGE4', weightKg: 15, status: 'IN_TRANSIT' },
    { id: 'FP-TOM-261013-STAGE5', weightKg: 20, status: 'IN_STORAGE' },
    { id: 'FP-TOM-261013-STAGE6', weightKg: 25, status: 'DISPATCHED_TO_SHOP' },
    { id: 'FP-TOM-261013-STAGE7', weightKg: 5, status: 'AT_SHOP' },
    { id: 'FP-TOM-261013-STAGE8', weightKg: 5, status: 'SOLD' },
  ];

  it('covers all 7 required supply chain lifecycle stages across demo crates', () => {
    const expectedStages = [
      'CREATED',
      'LOADED',
      'IN_TRANSIT',
      'IN_STORAGE',
      'DISPATCHED_TO_SHOP',
      'AT_SHOP',
      'SOLD',
    ];

    const actualStages = demoCrates.map((c) => c.status);
    expectedStages.forEach((stage) => {
      expect(actualStages).toContain(stage);
    });
  });

  it('verifies standard ₹60/kg pricing across all demo crates', () => {
    const ratePerKg = 60;
    demoCrates.forEach((c) => {
      const calculated = calculateTotalPrice(c.weightKg, ratePerKg);
      expect(calculated).toBe(c.weightKg * ratePerKg);
    });
  });

  it('validates role-based Pass ID formatting for demo participants', () => {
    const passIds = {
      farmer: 'FP-F-0001',
      driver: 'FP-D-0001',
      mandi: 'FP-M-0001',
      shop: 'FP-S-0001',
      consumer: 'FP-C-98A72B',
    };

    expect(passIds.farmer).toMatch(/^FP-F-\d{4}$/);
    expect(passIds.driver).toMatch(/^FP-D-\d{4}$/);
    expect(passIds.mandi).toMatch(/^FP-M-\d{4}$/);
    expect(passIds.shop).toMatch(/^FP-S-\d{4}$/);
    expect(passIds.consumer).toMatch(/^FP-C-[A-Z0-9]{6}$/);
  });

  it('ensures demo cold storage telemetry readings fall in optimal or safe preservation range', () => {
    const sampleReadings = [13.2, 13.5, 14.1, 13.8, 14.4, 13.0];
    sampleReadings.forEach((temp) => {
      const status = getStorageTemperatureStatus(temp);
      expect(status).toBe('optimal');
    });
  });

  it('verifies demo crates adhere to the valid Bag ID format', () => {
    demoCrates.forEach((c) => {
      expect(isValidBagId(c.id)).toBe(true);
    });
  });
});
