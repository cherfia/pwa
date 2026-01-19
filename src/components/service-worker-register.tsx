'use client';

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        // Register main service worker
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        registration.update();

        // Firebase will automatically use firebase-messaging-sw.js if it exists
        // We don't need to register it separately - Firebase SDK handles it
        // See: https://firebase.google.com/docs/cloud-messaging/web/get-started
        
        // Send Firebase config to firebase-messaging-sw.js via the registered service worker
        // Firebase messaging service worker will receive messages through the service worker messaging API
        const firebaseConfig = {
          apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
          authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
          messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
          appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
        };

        // Send config to service worker when it's ready
        // Firebase messaging service worker will listen for this message
        const sendConfig = (sw: ServiceWorker | null) => {
          if (sw) {
            sw.postMessage({
              type: 'FIREBASE_CONFIG',
              config: firebaseConfig,
            });
          }
        };

        if (registration.active) {
          sendConfig(registration.active);
        } else if (registration.installing) {
          registration.installing.addEventListener('statechange', () => {
            if (registration.installing?.state === 'activated' && registration.active) {
              sendConfig(registration.active);
            }
          });
        } else if (registration.waiting) {
          sendConfig(registration.waiting);
        }
      } catch (error) {
        const err = error as Error;
        // SSL certificate errors will show here - user needs to accept cert or use mkcert
        if (err.message?.includes("SSL certificate") || err.message?.includes("certificate")) {
          console.warn(
            "Service worker registration failed due to SSL certificate. " +
            "Accept the self-signed certificate in your browser, or set up trusted certificates with mkcert."
          );
        } else {
          console.warn("Service worker registration failed", error);
        }
      }
    };

    register();
  }, []);

  return null;
}

