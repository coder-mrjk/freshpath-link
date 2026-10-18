/**
 * FreshPath Price Utility
 * Default tomato baseline rate is ₹60 per kg (Grade A).
 * Customizable grade-based pricing:
 * - Grade A+: ₹75/kg (+25% Premium Export)
 * - Grade A: ₹60/kg (Baseline Wholesale)
 * - Grade B: ₹45/kg (-25% Standard Market)
 * - Grade C: ₹30/kg (-50% Economy / Processing)
 */

export const DEFAULT_PRICE_PER_KG = 60;

export interface GradePricing {
  gradeAPlus: number;
  gradeA: number;
  gradeB: number;
  gradeC: number;
}

export const DEFAULT_GRADE_PRICING: GradePricing = {
  gradeAPlus: 75,
  gradeA: 60,
  gradeB: 45,
  gradeC: 30,
};

/**
 * Returns the price per kg for a given size grade.
 * Higher grades yield higher prices; lower grades yield lower prices.
 */
export function getPriceForGrade(
  grade: string | undefined,
  pricing: GradePricing = DEFAULT_GRADE_PRICING
): number {
  if (!grade) return pricing.gradeA;
  const normalized = grade.toLowerCase().trim();

  if (normalized.includes('a+') || normalized.includes('supreme') || normalized.includes('export')) {
    return pricing.gradeAPlus;
  }
  if (normalized.includes('b')) {
    return pricing.gradeB;
  }
  if (normalized.includes('c') || normalized.includes('economy') || normalized.includes('processing')) {
    return pricing.gradeC;
  }
  return pricing.gradeA;
}

/**
 * Calculates the total price rounded to nearest integer or 2 decimal places.
 */
export function calculateTotalPrice(weightKg: number, pricePerKg = DEFAULT_PRICE_PER_KG): number {
  if (weightKg <= 0 || isNaN(weightKg)) return 0;
  const total = weightKg * pricePerKg;
  return Math.round(total * 100) / 100;
}

/**
 * Calculates total crate price based on weight and tomato grade.
 */
export function calculateGradeTotalPrice(
  weightKg: number,
  grade: string,
  pricing: GradePricing = DEFAULT_GRADE_PRICING
): number {
  const rate = getPriceForGrade(grade, pricing);
  return calculateTotalPrice(weightKg, rate);
}

/**
 * Formats rupee currency string: e.g. "₹300"
 */
export function formatRupees(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}
