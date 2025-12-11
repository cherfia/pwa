'use client';

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        registration.update();
      } catch (error) {
        const err = error as Error;
        // SSL certificate errors will show here - user needs to accept cert or use mkcert
        if (err.message?.includes("SSL certificate") || err.message?.includes("certificate")) {
          console.warn(
            "Service worker registration failed due to SSL certificate. " +
            "Accept the self-signed certificate in your browser, or set up trusted certificates with mkcert."
          );
        } else {
          console.warn("Service worker registration failed", error);
        }
      }
    };

    register();
  }, []);

  return null;
}

