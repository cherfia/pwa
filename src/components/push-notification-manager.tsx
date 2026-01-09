'use client';

import { useEffect, useState } from "react";
import {
  sendNotification,
  scheduleNotification,
  subscribeUser,
  unsubscribeUser,
} from "@/app/actions";
import { isIOS } from "react-device-detect";

type SerializedSubscription = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  expirationTime?: number | null;
};

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function arraysEqual(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function urlBase64ToUint8Array(base64String: string) {
  // Trim whitespace and newlines that might be in env vars
  const cleaned = base64String.trim().replace(/\s/g, "");
  const padding = "=".repeat((4 - (cleaned.length % 4)) % 4);
  const base64 = (cleaned + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = typeof window !== "undefined" ? window.atob(base64) : "";
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  
  if (outputArray.length !== 65 && outputArray.length !== 64) {
    console.warn(`VAPID key length is ${outputArray.length}, expected 65 bytes for Chrome compatibility`);
  }
  
  return outputArray;
}

export function PushNotificationManager() {
  const [isSupported, setIsSupported] = useState(false);
  const [subscription, setSubscription] = useState<SerializedSubscription | null>(null);
  const [message, setMessage] = useState("");
  const [delaySeconds, setDelaySeconds] = useState<number>(0);
  const [permission, setPermission] = useState<NotificationPermission | "default">("default");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setIsSupported(false);
      setError("Push not supported in this browser.");
      return;
    }

    setIsSupported(true);
    setPermission(Notification.permission);

    const loadSubscription = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();
        if (sub) {
          const serialized = JSON.parse(JSON.stringify(sub)) as SerializedSubscription;
          setSubscription(serialized);
        }
      } catch (error) {
        console.warn("Failed to load subscription:", error);
        setError("Service worker not ready. Ensure HTTPS is enabled and the service worker is registered.");
      }
    };

    void loadSubscription();
  }, []);

  const subscribe = async () => {
    setError(null);
    setStatus(null);
    setIsLoading(true);

    try {
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);

      if (permissionResult !== "granted") {
        setError("Notification permission not granted.");
        setIsLoading(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      
      if (!vapidPublicKey) {
        throw new Error("VAPID public key is not available");
      }
      
      // Chrome may have a cached failed subscription - try to get existing first
      let existingSub = await registration.pushManager.getSubscription();
      if (existingSub) {
        // Check if existing subscription uses the same key
        const existingKey = existingSub.options?.applicationServerKey;
        const newKey = urlBase64ToUint8Array(vapidPublicKey);
        
        // If keys don't match or subscription is invalid, unsubscribe first
        // Chrome caches failed subscriptions and needs them cleared
        if (existingKey) {
          const existingKeyArray = existingKey instanceof ArrayBuffer 
            ? new Uint8Array(existingKey) 
            : new Uint8Array(existingKey);
          if (!arraysEqual(existingKeyArray, newKey)) {
            await existingSub.unsubscribe();
            existingSub = null;
          }
        } else {
          // No key in existing sub, unsubscribe to clear Chrome's cache
          await existingSub.unsubscribe();
          existingSub = null;
        }
      }
      
      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
      const sub = existingSub || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      const serialized = JSON.parse(JSON.stringify(sub)) as SerializedSubscription;
      setSubscription(serialized);
      await subscribeUser(serialized);
      setStatus("✅ Subscribed to push notifications! You can now send test notifications.");
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
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      await sub?.unsubscribe();
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
        {isIOS
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
            Subscribed
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
          Click <strong>Subscribe</strong> to enable push notifications. You'll need to grant permission if prompted.
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

