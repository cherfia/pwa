"use server";

import admin from "firebase-admin";
import { Client } from "@upstash/qstash";
import { randomUUID } from "crypto";
import { buildNotification } from "@/lib/notification-helpers";

const QSTASH_TOKEN = process.env.QSTASH_TOKEN;
const QSTASH_CURRENT_SIGNING_KEY = process.env.QSTASH_CURRENT_SIGNING_KEY;
const QSTASH_NEXT_SIGNING_KEY = process.env.QSTASH_NEXT_SIGNING_KEY;

let tokenStore: string | null = null;
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

export async function subscribeUser(token: string) {
  tokenStore = token;
  return { success: true };
}

export async function unsubscribeUser() {
  tokenStore = null;
  return { success: true };
}

export async function sendNotification(
  message: string,
  fcmToken?: string
) {
  try {
    ensureFirebaseAdmin();

    // Use provided token or fall back to stored one
    const token = fcmToken || tokenStore;

    if (!token) {
      throw new Error("No FCM token available. Please subscribe first.");
    }

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
    console.error("Send notification error:", error);

    // Provide more specific error messages
    if (error instanceof Error || error?.code) {
      const errorCode = error.code || error.message;
      if (errorCode?.includes("invalid-registration-token") || errorCode?.includes("registration-token-not-registered")) {
        throw new Error("FCM token expired or invalid. Please subscribe again.");
      }
      if (errorCode?.includes("unregistered")) {
        throw new Error("FCM token not registered. Please subscribe again.");
      }
      throw new Error(`Failed to send notification: ${error.message || errorCode}`);
    }

    throw new Error("Failed to send notification. Please try again.");
  }
}

export async function scheduleNotification(
  message: string,
  delaySeconds: number,
  fcmToken?: string
) {
  try {
    const token = fcmToken || tokenStore;

    if (!token) {
      throw new Error("No FCM token available. Please subscribe first.");
    }

    if (delaySeconds <= 0) {
      // Send immediately
      return await sendNotification(message, token);
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
        fcmToken: token,
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
