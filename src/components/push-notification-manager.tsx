'use client';

import { useEffect, useState } from "react";
import { sendNotification, subscribeUser, unsubscribeUser } from "@/app/actions";

type SerializedSubscription = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  expirationTime?: number | null;
};

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = typeof window !== "undefined" ? window.atob(base64) : "";
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function PushNotificationManager() {
  const [isSupported, setIsSupported] = useState(false);
  const [subscription, setSubscription] = useState<SerializedSubscription | null>(null);
  const [message, setMessage] = useState("");
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
    if (!vapidPublicKey) {
      setError("Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY.");
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
        setError("Service worker not ready. Ensure you're using localhost for PWA features.");
      }
    };

    void loadSubscription();
  }, []);

  const subscribe = async () => {
    setError(null);
    setStatus(null);
    setIsLoading(true);

    if (!vapidPublicKey) {
      setError("Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY. Add it to your .env.local file and restart the dev server.");
      setIsLoading(false);
      return;
    }

    try {
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);

      if (permissionResult !== "granted") {
        setError("Notification permission not granted.");
        setIsLoading(false);
        return;
      }

      let registration;
      try {
        registration = await navigator.serviceWorker.ready;
      } catch (swError) {
        setError("Service worker not ready. Use localhost instead of IP address for PWA features.");
        setIsLoading(false);
        return;
      }

      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const serialized = JSON.parse(JSON.stringify(sub)) as SerializedSubscription;
      setSubscription(serialized);
      
      try {
        await subscribeUser(serialized);
        setStatus("✅ Subscribed to push notifications! You can now send test notifications.");
      } catch (serverError) {
        setError(`Failed to save subscription: ${serverError instanceof Error ? serverError.message : "Unknown error"}`);
        setSubscription(null);
      }
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
      await sendNotification(message.trim());
      setMessage("");
      setStatus("✅ Notification sent! Check your notifications.");
    } catch (error) {
      const err = error as Error;
      setError(`Failed to send notification: ${err.message || "Unknown error"}`);
      console.error("Send notification error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isSupported) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
        Push not supported in this browser.
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
          {isLoading ? "Sending..." : "Send Test"}
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

      {!vapidPublicKey && (
        <div className="text-sm text-amber-600 dark:text-amber-400">
          Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to enable push.
        </div>
      )}
    </div>
  );
}

