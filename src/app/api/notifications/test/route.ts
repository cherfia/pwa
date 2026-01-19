import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { buildNotification } from "@/lib/notification-helpers";

let firebaseAdminInitialized = false;

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
      admin.initializeApp();
    }
  }

  firebaseAdminInitialized = true;
}

// Test endpoint to verify push notifications work
export async function POST(request: Request) {
  try {
    ensureFirebaseAdmin();

    const body = await request.json();
    const { fcmToken, message } = body as {
      fcmToken: string;
      message?: string;
    };

    if (!fcmToken) {
      return NextResponse.json(
        { error: "Missing FCM token" },
        { status: 400 }
      );
    }

    const notification = buildNotification(
      "PWA Demo - Test",
      message || "Test notification from API"
    );

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
      token: fcmToken,
    };

    const response = await admin.messaging().send(messagePayload);

    return NextResponse.json({
      success: true,
      message: "Test notification sent",
      messageId: response,
    });
  } catch (error) {
    console.error("Test notification error:", error);
    return NextResponse.json(
      {
        error: "Failed to send test notification",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
