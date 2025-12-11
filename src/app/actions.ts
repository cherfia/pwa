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
    const missing = [];
    if (!VAPID_PUBLIC_KEY) missing.push("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
    if (!VAPID_PRIVATE_KEY) missing.push("VAPID_PRIVATE_KEY");
    throw new Error(`Missing VAPID keys in production: ${missing.join(", ")}. Please set these environment variables.`);
  }
  try {
    webPush.setVapidDetails(VAPID_CONTACT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
  } catch (error) {
    throw new Error(`Failed to configure VAPID: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function subscribeUser(subscription: SerializedSubscription) {
  try {
    ensureVapid();
    subscriptionStore = subscription;
    return { success: true };
  } catch (error) {
    console.error("subscribeUser error:", error);
    throw error;
  }
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

