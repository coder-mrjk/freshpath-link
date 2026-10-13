/**
 * FreshPath Freshness Scoring
 * Score = clamp(100 - perHourSinceHarvest * hoursSinceHarvest - perHourStoredAbove30C * hoursStoredAbove30C, 0, 100)
 * Badge:
 *  - >= 70: 'Fresh' (Green)
 *  - 40 - 69: 'Sell soon' (Amber)
 *  - < 40: 'Check quality' (Red)
 */

export interface FreshnessConfig {
  perHourSinceHarvest: number; // default 0.5
  perHourStoredAbove30C: number; // default 1.0
  freshMin: number; // default 70
  sellSoonMin: number; // default 40
}

export const DEFAULT_FRESHNESS_CONFIG: FreshnessConfig = {
  perHourSinceHarvest: 0.5,
  perHourStoredAbove30C: 1.0,
  freshMin: 70,
  sellSoonMin: 40,
};

export type FreshnessBadgeStatus = 'FRESH' | 'SELL_SOON' | 'CHECK_QUALITY';

export interface FreshnessResult {
  score: number;
  badge: FreshnessBadgeStatus;
  label: string;
  colorClass: string;
  hoursSinceHarvest: number;
  hoursStoredAbove30C: number;
}

/**
 * Calculates the freshness score and badge.
 */
export function calculateFreshness(
  harvestDate: Date | string | number,
  hoursStoredAbove30C = 0,
  config = DEFAULT_FRESHNESS_CONFIG,
  now = new Date()
): FreshnessResult {
  const harvestTime = new Date(harvestDate).getTime();
  const currentTime = now.getTime();
  const elapsedMs = Math.max(0, currentTime - harvestTime);
  const hoursSinceHarvest = elapsedMs / (1000 * 60 * 60);

  const penaltyTime = hoursSinceHarvest * config.perHourSinceHarvest;
  const penaltyHeat = hoursStoredAbove30C * config.perHourStoredAbove30C;
  const rawScore = 100 - penaltyTime - penaltyHeat;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  let badge: FreshnessBadgeStatus = 'CHECK_QUALITY';
  let label = 'Check quality';
  let colorClass = 'bg-red-100 text-red-800 border-red-300';

  if (score >= config.freshMin) {
    badge = 'FRESH';
    label = 'Fresh';
    colorClass = 'bg-leaf-100 text-leaf-700 border-leaf-500';
  } else if (score >= config.sellSoonMin) {
    badge = 'SELL_SOON';
    label = 'Sell soon';
    colorClass = 'bg-amber-100 text-amber-800 border-amber-400';
  }

  return {
    score,
    badge,
    label,
    colorClass,
    hoursSinceHarvest: Math.round(hoursSinceHarvest * 10) / 10,
    hoursStoredAbove30C: Math.round(hoursStoredAbove30C * 10) / 10,
  };
}
