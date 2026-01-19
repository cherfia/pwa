import { NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
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

async function handler(request: Request) {
  let notificationId: string | undefined;
  try {
    console.log("QStash callback received at:", new Date().toISOString());

    ensureFirebaseAdmin();

    const body = await request.json();
    console.log("Received body:", {
      id: body.id,
      hasMessage: !!body.message,
      hasFcmToken: !!body.fcmToken,
      fcmTokenPreview: body.fcmToken
        ? body.fcmToken.substring(0, 50) + "..."
        : null,
    });

    const { id, message, fcmToken } = body as {
      id: string;
      message: string;
      fcmToken: string;
    };

    notificationId = id;

    if (!message || !fcmToken) {
      console.error("Missing required fields:", {
        message: !!message,
        fcmToken: !!fcmToken,
      });
      return NextResponse.json(
        { error: "Missing message or FCM token" },
        { status: 400 }
      );
    }

    const notification = buildNotification("PWA Demo", message);

    const messagePayload = {
      notification: {
        title: notification.title,
        body: notification.body,
        imageUrl: notification.image,
      },
      data: {
        ...notification.data,
        icon: notification.icon || "",
        badge: notification.badge || "",
      },
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

    console.log(
      `Sending FCM notification for scheduled notification ${notificationId}`
    );

    try {
      const response = await admin.messaging().send(messagePayload);
      console.log(`Successfully sent notification ${notificationId}`, response);
    } catch (pushError: any) {
      console.error("FCM send error:", pushError);
      if (pushError instanceof Error || pushError?.code) {
        console.error("Push error details:", {
          message: pushError.message,
          code: pushError.code,
        });
      }
      throw pushError; // Re-throw to be caught by outer catch
    }

    return NextResponse.json({
      success: true,
      id: notificationId,
      sentAt: Date.now(),
    });
  } catch (error: any) {
    console.error("Send scheduled notification error:", error);

    if (error instanceof Error || error?.code) {
      console.error("Error details:", {
        message: error.message,
        code: error.code,
        stack: error.stack,
      });

      // Don't throw for expired/invalid tokens - QStash will retry otherwise
      const errorCode = error.code || error.message;
      if (
        errorCode?.includes("invalid-registration-token") ||
        errorCode?.includes("registration-token-not-registered") ||
        errorCode?.includes("unregistered") ||
        errorCode?.includes("expired") ||
        errorCode?.includes("410") ||
        errorCode?.includes("404")
      ) {
        console.log(`FCM token expired/invalid for notification ${notificationId}`);
        return NextResponse.json(
          { error: "FCM token expired or invalid", id: notificationId },
          { status: 200 } // Return 200 so QStash doesn't retry
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to send notification", id: notificationId },
      { status: 500 }
    );
  }
}

// verifySignatureAppRouter automatically loads QSTASH_CURRENT_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY from env
// If signing keys are not set, it will throw an error, so we handle that case
export const POST = async (request: Request) => {
  try {
    // Check if signing keys are available
    if (
      process.env.QSTASH_CURRENT_SIGNING_KEY ||
      process.env.QSTASH_NEXT_SIGNING_KEY
    ) {
      return verifySignatureAppRouter(handler)(request);
    } else {
      console.warn(
        "QStash signing keys not set - skipping signature verification (not recommended for production)"
      );
      return handler(request);
    }
  } catch (error) {
    console.error("QStash signature verification failed:", error);
    return NextResponse.json(
      {
        error: "Signature verification failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 401 }
    );
  }
};
