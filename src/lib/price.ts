/**
 * FreshPath Price Utility
 * Default tomato rate is ₹60 per kg.
 * Total price = weightKg * pricePerKg.
 */

export const DEFAULT_PRICE_PER_KG = 60;

/**
 * Calculates the total price rounded to nearest integer or 2 decimal places.
 */
export function calculateTotalPrice(weightKg: number, pricePerKg = DEFAULT_PRICE_PER_KG): number {
  if (weightKg <= 0 || isNaN(weightKg)) return 0;
  const total = weightKg * pricePerKg;
  // Format cleanly (e.g. 0.5 * 60 = 30)
  return Math.round(total * 100) / 100;
}

/**
 * Formats rupee currency string: e.g. "₹300"
 */
export function formatRupees(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}
