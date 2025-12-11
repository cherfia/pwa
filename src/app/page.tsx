import { PushNotificationManager } from "@/components/push-notification-manager";
import { PWAInstallButton } from "@/components/pwa-install-button";

export default function Home() {
  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center gap-6 bg-zinc-50 px-6 py-16 font-sans text-zinc-900 dark:bg-black dark:text-zinc-50">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="rounded-full bg-black px-3 py-1 text-xs font-medium text-white dark:bg-white dark:text-black">
          PWA Demo
        </span>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          PWA + Push Playground
        </h1>
        <p className="max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
          Register the service worker (auto), subscribe to push, and send yourself a test notification.
        </p>
      </div>
      <PWAInstallButton />
      <PushNotificationManager />
    </main>
  );
}
