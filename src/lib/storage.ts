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
      minTemp: 0,
      maxTemp: 0,
      avgTemp: 0,
      avgHumidity: 0,
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

/**
 * Calculates Dew Point (°C) using the Magnus formula.
 * The dew point is the temperature to which air must be cooled to become saturated with water vapor.
 * If the facility temperature drops below dew point, water condenses on tomatoes causing rapid fungal rot.
 */
export function calculateDewPoint(tempC: number, humidityPct: number): number {
  if (isNaN(tempC) || isNaN(humidityPct) || humidityPct <= 0) return tempC;
  const a = 17.27;
  const b = 237.7;
  const alpha = ((a * tempC) / (b + tempC)) + Math.log(humidityPct / 100.0);
  const dewPoint = (b * alpha) / (a - alpha);
  return Math.round(dewPoint * 10) / 10;
}

/**
 * Calculates Vapor Pressure Deficit (VPD in kPa).
 * VPD measures the drying power of the air.
 * - VPD > 1.2 kPa: Excessive transpiration, causing tomato weight loss and wrinkling.
 * - VPD < 0.4 kPa: Air too humid, moisture condensation risk and pathogen development.
 * - Optimal VPD: 0.4 – 0.8 kPa (preserves skin turgor and freshness).
 */
export function calculateVPD(tempC: number, humidityPct: number): number {
  if (isNaN(tempC) || isNaN(humidityPct)) return 0.5;
  const clampedHum = Math.min(100, Math.max(0, humidityPct));
  // Saturated vapor pressure (kPa)
  const vpSat = 0.61078 * Math.exp((17.27 * tempC) / (tempC + 237.3));
  // Actual vapor pressure (kPa)
  const vpAct = vpSat * (clampedHum / 100.0);
  const vpd = Math.max(0, vpSat - vpAct);
  return Math.round(vpd * 100) / 100;
}

/**
 * Calculates Heat Index / Apparent Temperature (°C).
 * Approximates how hot it feels when relative humidity is factored with actual air temperature.
 */
export function calculateHeatIndex(tempC: number, humidityPct: number): number {
  if (isNaN(tempC) || isNaN(humidityPct)) return tempC;
  if (tempC < 20.0) return tempC; // Heat index only applies meaningfully above 20°C
  const t = tempC;
  const r = humidityPct;
  const hi = -8.78469475556 +
    1.61139411 * t +
    2.33854883889 * r -
    0.14611605 * t * r -
    0.012308094 * t * t -
    0.0164248277778 * r * r +
    0.002211732 * t * t * r +
    0.00072546 * t * r * r -
    0.000003582 * t * t * r * r;
  return Math.round(hi * 10) / 10;
}

/**
 * Evaluates holistic Mandi facility climate for fresh tomato preservation.
 */
export function evaluateMandiClimate(tempC?: number, humidityPct?: number): {
  status: 'optimal' | 'stable' | 'warning' | 'critical';
  label: string;
  colorClass: string;
  advice: string;
  dewPoint: number;
  vpd: number;
  heatIndex: number;
} {
  const t = tempC ?? 14.0;
  const h = humidityPct ?? 87.0;
  const dp = calculateDewPoint(t, h);
  const vpd = calculateVPD(t, h);
  const hi = calculateHeatIndex(t, h);

  if (t >= 12.0 && t <= 15.0 && h >= 85.0 && h <= 92.0) {
    return {
      status: 'optimal',
      label: 'Optimal Chilled Storage',
      colorClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
      advice: 'Ideal climate: minimum respiration and moisture loss.',
      dewPoint: dp,
      vpd,
      heatIndex: hi,
    };
  }

  if (t <= 22.0 && h >= 70.0 && h <= 90.0) {
    return {
      status: 'stable',
      label: 'Cool Ambient Transit',
      colorClass: 'bg-sky-500/20 text-sky-300 border-sky-400/40',
      advice: 'Safe for short-term Mandi holding (1–2 days).',
      dewPoint: dp,
      vpd,
      heatIndex: hi,
    };
  }

  if (t > 28.0) {
    return {
      status: 'critical',
      label: 'Heat Spike Alert',
      colorClass: 'bg-red-500/20 text-red-300 border-red-400/40',
      advice: 'High temperatures accelerate ethylene production and softening. Dispatch urgently.',
      dewPoint: dp,
      vpd,
      heatIndex: hi,
    };
  }

  if (h > 94.0 || Math.abs(t - dp) < 1.0) {
    return {
      status: 'warning',
      label: 'Condensation / Rot Risk',
      colorClass: 'bg-amber-500/20 text-amber-300 border-amber-400/40',
      advice: 'High humidity near dew point may form water droplets on tomato skins.',
      dewPoint: dp,
      vpd,
      heatIndex: hi,
    };
  }

  return {
    status: 'warning',
    label: 'Warm Ambient',
    colorClass: 'bg-amber-500/20 text-amber-300 border-amber-400/40',
    advice: 'Moderate temperature: monitor crate holding time.',
    dewPoint: dp,
    vpd,
    heatIndex: hi,
  };
}
