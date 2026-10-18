import {
  getRemoteConfig,
  fetchAndActivate,
  getValue,
  isSupported,
  RemoteConfig,
} from 'firebase/remote-config';
import { app } from './firebase';

export interface RemoteConfigDefaults {
  regulated_price_grade_a_plus: number;
  regulated_price_grade_a: number;
  regulated_price_grade_b: number;
  regulated_price_grade_c: number;
  mandi_temp_safe_min: number;
  mandi_temp_safe_max: number;
  digital_payments_enabled: boolean;
  emergency_broadcast_active: boolean;
  emergency_broadcast_message: string;
}

export const REMOTE_CONFIG_DEFAULTS: RemoteConfigDefaults = {
  regulated_price_grade_a_plus: 60,
  regulated_price_grade_a: 50,
  regulated_price_grade_b: 40,
  regulated_price_grade_c: 30,
  mandi_temp_safe_min: 12.0,
  mandi_temp_safe_max: 15.0,
  digital_payments_enabled: false,
  emergency_broadcast_active: false,
  emergency_broadcast_message: '',
};

let remoteConfigInstance: RemoteConfig | null = null;
let isInitialized = false;

/**
 * Initializes Firebase Remote Config safely.
 * Returns null if running in an unsupported environment (e.g. SSR, test runners).
 */
export async function initRemoteConfig(): Promise<RemoteConfig | null> {
  if (typeof window === 'undefined') return null;
  if (isInitialized && remoteConfigInstance) return remoteConfigInstance;

  try {
    const supported = await isSupported();
    if (!supported) {
      console.info('Firebase Remote Config is not supported in this environment. Using in-app defaults.');
      return null;
    }

    remoteConfigInstance = getRemoteConfig(app);

    // Set configuration settings
    remoteConfigInstance.settings = {
      minimumFetchIntervalMillis: 60000, // 1 minute in development / fast refresh
      fetchTimeoutMillis: 10000,
    };

    // Set default in-app values (ensures instant availability with zero lag)
    remoteConfigInstance.defaultConfig = {
      regulated_price_grade_a_plus: REMOTE_CONFIG_DEFAULTS.regulated_price_grade_a_plus,
      regulated_price_grade_a: REMOTE_CONFIG_DEFAULTS.regulated_price_grade_a,
      regulated_price_grade_b: REMOTE_CONFIG_DEFAULTS.regulated_price_grade_b,
      regulated_price_grade_c: REMOTE_CONFIG_DEFAULTS.regulated_price_grade_c,
      mandi_temp_safe_min: REMOTE_CONFIG_DEFAULTS.mandi_temp_safe_min,
      mandi_temp_safe_max: REMOTE_CONFIG_DEFAULTS.mandi_temp_safe_max,
      digital_payments_enabled: REMOTE_CONFIG_DEFAULTS.digital_payments_enabled,
      emergency_broadcast_active: REMOTE_CONFIG_DEFAULTS.emergency_broadcast_active,
      emergency_broadcast_message: REMOTE_CONFIG_DEFAULTS.emergency_broadcast_message,
    };

    // Fetch and activate latest server values asynchronously
    try {
      await fetchAndActivate(remoteConfigInstance);
    } catch (fetchErr) {
      console.warn('Remote Config background fetch note (using defaults):', fetchErr);
    }

    isInitialized = true;
    return remoteConfigInstance;
  } catch (err) {
    console.warn('Remote Config init warning:', err);
    return null;
  }
}

/**
 * Gets a string value from Remote Config with fallback to defaults.
 */
export function getRemoteString(key: keyof RemoteConfigDefaults): string {
  if (!remoteConfigInstance) {
    const fallback = REMOTE_CONFIG_DEFAULTS[key];
    return typeof fallback === 'string' ? fallback : String(fallback);
  }
  try {
    const val = getValue(remoteConfigInstance, key).asString();
    return val || String(REMOTE_CONFIG_DEFAULTS[key] ?? '');
  } catch {
    return String(REMOTE_CONFIG_DEFAULTS[key] ?? '');
  }
}

/**
 * Gets a boolean value from Remote Config with fallback to defaults.
 */
export function getRemoteBoolean(key: keyof RemoteConfigDefaults): boolean {
  if (!remoteConfigInstance) {
    return Boolean(REMOTE_CONFIG_DEFAULTS[key]);
  }
  try {
    return getValue(remoteConfigInstance, key).asBoolean();
  } catch {
    return Boolean(REMOTE_CONFIG_DEFAULTS[key]);
  }
}

/**
 * Gets a number value from Remote Config with fallback to defaults.
 */
export function getRemoteNumber(key: keyof RemoteConfigDefaults): number {
  if (!remoteConfigInstance) {
    return Number(REMOTE_CONFIG_DEFAULTS[key]);
  }
  try {
    const num = getValue(remoteConfigInstance, key).asNumber();
    return isNaN(num) ? Number(REMOTE_CONFIG_DEFAULTS[key]) : num;
  } catch {
    return Number(REMOTE_CONFIG_DEFAULTS[key]);
  }
}
