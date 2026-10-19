import { getMessaging, getToken, onMessage, isSupported, Messaging } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { app, db } from './firebase';

let messagingInstance: Messaging | null = null;
let isMessagingInitialized = false;

// Audio notification synthesized via Web Audio API (zero external assets needed)
function playNotificationChime() {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    osc1.frequency.exponentialRampToValueAtTime(880.0, now + 0.15); // A5
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.35);
  } catch {
    // Non-fatal if audio context blocked by browser autoplay policy
  }
}

/**
 * Initializes Firebase Cloud Messaging safely.
 */
export async function initMessaging(): Promise<Messaging | null> {
  if (typeof window === 'undefined') return null;
  if (isMessagingInitialized && messagingInstance) return messagingInstance;

  try {
    const supported = await isSupported();
    if (!supported) {
      console.info('Firebase Messaging is not supported in this browser. Falling back to native Notifications.');
      return null;
    }

    messagingInstance = getMessaging(app);
    isMessagingInitialized = true;

    // Listen for foreground FCM messages
    onMessage(messagingInstance, (payload) => {
      console.log('Foreground FCM notification received:', payload);
      const title = payload.notification?.title || payload.data?.title || 'FreshPath Alert';
      const body = payload.notification?.body || payload.data?.body || '';
      const image = payload.notification?.image || payload.data?.image || undefined;
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://freshpath-link.web.app';
      const logoUrl = `${origin}/logo-192.png`;
      const badgeUrl = `${origin}/logo-32.png`;

      playNotificationChime();
      showLocalNotification(title, {
        body,
        tag: payload.data?.tag,
        icon: payload.notification?.icon || logoUrl,
        badge: badgeUrl,
        image,
      } as NotificationOptions);
    });

    return messagingInstance;
  } catch (err) {
    console.warn('FCM init error:', err);
    return null;
  }
}

/**
 * Requests browser notification permission and retrieves FCM push token.
 * Saves the token to the user document in Firestore.
 */
export async function requestNotificationPermission(userUid?: string): Promise<string | null> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return null;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.info('Notification permission was not granted by user.');
      return null;
    }

    const messaging = await initMessaging();
    if (!messaging) return null;

    // Explicitly register /firebase-messaging-sw.js so background push always works reliably
    let swReg: ServiceWorkerRegistration | undefined;
    if ('serviceWorker' in navigator) {
      try {
        swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      } catch (swErr) {
        console.warn('Could not register firebase-messaging-sw.js:', swErr);
      }
    }

    // Get FCM registration token (standard web push)
    let token: string | null = null;
    try {
      token = await getToken(messaging, {
        vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY || undefined,
        serviceWorkerRegistration: swReg,
      });
    } catch (tokenErr) {
      console.info('FCM Token generation note (browser push active):', tokenErr);
    }

    if (token && userUid) {
      // Save device token to user profile
      try {
        await updateDoc(doc(db, 'users', userUid), {
          fcmTokens: arrayUnion(token),
          notificationsEnabled: true,
        });
      } catch (dbErr) {
        console.warn('Failed to sync FCM token to user record:', dbErr);
      }
    }

    return token || 'LOCAL_GRANTED';
  } catch (err) {
    console.warn('Error requesting notification permission:', err);
    return null;
  }
}

/**
 * Shows an instant native system notification.
 * Works even when offline or before token generation.
 */
export function showLocalNotification(
  title: string,
  options?: NotificationOptions & { sound?: boolean }
) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  if (options?.sound !== false) {
    playNotificationChime();
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://freshpath-link.web.app';
  const logoUrl = `${origin}/logo-192.png`;
  const badgeUrl = `${origin}/logo-32.png`;

  const finalOptions: NotificationOptions = {
    icon: options?.icon || logoUrl,
    badge: options?.badge || badgeUrl,
    ...options,
  };

  try {
    // On mobile Android and desktop browsers, ServiceWorkerRegistration.showNotification is required and persistent
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(title, finalOptions);
      }).catch(() => {
        try {
          new Notification(title, finalOptions);
        } catch {
          // ignore
        }
      });
    } else if (typeof Notification !== 'undefined') {
      new Notification(title, finalOptions);
    }
  } catch (e) {
    console.warn('Could not display native notification:', e);
  }
}
