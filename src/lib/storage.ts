/**
 * FreshPath Link - Mandi Cold Storage Telemetry & Compliance Helpers
 *
 * Optimal Parameters for Tomato Storage:
 * - Temperature: 12.0°C to 15.0°C
 * - Relative Humidity: 85% to 90%
 */

export interface StorageReading {
  tempC: number;
  humidityPct: number;
  at: any; // ISO string, Date, or Firestore Timestamp
}

export interface StorageUnit {
  id: string;
  mandiId: string;
  name: string;
  nodeUnitId: string; // e.g. "STORE-01"
  latest?: {
    tempC: number;
    humidityPct: number;
    at: any;
  };
  currentTemp?: number;
  currentHumidity?: number;
  capacityCrates?: number;
  targetTempMin?: number;
  targetTempMax?: number;
  targetHumidityMin?: number;
  targetHumidityMax?: number;
  createdAt?: any;
}

export type ComplianceStatus = 'optimal' | 'warning' | 'critical';

export const STORAGE_DEFAULTS = {
  TARGET_TEMP_MIN: 12.0,
  TARGET_TEMP_MAX: 15.0,
  TARGET_HUMIDITY_MIN: 85.0,
  TARGET_HUMIDITY_MAX: 90.0,
  CRITICAL_HIGH_TEMP: 22.0,
  CRITICAL_LOW_TEMP: 8.0,
};

/**
 * Evaluates whether temperature reading complies with optimal cold-storage envelope.
 */
export function getStorageTemperatureStatus(
  tempC?: number | null,
  min = STORAGE_DEFAULTS.TARGET_TEMP_MIN,
  max = STORAGE_DEFAULTS.TARGET_TEMP_MAX
): ComplianceStatus {
  if (tempC === undefined || tempC === null || isNaN(tempC)) {
    return 'warning';
  }

  if (tempC >= min && tempC <= max) {
    return 'optimal';
  }

  if (tempC > STORAGE_DEFAULTS.CRITICAL_HIGH_TEMP || tempC < STORAGE_DEFAULTS.CRITICAL_LOW_TEMP) {
    return 'critical';
  }

  return 'warning';
}

/**
 * Evaluates humidity compliance.
 */
export function getStorageHumidityStatus(
  humidityPct?: number | null,
  min = STORAGE_DEFAULTS.TARGET_HUMIDITY_MIN,
  max = STORAGE_DEFAULTS.TARGET_HUMIDITY_MAX
): ComplianceStatus {
  if (humidityPct === undefined || humidityPct === null || isNaN(humidityPct)) {
    return 'warning';
  }

  if (humidityPct >= min && humidityPct <= max) {
    return 'optimal';
  }

  if (humidityPct < 70.0 || humidityPct > 98.0) {
    return 'critical';
  }

  return 'warning';
}

/**
 * Parses timestamp from Date, ISO string, or Firestore Timestamp object.
 */
export function parseReadingDate(rawDate: any): Date {
  if (!rawDate) return new Date();
  if (rawDate instanceof Date) return rawDate;
  if (typeof rawDate.toDate === 'function') return rawDate.toDate();
  if (typeof rawDate.seconds === 'number') return new Date(rawDate.seconds * 1000);
  if (typeof rawDate === 'string' || typeof rawDate === 'number') return new Date(rawDate);
  return new Date();
}

/**
 * Calculates statistical summary across stored telemetry readings:
 * - minTemp, maxTemp, avgTemp
 * - avgHumidity
 * - hoursAbove30C (used by freshness algorithm)
 */
export function calculateStorageTelemetryStats(readings: StorageReading[]): {
  minTemp: number;
  maxTemp: number;
  avgTemp: number;
  avgHumidity: number;
  count: number;
  hoursAbove30C: number;
} {
  if (!readings || readings.length === 0) {
    return {
      minTemp: 13.5,
      maxTemp: 13.5,
      avgTemp: 13.5,
      avgHumidity: 88.0,
      count: 0,
      hoursAbove30C: 0,
    };
  }

  let minTemp = Infinity;
  let maxTemp = -Infinity;
  let sumTemp = 0;
  let sumHum = 0;
  let above30Count = 0;

  for (const r of readings) {
    const t = Number(r.tempC) || 0;
    const h = Number(r.humidityPct) || 0;

    if (t < minTemp) minTemp = t;
    if (t > maxTemp) maxTemp = t;
    sumTemp += t;
    sumHum += h;

    if (t > 30.0) {
      above30Count++;
    }
  }

  const count = readings.length;
  // Estimate hours above 30 based on sampling interval (assuming 1 reading per hour if coarse, or proportional)
  const hoursAbove30C = Math.round((above30Count / Math.max(1, count)) * 24 * 10) / 10;

  return {
    minTemp: Math.round(minTemp * 10) / 10,
    maxTemp: Math.round(maxTemp * 10) / 10,
    avgTemp: Math.round((sumTemp / count) * 10) / 10,
    avgHumidity: Math.round((sumHum / count) * 10) / 10,
    count,
    hoursAbove30C,
  };
}

/**
 * Returns human-readable storage duration (e.g. "5 hrs", "1 day 4 hrs").
 */
export function formatStorageDuration(
  receivedAt: any,
  dispatchedAt: any = new Date()
): string {
  const start = parseReadingDate(receivedAt).getTime();
  const end = parseReadingDate(dispatchedAt).getTime();
  const diffMs = Math.max(0, end - start);

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours < 1) {
    return `${Math.max(1, minutes)} mins`;
  }
  if (hours < 24) {
    return `${hours} hrs ${minutes > 0 ? `${minutes}m` : ''}`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days}d ${remHours > 0 ? `${remHours}h` : ''}`;
}
