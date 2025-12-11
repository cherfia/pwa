'use server';

import webPush from "web-push";

type SerializedSubscription = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  expirationTime?: number | null;
};

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_CONTACT = process.env.VAPID_CONTACT_EMAIL ?? "mailto:admin@pwa-demo.local";

let subscriptionStore: SerializedSubscription | null = null;
let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    throw new Error("Missing VAPID keys. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.");
  }
  webPush.setVapidDetails(VAPID_CONTACT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidConfigured = true;
}

export async function subscribeUser(subscription: SerializedSubscription) {
  ensureVapid();
  subscriptionStore = subscription;
  return { success: true };
}

export async function unsubscribeUser() {
  subscriptionStore = null;
  return { success: true };
}

export async function sendNotification(message: string) {
  ensureVapid();

  if (!subscriptionStore) {
    throw new Error("No subscription available");
  }

  const payload = JSON.stringify({
    title: "PWA Demo",
    body: message,
    icon: "/android/android-launchericon-192-192.png",
    badge: "/android/android-launchericon-72-72.png",
  });

  await webPush.sendNotification(subscriptionStore, payload);

  return { success: true };
}

