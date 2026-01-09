import { NextResponse } from "next/server";
import {
  getDueNotifications,
  removeScheduledNotification,
} from "@/lib/notification-storage";
import webPush from "web-push";

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

// Optional: Add authentication to prevent unauthorized access
// For production, use a secret token or API key
// In development, this can be left unset to allow local testing
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: Request) {
  // Optional: Verify cron secret (only if set)
  // This allows local development without needing to set CRON_SECRET
  if (CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    ensureVapid();

    const dueNotifications = await getDueNotifications();
    const results = [];

    for (const notification of dueNotifications) {
      try {
        const payload = JSON.stringify({
          title: "PWA Demo",
          body: notification.message,
          icon: "/android/android-launchericon-192-192.png",
          badge: "/android/android-launchericon-72-72.png",
        });

        await webPush.sendNotification(notification.subscription, payload);
        await removeScheduledNotification(notification.id);
        results.push({ id: notification.id, status: "sent" });
      } catch (error) {
        console.error(`Failed to send notification ${notification.id}:`, error);
        // Remove failed notifications (e.g., expired subscriptions)
        if (
          error instanceof Error &&
          (error.message.includes("expired") ||
            error.message.includes("410") ||
            error.message.includes("404"))
        ) {
          await removeScheduledNotification(notification.id);
          results.push({
            id: notification.id,
            status: "failed",
            error: "expired",
          });
        } else {
          results.push({
            id: notification.id,
            status: "failed",
            error: "unknown",
          });
        }
      }
    }

    return NextResponse.json({
      processed: dueNotifications.length,
      results,
    });
  } catch (error) {
    console.error("Cron job error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
