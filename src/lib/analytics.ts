import { getAnalytics, logEvent, isSupported, Analytics } from 'firebase/analytics';
import { app } from './firebase';

let analyticsInstance: Analytics | null = null;

/**
 * Initializes Firebase Google Analytics (GA4) safely.
 * Tied to measurement ID: G-CFT4QM8YRR
 */
export async function initAnalytics(): Promise<Analytics | null> {
  if (typeof window === 'undefined') return null;
  if (analyticsInstance) return analyticsInstance;

  try {
    const supported = await isSupported();
    if (supported) {
      analyticsInstance = getAnalytics(app);
      console.info('📊 Firebase Google Analytics (GA4) active');
    }
  } catch (err) {
    console.warn('Google Analytics initialization notice:', err);
  }
  return analyticsInstance;
}

/**
 * Logs a custom business analytics event to Google Analytics.
 */
export async function logAnalyticsEvent(eventName: string, eventParams?: Record<string, unknown>): Promise<void> {
  try {
    const analytics = await initAnalytics();
    if (analytics) {
      logEvent(analytics, eventName, eventParams);
    }
  } catch (err) {
    // Non-fatal analytics notice
    console.debug('Analytics logEvent notice:', err);
  }
}

/**
 * Logs a screen/page view to Google Analytics.
 */
export async function logScreenView(screenName: string): Promise<void> {
  return logAnalyticsEvent('screen_view', {
    firebase_screen: screenName,
    firebase_screen_class: screenName,
  });
}
