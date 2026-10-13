import { describe, it, expect } from 'vitest';
import { calculateFreshness } from '../freshness';

describe('Freshness Score & Badge Evaluator', () => {
  const baseTime = new Date('2026-10-13T12:00:00Z');

  it('marks fresh harvest (0 hours, 0 heat) as 100 FRESH', () => {
    const res = calculateFreshness(baseTime, 0, undefined, baseTime);
    expect(res.score).toBe(100);
    expect(res.badge).toBe('FRESH');
    expect(res.label).toBe('Fresh');
  });

  it('correctly degrades by 0.5 per hour since harvest', () => {
    // 20 hours * 0.5 = 10 deduction -> 90 score -> FRESH
    const harvestTime = new Date(baseTime.getTime() - 20 * 3600 * 1000);
    const res = calculateFreshness(harvestTime, 0, undefined, baseTime);
    expect(res.score).toBe(90);
    expect(res.badge).toBe('FRESH');
  });

  it('identifies boundary at 70 for FRESH vs SELL_SOON', () => {
    // 60 hours * 0.5 = 30 deduction -> score 70 -> FRESH
    const harvestTime70 = new Date(baseTime.getTime() - 60 * 3600 * 1000);
    const res70 = calculateFreshness(harvestTime70, 0, undefined, baseTime);
    expect(res70.score).toBe(70);
    expect(res70.badge).toBe('FRESH');

    // 62 hours * 0.5 = 31 deduction -> score 69 -> SELL_SOON
    const harvestTime69 = new Date(baseTime.getTime() - 62 * 3600 * 1000);
    const res69 = calculateFreshness(harvestTime69, 0, undefined, baseTime);
    expect(res69.score).toBe(69);
    expect(res69.badge).toBe('SELL_SOON');
  });

  it('identifies boundary at 40 for SELL_SOON vs CHECK_QUALITY', () => {
    // 120 hours * 0.5 = 60 deduction -> score 40 -> SELL_SOON
    const harvestTime40 = new Date(baseTime.getTime() - 120 * 3600 * 1000);
    const res40 = calculateFreshness(harvestTime40, 0, undefined, baseTime);
    expect(res40.score).toBe(40);
    expect(res40.badge).toBe('SELL_SOON');

    // 122 hours * 0.5 = 61 deduction -> score 39 -> CHECK_QUALITY
    const harvestTime39 = new Date(baseTime.getTime() - 122 * 3600 * 1000);
    const res39 = calculateFreshness(harvestTime39, 0, undefined, baseTime);
    expect(res39.score).toBe(39);
    expect(res39.badge).toBe('CHECK_QUALITY');
  });

  it('penalizes temperature above 30C during mandi storage', () => {
    // 10 hours age (5 pts) + 15 hours above 30C (15 pts) = 20 pts -> score 80
    const harvestTime = new Date(baseTime.getTime() - 10 * 3600 * 1000);
    const res = calculateFreshness(harvestTime, 15, undefined, baseTime);
    expect(res.score).toBe(80);
    expect(res.badge).toBe('FRESH');
  });

  it('clamps scores between 0 and 100', () => {
    // Extreme degradation
    const veryOld = new Date(baseTime.getTime() - 1000 * 3600 * 1000);
    const resOld = calculateFreshness(veryOld, 100, undefined, baseTime);
    expect(resOld.score).toBe(0);
    expect(resOld.badge).toBe('CHECK_QUALITY');

    // Future timestamp
    const future = new Date(baseTime.getTime() + 100 * 3600 * 1000);
    const resFuture = calculateFreshness(future, 0, undefined, baseTime);
    expect(resFuture.score).toBe(100);
  });
});
