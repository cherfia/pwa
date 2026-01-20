"use server";

import admin from "firebase-admin";
import webpush from "web-push";
import { Client } from "@upstash/qstash";
import { randomUUID } from "crypto";
import { buildNotification } from "@/lib/notification-helpers";

const QSTASH_TOKEN = process.env.QSTASH_TOKEN;
const QSTASH_CURRENT_SIGNING_KEY = process.env.QSTASH_CURRENT_SIGNING_KEY;
const QSTASH_NEXT_SIGNING_KEY = process.env.QSTASH_NEXT_SIGNING_KEY;

// VAPID keys for Web Push (required for iOS)
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

// Initialize web-push with VAPID details
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// Type for push subscriptions (FCM token or Web Push subscription)
export type PushSubscription =
  | { type: "fcm"; token: string }
  | { type: "webpush"; subscription: PushSubscriptionJSON };

let subscriptionStore: PushSubscription | null = null;
let firebaseAdminInitialized = false;

// Initialize Firebase Admin
function ensureFirebaseAdmin() {
  if (firebaseAdminInitialized) return;

  if (!admin.apps.length) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (serviceAccount) {
      try {
        const serviceAccountJson = JSON.parse(serviceAccount);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccountJson),
        });
      } catch (error) {
        console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT:", error);
        throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT format");
      }
    } else {
      // Try to use default credentials (for environments like Vercel with Firebase integration)
      admin.initializeApp();
    }
  }

  firebaseAdminInitialized = true;
}

// Initialize QStash client (only if token is provided)
const qstashClient = QSTASH_TOKEN
  ? new Client({
      token: QSTASH_TOKEN,
    })
  : null;

export async function subscribeUser(subscription: PushSubscription) {
  subscriptionStore = subscription;
  return { success: true };
}

export async function unsubscribeUser() {
  subscriptionStore = null;
  return { success: true };
}

export async function sendNotification(
  message: string,
  subscription?: PushSubscription
) {
  const sub = subscription || subscriptionStore;

  if (!sub) {
    throw new Error("No subscription available. Please subscribe first.");
  }

  if (sub.type === "webpush") {
    return sendWebPushNotification(message, sub.subscription);
  } else {
    return sendFCMNotification(message, sub.token);
  }
}

// Send via Web Push (for iOS Safari PWA)
async function sendWebPushNotification(
  message: string,
  subscription: PushSubscriptionJSON
) {
  try {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      throw new Error(
        "VAPID keys not configured. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY."
      );
    }

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

    await webpush.sendNotification(
      subscription as webpush.PushSubscription,
      payload
    );

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

// Send via FCM (for Android/Desktop)
async function sendFCMNotification(message: string, token: string) {
  try {
    ensureFirebaseAdmin();

    const notification = buildNotification("PWA Demo", message);

    // Firebase Admin SDK requires all data values to be strings
    const dataPayload: { [key: string]: string } = {
      icon: notification.icon || "",
      badge: notification.badge || "",
    };

    // Convert all notification.data values to strings
    if (notification.data) {
      Object.entries(notification.data).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          dataPayload[key] = String(value);
        }
      });
    }

    const messagePayload = {
      notification: {
        title: notification.title,
        body: notification.body,
        imageUrl: notification.image,
      },
      data: dataPayload,
      android: {
        notification: {
          icon: notification.icon,
          sound: notification.silent ? undefined : "default",
          channelId: "default",
        },
      },
      webpush: {
        notification: {
          icon: notification.icon,
          badge: notification.badge,
          image: notification.image,
          requireInteraction: notification.requireInteraction,
          tag: notification.tag,
          renotify: notification.renotify,
          vibrate: notification.vibrate,
          actions: notification.actions,
        },
        fcmOptions: {
          link: notification.data?.url || "/",
        },
      },
      token,
    };

    const response = await admin.messaging().send(messagePayload);
    console.log("Successfully sent FCM message:", response);

    return { success: true, messageId: response };
  } catch (error: any) {
    console.error("Send FCM notification error:", error);

    // Provide more specific error messages
    if (error instanceof Error || error?.code) {
      const errorCode = error.code || error.message;
      if (
        errorCode?.includes("invalid-registration-token") ||
        errorCode?.includes("registration-token-not-registered")
      ) {
        throw new Error("FCM token expired or invalid. Please subscribe again.");
      }
      if (errorCode?.includes("unregistered")) {
        throw new Error("FCM token not registered. Please subscribe again.");
      }
      throw new Error(
        `Failed to send notification: ${error.message || errorCode}`
      );
    }

    throw new Error("Failed to send notification. Please try again.");
  }
}

export async function scheduleNotification(
  message: string,
  delaySeconds: number,
  subscription?: PushSubscription
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
