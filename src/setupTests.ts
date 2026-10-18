import '@testing-library/jest-dom'

// Ensure tests always have safe fallback values if env variables are not provided
process.env.VITE_FIREBASE_API_KEY = process.env.VITE_FIREBASE_API_KEY || 'test-api-key';
process.env.VITE_FIREBASE_AUTH_DOMAIN = process.env.VITE_FIREBASE_AUTH_DOMAIN || 'freshpath-link.firebaseapp.com';
process.env.VITE_FIREBASE_PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || 'freshpath-link';
process.env.VITE_FIREBASE_STORAGE_BUCKET = process.env.VITE_FIREBASE_STORAGE_BUCKET || 'freshpath-link.firebasestorage.app';
process.env.VITE_FIREBASE_MESSAGING_SENDER_ID = process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '660502674071';
process.env.VITE_FIREBASE_APP_ID = process.env.VITE_FIREBASE_APP_ID || '1:660502674071:web:test';
