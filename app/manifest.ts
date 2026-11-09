import type { MetadataRoute } from "next";

// The web app manifest, served at /manifest.webmanifest. It lets phones and computers install the app
// with its own icon and open it in its own window without the browser's address bar.
// Returns the manifest's settings: names, start page, colors and icons.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Shift Scheduler",
    short_name: "Shifts",
    description: "Build, check and publish the weekly department schedule.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // White matches the app's top bar; the light grey matches the page behind it while it loads.
    theme_color: "#ffffff",
    background_color: "#f8fafc",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android crops icons into its own shapes, so this one fills the square and keeps the letter in the middle.
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
