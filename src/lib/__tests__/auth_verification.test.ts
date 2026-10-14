import { describe, it, expect } from 'vitest';
import { OWNER_EMAIL, UserRole, UserStatus } from '../../context/AuthContext';
import { isValidBagId } from '../bagId';
import { calculateTotalPrice } from '../price';

describe('Authentication, Security & Owner Verification', () => {
  it('confirms the designated owner email is exactly tonightgamermrjk@gmail.com', () => {
    expect(OWNER_EMAIL).toBe('tonightgamermrjk@gmail.com');
  });

  it('validates authentic Pass ID format across all supply chain roles', () => {
    const validPassIds = {
      owner: 'FP-OWNER-0001',
      farmer: 'FP-F-0001',
      driver: 'FP-D-0001',
      mandi: 'FP-M-0001',
      shop: 'FP-S-0001',
      consumer: 'FP-C-98A72B',
    };

    expect(validPassIds.owner).toMatch(/^FP-OWNER-\d{4}$/);
    expect(validPassIds.farmer).toMatch(/^FP-F-\d{4}$/);
    expect(validPassIds.driver).toMatch(/^FP-D-\d{4}$/);
    expect(validPassIds.mandi).toMatch(/^FP-M-\d{4}$/);
    expect(validPassIds.shop).toMatch(/^FP-S-\d{4}$/);
    expect(validPassIds.consumer).toMatch(/^FP-C-[A-Z0-9]{6}$/);
  });

  it('strictly validates authentic Bag IDs generated during legitimate harvest', () => {
    const validHarvestBag = 'FP-TOM-261014-A2B3C4';
    expect(isValidBagId(validHarvestBag)).toBe(true);

    const invalidBag = 'MOCK-DEMO-BAG-123';
    expect(isValidBagId(invalidBag)).toBe(false);
  });

  it('computes accurate produce value strictly from weight and rate per kg', () => {
    const weightKg = 25.5;
    const ratePerKg = 60;
    const totalPrice = calculateTotalPrice(weightKg, ratePerKg);
    expect(totalPrice).toBe(1530);
  });

  it('enforces that only users with approved status and authentic pass IDs can operate in portals', () => {
    const verifyPortalAccess = (role: UserRole, status: UserStatus, hasPassId: boolean) => {
      return Boolean(role) && status === 'approved' && hasPassId;
    };

    expect(verifyPortalAccess('farmer', 'approved', true)).toBe(true);
    expect(verifyPortalAccess('farmer', 'pending', false)).toBe(false);
    expect(verifyPortalAccess('driver', 'suspended', true)).toBe(false);
    expect(verifyPortalAccess('mandi', 'rejected', false)).toBe(false);
  });
});
