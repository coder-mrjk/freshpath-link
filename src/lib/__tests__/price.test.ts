import { describe, it, expect } from 'vitest';
import { calculateTotalPrice, formatRupees } from '../price';

describe('Price Utility', () => {
  it('correctly calculates tomato prices at default ₹60/kg rate', () => {
    expect(calculateTotalPrice(0.5)).toBe(30);
    expect(calculateTotalPrice(1)).toBe(60);
    expect(calculateTotalPrice(2)).toBe(120);
    expect(calculateTotalPrice(5)).toBe(300);
    expect(calculateTotalPrice(10)).toBe(600);
    expect(calculateTotalPrice(25)).toBe(1500);
  });

  it('handles custom rates per kg', () => {
    expect(calculateTotalPrice(5, 50)).toBe(250);
    expect(calculateTotalPrice(2.5, 40)).toBe(100);
  });

  it('handles edge cases safely', () => {
    expect(calculateTotalPrice(0)).toBe(0);
    expect(calculateTotalPrice(-5)).toBe(0);
    expect(calculateTotalPrice(NaN)).toBe(0);
  });

  it('formats rupee string correctly', () => {
    expect(formatRupees(300)).toBe('₹300');
    expect(formatRupees(1500)).toBe('₹1,500');
  });
});
