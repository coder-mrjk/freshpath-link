import { getPerformance, trace, FirebasePerformance } from 'firebase/performance';
import { app } from './firebase';

let perfInstance: FirebasePerformance | null = null;

/**
 * Initializes Firebase Performance Monitoring safely in the browser.
 * Operates at zero additional cost on the Firebase Spark Free Plan.
 */
export function initPerformance(): FirebasePerformance | null {
  if (typeof window === 'undefined') return null;

  if (!perfInstance) {
    try {
      perfInstance = getPerformance(app);
      console.info('⚡ Firebase Performance Monitoring initialized');
    } catch (err) {
      // In development or environments without full Performance API support, log a warning
      console.warn('Firebase Performance Monitoring initialization skipped:', err);
    }
  }
  return perfInstance;
}

/**
 * Measures the execution time of an asynchronous operation using a custom Firebase Performance trace.
 * Use for latency-sensitive supply chain actions like QR scanning, crate creation, or batch syncing.
 */
export async function measureAsyncTrace<T>(traceName: string, operation: () => Promise<T>): Promise<T> {
  const perf = initPerformance();
  if (!perf) {
    return operation();
  }

  const customTrace = trace(perf, traceName);
  try {
    customTrace.start();
  } catch (err) {
    // If trace fails to start, proceed with operation
    return operation();
  }

  try {
    const result = await operation();
    return result;
  } finally {
    try {
      customTrace.stop();
    } catch {
      // noop
    }
  }
}
