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
      subscriptionKeys: body.subscription
        ? Object.keys(body.subscription)
        : null,
      subscriptionEndpoint: body.subscription?.endpoint
        ? body.subscription.endpoint.substring(0, 50) + "..."
        : null,
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

    // Validate subscription structure
    if (
      !subscription.endpoint ||
      !subscription.keys ||
      !subscription.keys.p256dh ||
      !subscription.keys.auth
    ) {
      console.error("Invalid subscription structure:", {
        hasEndpoint: !!subscription.endpoint,
        hasKeys: !!subscription.keys,
        hasP256dh: !!subscription.keys?.p256dh,
        hasAuth: !!subscription.keys?.auth,
      });
      return NextResponse.json(
        { error: "Invalid subscription structure" },
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
    console.log("Subscription details:", {
      endpoint: subscription.endpoint?.substring(0, 50) + "...",
      hasKeys: !!subscription.keys,
    });

    try {
      // iOS Safari requires Urgency header
      await webPush.sendNotification(subscription, payload, {
        headers: {
          Urgency: "normal",
        },
      });
      console.log(`Successfully sent notification ${notificationId}`);
    } catch (pushError) {
      console.error("webPush.sendNotification error:", pushError);
      if (pushError instanceof Error) {
        console.error("Push error details:", {
          message: pushError.message,
          name: pushError.name,
          code: (pushError as any).statusCode,
        });
      }
      throw pushError; // Re-throw to be caught by outer catch
    }

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
