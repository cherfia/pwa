self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Intentionally pass through to network; add caching here if needed later.
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const title = data.title || "Notification";
  const body = data.body || "";
  const icon = data.icon || "/android/android-launchericon-192-192.png";
  const badge = data.badge || "/android/android-launchericon-72-72.png";

  const notificationPromise = self.registration.showNotification(title, {
    body,
    icon,
    badge,
    data: {
      url: data.url || "/",
    },
  });

  event.waitUntil(notificationPromise);
});

self.addEventListener("notificationclick", (event) => {
  const url = event.notification?.data?.url || "/";
  event.notification.close();
  event.waitUntil(clients.openWindow(url));
});

