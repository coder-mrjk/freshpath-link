import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'dummy-api-key',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'freshpath-link.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'freshpath-link',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'freshpath-link.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '660502674071',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:660502674071:web:freshpath',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-CFT4QM8YRR',
};

// Initialize Firebase App
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Services
export const auth = getAuth(app);
export const db = getFirestore(app);

// Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Optional local emulator connection
if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  const host = 'localhost';
  try {
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
    console.info('🔌 Connected to Firebase Local Emulators');
  } catch (err) {
    console.warn('Firebase emulator connection warning:', err);
  }
}
