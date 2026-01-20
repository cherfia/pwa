import { NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import webpush from "web-push";
import { buildNotification } from "@/lib/notification-helpers";

// VAPID keys for Web Push
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

// Initialize web-push with VAPID details
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

async function handler(request: Request) {
  let notificationId: string | undefined;
  try {
    console.log("QStash callback received at:", new Date().toISOString());

    const body = await request.json();
    console.log("Received body:", {
      id: body.id,
      hasMessage: !!body.message,
      hasSubscription: !!body.subscription,
    });

    const { id, message, subscription } = body as {
      id: string;
      message: string;
      subscription: PushSubscriptionJSON;
    };

    notificationId = id;

    if (!message || !subscription) {
      console.error("Missing required fields:", {
        message: !!message,
        subscription: !!subscription,
      });
      return NextResponse.json(
        { error: "Missing message or subscription" },
        { status: 400 }
      );
    }

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      console.error("VAPID keys not configured");
      return NextResponse.json(
        { error: "VAPID keys not configured" },
        { status: 500 }
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

    console.log(
      `Sending Web Push notification for scheduled notification ${notificationId}`
    );

    try {
      await webpush.sendNotification(
        subscription as webpush.PushSubscription,
        payload
      );
      console.log(`Successfully sent notification ${notificationId}`);
    } catch (pushError: any) {
      console.error("Web Push send error:", pushError);

      // Don't throw for expired/invalid subscriptions - QStash will retry otherwise
      if (pushError.statusCode === 410 || pushError.statusCode === 404) {
        console.log(
          `Subscription expired/invalid for notification ${notificationId}`
        );
        return NextResponse.json(
          { error: "Subscription expired or invalid", id: notificationId },
          { status: 200 } // Return 200 so QStash doesn't retry
        );
      }

      throw pushError;
    }

    return NextResponse.json({
      success: true,
      id: notificationId,
      sentAt: Date.now(),
    });
  } catch (error: any) {
    console.error("Send scheduled notification error:", error);

    return NextResponse.json(
      { error: "Failed to send notification", id: notificationId },
      { status: 500 }
    );
  }
}

// verifySignatureAppRouter automatically loads QSTASH_CURRENT_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY from env
export const POST = async (request: Request) => {
  try {
    if (
      process.env.QSTASH_CURRENT_SIGNING_KEY ||
      process.env.QSTASH_NEXT_SIGNING_KEY
    ) {
      return verifySignatureAppRouter(handler)(request);
    } else {
      console.warn(
        "QStash signing keys not set - skipping signature verification"
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
