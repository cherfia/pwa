'use client';

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Service workers require HTTPS with trusted certs or localhost
    // Skip registration on IP addresses to avoid SSL cert errors
    const hostname = typeof window !== "undefined" ? window.location.hostname : "";
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      console.info(
        "Service worker skipped: Use localhost for PWA features, or set up trusted certificates with mkcert."
      );
      return;
    }

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        registration.update();
      } catch (error) {
        console.warn("Service worker registration failed", error);
      }
    };

    register();
  }, []);

  return null;
}

