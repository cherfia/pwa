import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp;
let messaging: Messaging | null = null;

// Initialize Firebase
if (typeof window !== 'undefined') {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  
  // Initialize messaging only in browser
  if ('serviceWorker' in navigator) {
    try {
      messaging = getMessaging(app);
    } catch (error) {
      console.warn('Firebase messaging initialization failed:', error);
    }
  }
}

export { app, messaging };

// Get FCM token
// According to Firebase docs: https://firebase.google.com/docs/cloud-messaging/web/get-started
// Firebase will automatically look for firebase-messaging-sw.js when getToken() is called
// If firebase-messaging-sw.js exists, Firebase will use it automatically
export async function getFCMToken(): Promise<string | null> {
  if (!messaging) {
    console.warn('Firebase messaging not initialized');
    return null;
  }

  try {
    // Request notification permission first (required by FCM)
    // See: https://firebase.google.com/docs/cloud-messaging/web/get-started#access-the-registration-token
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('Notification permission not granted');
      return null;
    }

    // Firebase will automatically use firebase-messaging-sw.js if it exists
    // Otherwise, it will use the currently active service worker
    // We can optionally pass serviceWorkerRegistration to use a specific service worker
    const registration = await navigator.serviceWorker.ready;
    
    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      // Pass the service worker registration so Firebase can use it
      // Firebase will still prefer firebase-messaging-sw.js if it exists
      serviceWorkerRegistration: registration,
    });
    
    return token;
  } catch (error) {
    console.error('Error getting FCM token:', error);
    return null;
  }
}

// Listen for foreground messages
export function onForegroundMessage(callback: (payload: any) => void) {
  if (!messaging) {
    console.warn('Firebase messaging not initialized');
    return () => {};
  }

  return onMessage(messaging, callback);
}
