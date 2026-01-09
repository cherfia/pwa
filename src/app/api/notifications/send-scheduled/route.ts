import { NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
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
const VAPID_CONTACT =
  process.env.VAPID_CONTACT_EMAIL ?? "mailto:admin@pwa-demo.local";

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return;
  webPush.setVapidDetails(VAPID_CONTACT, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
  vapidConfigured = true;
}

async function handler(request: Request) {
  let notificationId: string | undefined;
  try {
    console.log("QStash callback received at:", new Date().toISOString());

    ensureVapid();

    const body = await request.json();
    console.log("Received body:", {
      id: body.id,
      hasMessage: !!body.message,
      hasSubscription: !!body.subscription,
    });

    const { id, message, subscription } = body as {
      id: string;
      message: string;
      subscription: SerializedSubscription;
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

    const payload = JSON.stringify({
      title: "PWA Demo",
      body: message,
      icon: "/android/android-launchericon-192-192.png",
      badge: "/android/android-launchericon-72-72.png",
    });

    console.log(
      `Sending push notification for scheduled notification ${notificationId}`
    );
    await webPush.sendNotification(subscription, payload);
    console.log(`Successfully sent notification ${notificationId}`);

    return NextResponse.json({
      success: true,
      id: notificationId,
      sentAt: Date.now(),
    });
  } catch (error) {
    console.error("Send scheduled notification error:", error);

    if (error instanceof Error) {
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
      });

      // Don't throw for expired subscriptions - QStash will retry otherwise
      if (
        error.message.includes("expired") ||
        error.message.includes("410") ||
        error.message.includes("404")
      ) {
        console.log(`Subscription expired for notification ${notificationId}`);
        return NextResponse.json(
          { error: "Subscription expired", id: notificationId },
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
export const POST = verifySignatureAppRouter(handler);
