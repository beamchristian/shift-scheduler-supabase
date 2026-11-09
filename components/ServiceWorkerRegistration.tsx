"use client";
import { useEffect } from "react";

// Registers the service worker in public/sw.js once the page has loaded. It shows nothing.
// Only in production: in development it would keep old build files around and get in the way of live reload.
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((registrationError) =>
        console.warn("Service worker could not be registered.", registrationError),
      );
  }, []);
  return null;
}
