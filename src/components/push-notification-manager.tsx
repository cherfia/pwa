'use client';

import { useEffect, useState } from "react";
import {
  sendNotification,
  scheduleNotification,
  subscribeUser,
  unsubscribeUser,
  type PushSubscription,
} from "@/app/actions";
import { getFCMToken, onForegroundMessage } from "@/lib/firebase";

// Convert VAPID key from base64 to Uint8Array for Web Push
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray as Uint8Array<ArrayBuffer>;
}

export function PushNotificationManager() {
  const [isSupported, setIsSupported] = useState(false);
  const [isIOSDevice, setIsIOSDevice] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [message, setMessage] = useState("");
  const [delaySeconds, setDelaySeconds] = useState<number>(0);
  const [permission, setPermission] = useState<NotificationPermission | "default">("default");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Detect iOS safely at runtime
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOSDevice(iOS);

    // Check if Notification API exists (not available on iOS Safari unless installed as PWA)
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);
    setPermission(Notification.permission);

    // Listen for foreground messages (only for non-iOS with Firebase)
    let unsubscribe: (() => void) | undefined;
    try {
      if (!iOS && process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
        unsubscribe = onForegroundMessage((payload) => {
          console.log("Foreground message received:", payload);
          setStatus(`📨 Message received: ${payload.notification?.title || payload.data?.title || "New notification"}`);
        });
      }
    } catch (error) {
      console.warn("Failed to set up foreground message listener:", error);
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  // Get Web Push subscription (for iOS)
  const getWebPushSubscription = async (): Promise<PushSubscription> => {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      throw new Error("VAPID key not configured. Contact the administrator.");
    }

    const registration = await navigator.serviceWorker.ready;
    let webPushSub = await registration.pushManager.getSubscription();

    if (!webPushSub) {
      webPushSub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }

    return {
      type: 'webpush',
      subscription: webPushSub.toJSON() as PushSubscriptionJSON,
    };
  };

  const subscribe = async () => {
    setError(null);
    setStatus(null);
    setIsLoading(true);

    try {
      if (!("Notification" in window)) {
        throw new Error("Notifications not supported. On iOS, add this app to your home screen first.");
      }
      
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);

      if (permissionResult !== "granted") {
        setError("Notification permission not granted.");
        setIsLoading(false);
        return;
      }

      let sub: PushSubscription;

      if (isIOSDevice) {
        // iOS: Use standard Web Push API (FCM doesn't work on iOS)
        sub = await getWebPushSubscription();
      } else {
        // Android/Desktop: Try FCM first, fallback to Web Push
        const token = await getFCMToken();
        if (token) {
          sub = { type: 'fcm', token };
        } else {
          console.warn("FCM failed, falling back to Web Push");
          sub = await getWebPushSubscription();
        }
      }

      setSubscription(sub);
      await subscribeUser(sub);
      setStatus(`✅ Subscribed via ${sub.type === 'fcm' ? 'FCM' : 'Web Push'}! You can now send test notifications.`);
    } catch (error) {
      const err = error as Error;
      setError(`Subscription failed: ${err.message || "Unknown error"}`);
      console.error("Subscribe error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const unsubscribe = async () => {
    setError(null);
    setStatus(null);
    setIsLoading(true);
    try {
      // Unsubscribe from Web Push if applicable
      if (subscription?.type === 'webpush') {
        const registration = await navigator.serviceWorker.ready;
        const webPushSub = await registration.pushManager.getSubscription();
        if (webPushSub) {
          await webPushSub.unsubscribe();
        }
      }
      setSubscription(null);
      await unsubscribeUser();
      setStatus("Unsubscribed.");
    } catch (error) {
      setError(`Unsubscribe failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  };

  const send = async () => {
    setError(null);
    setStatus(null);
    
    if (!subscription) {
      setError("Please subscribe first by clicking the Subscribe button.");
      return;
    }
    if (!message.trim()) {
      setError("Message cannot be empty.");
      return;
    }
    
    setIsLoading(true);
    try {
      const messageToSend = message.trim();
      
      if (delaySeconds > 0) {
        // Schedule the notification on the server
        const result = await scheduleNotification(
          messageToSend,
          delaySeconds,
          subscription
        );
        
        if ("scheduledFor" in result && result.scheduledFor) {
          const scheduledDate = new Date(result.scheduledFor);
          const timeString = scheduledDate.toLocaleTimeString();
          setMessage("");
          setStatus(
            `⏰ Notification scheduled for ${timeString} (in ${delaySeconds} second${delaySeconds !== 1 ? 's' : ''}). It will be sent even if you close the app.`
          );
        } else {
          setMessage("");
          setStatus("✅ Notification scheduled successfully.");
        }
      } else {
        // Send immediately
        await sendNotification(messageToSend, subscription);
        setMessage("");
        setStatus("✅ Notification sent! Check your notifications.");
      }
    } catch (error) {
      const err = error as Error;
      setError(`Failed to ${delaySeconds > 0 ? 'schedule' : 'send'} notification: ${err.message || "Unknown error"}`);
      console.error("Send notification error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isSupported) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
        {isIOSDevice
          ? 'To enable Web Push on iOS 16.4+ devices, you have to "Add to Home Screen" first (in "Share" icon menu) and then open the app from the home screen.'
          : 'Push not supported in this browser.'}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-xl flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Push Notifications</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Permission: {permission}
          </p>
        </div>
        {subscription ? (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100">
            {subscription.type === 'fcm' ? 'FCM' : 'Web Push'}
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-100">
            Not Subscribed
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-zinc-800 dark:text-zinc-100">Message</label>
        <input
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-600 dark:focus:ring-zinc-800"
          placeholder="Enter notification text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
          Schedule delay (seconds)
        </label>
        <input
          type="number"
          min="0"
          step="1"
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-600 dark:focus:ring-zinc-800"
          placeholder="0 = send immediately"
          value={delaySeconds || ""}
          onChange={(e) => setDelaySeconds(Math.max(0, parseInt(e.target.value) || 0))}
        />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Set to 0 to send immediately, or enter seconds to schedule
        </p>
      </div>

      {!subscription && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/60 dark:text-amber-100">
          Click <strong>Subscribe</strong> to enable push notifications.
          {isIOSDevice && " (iOS uses Web Push, not FCM)"}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          onClick={subscribe}
          disabled={!!subscription || isLoading}
        >
          {isLoading ? "Subscribing..." : "Subscribe"}
        </button>
        <button
          className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
          onClick={unsubscribe}
          disabled={!subscription || isLoading}
        >
          {isLoading ? "Unsubscribing..." : "Unsubscribe"}
        </button>
        <button
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={send}
          disabled={!subscription || isLoading || !message.trim()}
        >
          {isLoading
            ? delaySeconds > 0
              ? "Scheduling..."
              : "Sending..."
            : delaySeconds > 0
            ? "Schedule"
            : "Send Test"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/60 dark:text-rose-100">
          {error}
        </div>
      )}

      {status && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-100">
          {status}
        </div>
      )}
    </div>
  );
}

