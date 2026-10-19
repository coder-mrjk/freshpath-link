// Firebase Cloud Messaging Background Service Worker
// FreshPath Link - Decentralized Agricultural Provenance

importScripts('https://www.gstatic.com/firebasejs/10.13.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.1/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: 'AIzaSyD3m_FxkJO-QTGG7MXmYjX_rmi4DDllbmk',
  authDomain: 'freshpath-link.firebaseapp.com',
  projectId: 'freshpath-link',
  storageBucket: 'freshpath-link.firebasestorage.app',
  messagingSenderId: '660502674071',
  appId: '1:660502674071:web:e59581c52b6059b21c47d2',
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message: ', payload);

  const notificationTitle = payload.notification?.title || payload.data?.title || 'FreshPath Alert';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || 'New supply chain event detected.',
    icon: '/logo-192.png',
    badge: '/logo-192.png',
    image: payload.notification?.image || payload.data?.image || undefined,
    tag: payload.data?.tag || 'freshpath-notification',
    data: {
      url: payload.data?.url || payload.fcmOptions?.link || '/',
    },
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
