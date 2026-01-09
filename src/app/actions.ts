"use server";

import webPush from "web-push";
import {
  addScheduledNotification,
  type ScheduledNotification,
} from "@/lib/notification-storage";
import { randomUUID } from "crypto";

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
const VAPID_CONTACT =
  process.env.VAPID_CONTACT_EMAIL ?? "mailto:admin@pwa-demo.local";

let subscriptionStore: SerializedSubscription | null = null;
let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return;
  console.log("Server VAPID Public Key length:", VAPID_PUBLIC_KEY?.length || 0);
  console.log(
    "Server VAPID Public Key (first 20 chars):",
    VAPID_PUBLIC_KEY?.substring(0, 20) || "missing"
  );
  webPush.setVapidDetails(VAPID_CONTACT, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
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

export async function sendNotification(
  message: string,
  subscription?: SerializedSubscription
) {
  try {
    ensureVapid();

    // Use provided subscription or fall back to stored one
    const sub = subscription || subscriptionStore;

    if (!sub) {
      throw new Error("No subscription available. Please subscribe first.");
    }

    const payload = JSON.stringify({
      title: "PWA Demo",
      body: message,
      icon: "/android/android-launchericon-192-192.png",
      badge: "/android/android-launchericon-72-72.png",
    });

    await webPush.sendNotification(sub, payload);

    return { success: true };
  } catch (error) {
    console.error("Send notification error:", error);

    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes("expired") || error.message.includes("410")) {
        throw new Error("Subscription expired. Please subscribe again.");
      }
      if (error.message.includes("404") || error.message.includes("410")) {
        throw new Error("Subscription not found. Please subscribe again.");
      }
      throw new Error(`Failed to send notification: ${error.message}`);
    }

    throw new Error("Failed to send notification. Please try again.");
  }
}

export async function scheduleNotification(
  message: string,
  delayMinutes: number,
  subscription?: SerializedSubscription
) {
  try {
    const sub = subscription || subscriptionStore;

    if (!sub) {
      throw new Error("No subscription available. Please subscribe first.");
    }

    if (delayMinutes <= 0) {
      // Send immediately
      return await sendNotification(message, sub);
    }

    const scheduledFor = Date.now() + delayMinutes * 60 * 1000;
    const scheduledNotification: ScheduledNotification = {
      id: randomUUID(),
      message,
      subscription: sub,
      scheduledFor,
      createdAt: Date.now(),
    };

    await addScheduledNotification(scheduledNotification);

    return {
      success: true,
      scheduledFor,
      id: scheduledNotification.id,
    };
  } catch (error) {
    console.error("Schedule notification error:", error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Failed to schedule notification. Please try again.");
  }
}
