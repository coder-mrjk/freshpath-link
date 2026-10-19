/**
 * FreshPath GPS Fix Validator & Contract
 * Docs 04:
 * getFreshFix(gpsUnitDoc) -> { ok: true, fix } | { ok: false, reason }
 * Reasons: 'NO_FIX' | 'STALE' | 'FEW_SATS'
 * Criteria: fix within 3 mins (180s) of now, sats >= 4, and valid == true.
 */

export interface GPSFix {
  lat: number;
  lng: number;
  speedKmph: number;
  sats: number;
  hdop: number;
  valid: boolean;
  fixAt: string | Date | { seconds: number };
  simulated?: boolean;
}

export interface GPSUnitData {
  vehicleId?: string;
  latest?: GPSFix;
  receivedAt?: string | Date | { seconds: number };
}

export type GPSFailureReason = 'NO_FIX' | 'STALE' | 'FEW_SATS';

export type GPSFixResult =
  | { ok: true; fix: GPSFix }
  | { ok: false; reason: GPSFailureReason; message: string };

const MAX_STALENESS_SECONDS = 180; // 3 minutes
const MIN_SATELLITES = 4;

export function evaluateFix(
  unitData?: GPSUnitData | null,
  now = new Date()
): GPSFixResult {
  if (!unitData || !unitData.latest || !unitData.latest.valid) {
    return {
      ok: false,
      reason: 'NO_FIX',
      message: 'No valid GPS fix found. Please ensure the GPS node has an open view of the sky.',
    };
  }

  const { latest, receivedAt } = unitData;

  if (latest.sats < MIN_SATELLITES) {
    return {
      ok: false,
      reason: 'FEW_SATS',
      message: `Weak satellite signal (${latest.sats} satellites). Minimum ${MIN_SATELLITES} satellites required.`,
    };
  }

  // Determine time of fix (fixAt or receivedAt)
  const fixTime = latest.fixAt || receivedAt;
  let fixDate: Date;
  if (!fixTime) {
    return {
      ok: false,
      reason: 'NO_FIX',
      message: 'GPS fix timestamp missing.',
    };
  } else if (typeof fixTime === 'string' || typeof fixTime === 'number') {
    fixDate = new Date(fixTime);
  } else if (fixTime instanceof Date) {
    fixDate = fixTime;
  } else if (typeof (fixTime as { seconds?: number }).seconds === 'number') {
    fixDate = new Date((fixTime as { seconds: number }).seconds * 1000);
  } else {
    fixDate = new Date();
  }

  const ageSeconds = Math.floor((now.getTime() - fixDate.getTime()) / 1000);
  if (ageSeconds > MAX_STALENESS_SECONDS) {
    return {
      ok: false,
      reason: 'STALE',
      message: `GPS signal is stale (${Math.round(ageSeconds / 60)} minutes old). Node must be active outdoors.`,
    };
  }

  return {
    ok: true,
    fix: latest,
  };
}
