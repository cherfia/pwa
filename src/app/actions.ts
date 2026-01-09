"use server";

import webPush from "web-push";
import { Client } from "@upstash/qstash";
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
const QSTASH_TOKEN = process.env.QSTASH_TOKEN;
const QSTASH_CURRENT_SIGNING_KEY = process.env.QSTASH_CURRENT_SIGNING_KEY;
const QSTASH_NEXT_SIGNING_KEY = process.env.QSTASH_NEXT_SIGNING_KEY;

let subscriptionStore: SerializedSubscription | null = null;
let vapidConfigured = false;

// Initialize QStash client (only if token is provided)
const qstashClient = QSTASH_TOKEN
  ? new Client({
      token: QSTASH_TOKEN,
    })
  : null;

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

    // iOS Safari requires Urgency header
    await webPush.sendNotification(sub, payload, {
      headers: {
        Urgency: "normal",
      },
    });

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
  delaySeconds: number,
  subscription?: SerializedSubscription
) {
  try {
    const sub = subscription || subscriptionStore;

    if (!sub) {
      throw new Error("No subscription available. Please subscribe first.");
    }

    if (delaySeconds <= 0) {
      // Send immediately
      return await sendNotification(message, sub);
    }

    if (!qstashClient) {
      throw new Error(
        "QStash is not configured. Please set QSTASH_TOKEN environment variable."
      );
    }

    const notificationId = randomUUID();
    const scheduledFor = Date.now() + delaySeconds * 1000;

    // Get the base URL for the callback
    // Hardcoded to production URL to avoid preview deployment URLs
    const baseUrl = "https://pwa-demo-ke.vercel.app";

    const callbackUrl = `${baseUrl}/api/notifications/send-scheduled`;

    console.log(`Scheduling notification with QStash:`, {
      notificationId,
      delaySeconds,
      callbackUrl,
      scheduledFor: new Date(scheduledFor).toISOString(),
    });

    // Schedule the notification with QStash
    const result = await qstashClient.publishJSON({
      url: callbackUrl,
      body: {
        id: notificationId,
        message,
        subscription: sub,
      },
      delay: delaySeconds, // Delay in seconds
    });

    console.log(`QStash message scheduled:`, {
      messageId: result.messageId,
      notificationId,
    });

    return {
      success: true,
      scheduledFor,
      id: notificationId,
      messageId: result.messageId,
    };
  } catch (error) {
    console.error("Schedule notification error:", error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Failed to schedule notification. Please try again.");
  }
}
