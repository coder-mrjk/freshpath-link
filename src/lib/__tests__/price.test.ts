import { describe, it, expect } from 'vitest';
import {
  calculateTotalPrice,
  formatRupees,
  getPriceForGrade,
  calculateGradeTotalPrice,
  DEFAULT_GRADE_PRICING,
} from '../price';

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

  it('calculates price according to tomato grades (Grade A increases, lower grades decrease)', () => {
    // Grade A+ is premium (₹75/kg)
    expect(getPriceForGrade('Grade A+')).toBe(75);
    // Grade A is standard wholesale (₹60/kg)
    expect(getPriceForGrade('Grade A')).toBe(60);
    // Grade B decreases price (₹45/kg)
    expect(getPriceForGrade('Grade B')).toBe(45);
    // Grade C is economy (₹30/kg)
    expect(getPriceForGrade('Grade C')).toBe(30);

    // Crate calculations: 10kg crate
    expect(calculateGradeTotalPrice(10, 'Grade A+')).toBe(750);
    expect(calculateGradeTotalPrice(10, 'Grade A')).toBe(600);
    expect(calculateGradeTotalPrice(10, 'Grade B')).toBe(450);
    expect(calculateGradeTotalPrice(10, 'Grade C')).toBe(300);
  });

  it('supports custom administrator grade pricing', () => {
    const customAdminPricing = {
      gradeAPlus: 90,
      gradeA: 70,
      gradeB: 50,
      gradeC: 35,
    };

    expect(getPriceForGrade('Grade A+', customAdminPricing)).toBe(90);
    expect(getPriceForGrade('Grade A', customAdminPricing)).toBe(70);
    expect(getPriceForGrade('Grade B', customAdminPricing)).toBe(50);
    expect(getPriceForGrade('Grade C', customAdminPricing)).toBe(35);
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

  it('exposes standard default grade pricing matrix', () => {
    expect(DEFAULT_GRADE_PRICING.gradeAPlus).toBe(75);
    expect(DEFAULT_GRADE_PRICING.gradeA).toBe(60);
    expect(DEFAULT_GRADE_PRICING.gradeB).toBe(45);
    expect(DEFAULT_GRADE_PRICING.gradeC).toBe(30);
  });
});
