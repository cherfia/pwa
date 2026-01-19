// Firebase Cloud Messaging Service Worker
// This file is required by FCM - see: https://firebase.google.com/docs/cloud-messaging/web/get-started

// Import Firebase scripts for messaging
importScripts('https://www.gstatic.com/firebasejs/12.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.8.0/firebase-messaging-compat.js');

// Firebase config will be passed via postMessage from the main thread
let firebaseInitialized = false;

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'FIREBASE_CONFIG' && !firebaseInitialized) {
    const firebaseConfig = event.data.config;
    try {
      firebase.initializeApp(firebaseConfig);
      const messaging = firebase.messaging();

      // Handle background messages from FCM
      // This is called when a message is received and the app is in the background
      messaging.onBackgroundMessage((payload) => {
        console.log("[Service Worker]: Received FCM background message", payload);

        const notificationTitle = payload.notification?.title || payload.data?.title || "Notification";
        const notificationOptions = {
          body: payload.notification?.body || payload.data?.body || "",
          icon: payload.notification?.icon || payload.data?.icon || "/android/android-launchericon-192-192.png",
          badge: payload.notification?.badge || payload.data?.badge || "/android/android-launchericon-72-72.png",
          image: payload.notification?.image || payload.data?.image,
          dir: payload.notification?.dir || payload.data?.dir || "auto",
          lang: payload.notification?.lang || payload.data?.lang || "en-US",
          tag: payload.notification?.tag || payload.data?.tag,
          renotify: payload.notification?.renotify || payload.data?.renotify || false,
          requireInteraction: payload.notification?.requireInteraction || payload.data?.requireInteraction || false,
          silent: payload.notification?.silent || payload.data?.silent || false,
          vibrate: payload.notification?.vibrate || payload.data?.vibrate,
          actions: payload.notification?.actions || payload.data?.actions || [],
          data: payload.data || {
            url: payload.data?.url || payload.fcmOptions?.link || "/",
          },
        };

        return self.registration.showNotification(notificationTitle, notificationOptions);
      });

      firebaseInitialized = true;
      console.log("[Service Worker]: Firebase initialized successfully");
    } catch (error) {
      console.error("[Service Worker]: Firebase initialization failed", error);
    }
  }
});

// Handle notification clicks
self.addEventListener("notificationclick", (event) => {
  console.log("[Service Worker]: Received notificationclick event", event.notification);

  try {
    let notification = event.notification;
    const action = event.action;

    // Handle custom actions
    if (action && notification.data) {
      if (action === "open_url" && notification.data.url) {
        console.log("[Service Worker]: Performing action open_url");
        event.waitUntil(clients.openWindow(notification.data.url));
        event.notification.close();
        return;
      }
    }

    // Default click action
    console.log("[Service Worker]: Performing default click action");

    const url = notification.data?.url || "/";
    const fullUrl = url.startsWith("http") ? url : self.location.origin + url;

    event.notification.close();

    // This looks to see if the current is already open and focuses if it is
    event.waitUntil(
      clients
        .matchAll({
          includeUncontrolled: true,
          type: "window",
        })
        .then(function (clientList) {
          for (var i = 0; i < clientList.length; i++) {
            var client = clientList[i];
            if (client.url === fullUrl && "focus" in client) {
              return client.focus();
            }
          }
          if (clients.openWindow) {
            return clients.openWindow(fullUrl);
          }
        })
    );
  } catch (error) {
    console.error("[Service Worker]: Error handling notification click", error);
    // Fallback: just open the root URL
    event.notification.close();
    event.waitUntil(clients.openWindow(self.location.origin + "/"));
  }
});
