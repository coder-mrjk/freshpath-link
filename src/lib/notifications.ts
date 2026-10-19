import { getMessaging, getToken, onMessage, isSupported, Messaging } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { app, db } from './firebase';
import { DeviceRecord } from '../context/AuthContext';

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
 * Detects current device, OS, and browser from userAgent.
 */
export function detectDevice(): { name: string; os: string; browser: string; type: 'mobile' | 'tablet' | 'desktop' } {
  if (typeof window === 'undefined' || !navigator) {
    return { name: 'Unknown Device', os: 'Unknown', browser: 'Browser', type: 'desktop' };
  }

  const ua = navigator.userAgent;
  let os = 'Unknown OS';
  if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone/i.test(ua)) os = 'iPhone';
  else if (/iPad/i.test(ua)) os = 'iPad';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'Mac';
  else if (/Windows NT/i.test(ua)) os = 'Windows PC';
  else if (/Linux/i.test(ua)) os = 'Linux PC';

  let browser = 'Browser';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua) && !/OPR\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = 'Opera';
  else if (/SamsungBrowser/i.test(ua)) browser = 'Samsung Internet';

  const isMobile = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isTablet = /iPad|Tablet/i.test(ua);
  const type: 'mobile' | 'tablet' | 'desktop' = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop';

  // Construct clean, recognizable device names e.g. "Android Mobile (Chrome)" or "Mac Desktop (Chrome)"
  const suffix = type === 'mobile' && os !== 'iPhone' ? 'Mobile ' : type === 'desktop' && os === 'Mac' ? 'Desktop ' : '';
  const name = `${os} ${suffix}(${browser})`.trim();

  return { name, os, browser, type };
}

/**
 * Requests browser notification permission and retrieves FCM push token.
 * Saves the token and device name metadata to the user document in Firestore.
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

    if (token) {
      if (typeof window !== 'undefined') {
        localStorage.setItem('freshpath_fcm_token', token);
      }

      if (userUid) {
        // Save device token and metadata to user profile
        try {
          const userRef = doc(db, 'users', userUid);
          const userSnap = await getDoc(userRef);
          const currentDev = detectDevice();
          const existingDevices: DeviceRecord[] =
            userSnap.exists() && userSnap.data()?.devices ? userSnap.data()?.devices : [];

          const updatedDevices = existingDevices.filter((d) => d.token !== token);
          updatedDevices.push({
            token,
            name: currentDev.name,
            os: currentDev.os,
            browser: currentDev.browser,
            type: currentDev.type,
            lastSeen: new Date().toISOString(),
          });

          await updateDoc(userRef, {
            devices: updatedDevices,
            fcmTokens: arrayUnion(token),
            notificationsEnabled: true,
          });
        } catch (dbErr) {
          console.warn('Failed to sync FCM token to user record:', dbErr);
        }
      }
    }

    return token || 'LOCAL_GRANTED';
  } catch (err) {
    console.warn('Error requesting notification permission:', err);
    return null;
  }
}

/**
 * Unlinks and removes a registered device token from user profile in Firestore.
 */
export async function removeDeviceToken(userUid: string, tokenToRemove: string): Promise<void> {
  try {
    const userRef = doc(db, 'users', userUid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;
    const data = userSnap.data();
    const existingTokens: string[] = data.fcmTokens || [];
    const existingDevices: DeviceRecord[] = data.devices || [];

    const updatedTokens = existingTokens.filter((t) => t !== tokenToRemove);
    const updatedDevices = existingDevices.filter((d) => d.token !== tokenToRemove);

    await updateDoc(userRef, {
      fcmTokens: updatedTokens,
      devices: updatedDevices,
    });

    if (typeof window !== 'undefined' && localStorage.getItem('freshpath_fcm_token') === tokenToRemove) {
      localStorage.removeItem('freshpath_fcm_token');
    }
  } catch (err) {
    console.warn('Failed to remove device token:', err);
    throw err;
  }
}

/**
 * Shows an instant native system notification.
/**
 * Shows an instant native system notification.
 * Works across desktop (macOS Chrome, Safari, Windows Edge) and mobile (Android Chrome, PWA).
 */
export function showLocalNotification(
  title: string,
  options?: NotificationOptions & { sound?: boolean; url?: string; image?: string }
) {
  if (typeof window === 'undefined') return;

  // 1. Play audio chime if requested
  if (options?.sound !== false) {
    playNotificationChime();
  }

  // 2. Permission check
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const origin = window.location.origin;
  const logoUrl = `${origin}/logo-192.png`;
  const badgeUrl = `${origin}/logo-32.png`;

  // Sanitize notification options strictly according to W3C specification
  const cleanOptions: NotificationOptions = {
    body: options?.body || '',
    icon: options?.icon || logoUrl,
    badge: badgeUrl,
    tag: options?.tag || `freshpath-${Date.now()}`,
    requireInteraction: true,
    silent: false,
  };

  if (options?.image) {
    (cleanOptions as any).image = options.image;
  }

  // 3. Desktop Native Notification: Window Notification API (required on macOS Chrome, Safari, Windows)
  try {
    const directNotif = new Notification(title, cleanOptions);
    directNotif.onclick = (e) => {
      e.preventDefault();
      window.focus();
      if (options?.url) {
        window.location.href = options.url;
      }
      directNotif.close();
    };
  } catch (err) {
    console.info('Window Notification constructor fallback note:', err);
  }

  // 4. Mobile / PWA / Service Worker notification
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (reg && reg.showNotification) {
        reg.showNotification(title, cleanOptions).catch((swErr) => {
          console.warn('ServiceWorker showNotification error:', swErr);
        });
      }
    }).catch((err) => {
      console.warn('Could not get serviceWorker registration for notification:', err);
    });
  }
}
