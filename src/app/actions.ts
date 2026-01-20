"use server";

import webpush from "web-push";
import { Client } from "@upstash/qstash";
import { randomUUID } from "crypto";
import { buildNotification } from "@/lib/notification-helpers";

const QSTASH_TOKEN = process.env.QSTASH_TOKEN;

// VAPID keys for Web Push
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

// Initialize web-push with VAPID details
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

let subscriptionStore: PushSubscriptionJSON | null = null;

// Initialize QStash client (only if token is provided)
const qstashClient = QSTASH_TOKEN
  ? new Client({ token: QSTASH_TOKEN })
  : null;

export async function subscribeUser(subscription: PushSubscriptionJSON) {
  subscriptionStore = subscription;
  return { success: true };
}

export async function unsubscribeUser() {
  subscriptionStore = null;
  return { success: true };
}

export async function sendNotification(
  message: string,
  subscription?: PushSubscriptionJSON
) {
  const sub = subscription || subscriptionStore;

  if (!sub) {
    throw new Error("No subscription available. Please subscribe first.");
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    throw new Error("VAPID keys not configured.");
  }

  try {
    const notification = buildNotification("PWA Demo", message);

    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      icon: notification.icon,
      badge: notification.badge,
      image: notification.image,
      tag: notification.tag,
      data: notification.data,
    });

    await webpush.sendNotification(sub as webpush.PushSubscription, payload);

    console.log("Successfully sent Web Push notification");
    return { success: true };
  } catch (error: any) {
    console.error("Web Push notification error:", error);

    if (error.statusCode === 410 || error.statusCode === 404) {
      throw new Error("Push subscription expired. Please subscribe again.");
    }

    throw new Error(
      `Failed to send notification: ${error.message || "Unknown error"}`
    );
  }
}

export async function scheduleNotification(
  message: string,
  delaySeconds: number,
  subscription?: PushSubscriptionJSON
) {
  const sub = subscription || subscriptionStore;

  if (!sub) {
    throw new Error("No subscription available. Please subscribe first.");
  }

  if (delaySeconds <= 0) {
    return await sendNotification(message, sub);
  }

  if (!qstashClient) {
    throw new Error(
      "QStash is not configured. Please set QSTASH_TOKEN environment variable."
    );
  }

  const notificationId = randomUUID();
  const scheduledFor = Date.now() + delaySeconds * 1000;

  const baseUrl = "https://pwa-demo-ke.vercel.app";
  const callbackUrl = `${baseUrl}/api/notifications/send-scheduled`;

  console.log(`Scheduling notification with QStash:`, {
    notificationId,
    delaySeconds,
    callbackUrl,
    scheduledFor: new Date(scheduledFor).toISOString(),
  });

  const result = await qstashClient.publishJSON({
    url: callbackUrl,
    body: {
      id: notificationId,
      message,
      subscription: sub,
    },
    delay: delaySeconds,
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
}
