import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from './firebase';
import { getAnalytics, isSupported as isAnalyticsSupported, logEvent } from 'firebase/analytics';
import { app } from './firebase';

export interface CrashReport {
  message: string;
  name?: string;
  stack?: string;
  componentStack?: string;
  source?: string;
  fatal?: boolean;
  metadata?: Record<string, unknown>;
}

// In-memory cache to prevent duplicate flood reports in case of rapid re-renders
const reportedErrorSignatures = new Set<string>();

/**
 * Reports an exception or application crash.
 * Acts as the Web equivalent of Firebase Crashlytics by:
 * 1. Logging an 'exception' event to Firebase Analytics (if supported)
 * 2. Storing full stack traces and diagnostic context in Firestore `/client_errors`
 */
export async function recordException(report: CrashReport): Promise<void> {
  const signature = `${report.message}:${report.source || ''}:${(report.stack || '').slice(0, 100)}`;
  if (reportedErrorSignatures.has(signature)) {
    return;
  }
  reportedErrorSignatures.add(signature);

  // Keep set memory bounded
  if (reportedErrorSignatures.size > 50) {
    const firstItem = reportedErrorSignatures.values().next().value;
    if (firstItem) reportedErrorSignatures.delete(firstItem);
  }

  // 1. Firebase Analytics event (zero cost)
  try {
    const analyticsSupported = await isAnalyticsSupported();
    if (analyticsSupported) {
      const analytics = getAnalytics(app);
      logEvent(analytics, 'exception', {
        description: report.message.slice(0, 100),
        fatal: report.fatal ?? false,
      });
    }
  } catch {
    // Ignore analytics errors
  }

  // 2. Persistent Crash Telemetry in Firestore `/client_errors`
  try {
    const currentUser = auth.currentUser;
    const errorDoc = {
      message: report.message || 'Unknown Error',
      name: report.name || 'Error',
      stack: report.stack ? report.stack.slice(0, 4000) : null,
      componentStack: report.componentStack ? report.componentStack.slice(0, 4000) : null,
      source: report.source || 'client',
      fatal: report.fatal ?? false,
      userUid: currentUser?.uid || 'anonymous',
      userEmail: currentUser?.email || null,
      url: typeof window !== 'undefined' ? window.location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '',
      timestamp: serverTimestamp(),
      metadata: report.metadata || {},
    };

    await addDoc(collection(db, 'client_errors'), errorDoc);
    console.info('📡 Crash telemetry recorded to /client_errors');
  } catch (err) {
    console.warn('Could not record client error to Firestore:', err);
  }
}

/**
 * Installs global unhandled error and unhandled promise rejection listeners.
 */
export function initGlobalCrashHandlers(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    recordException({
      message: event.message || 'Window Error Event',
      name: event.error?.name || 'Error',
      stack: event.error?.stack,
      source: `${event.filename || 'unknown'}:${event.lineno || 0}:${event.colno || 0}`,
      fatal: true,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    const name = reason instanceof Error ? reason.name : 'UnhandledRejection';

    recordException({
      message: `Unhandled Promise: ${message}`,
      name,
      stack,
      source: 'unhandled_promise_rejection',
      fatal: false,
    });
  });

  console.info('🛡️ Global crash telemetry listeners active');
}
