import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ServiceWorkerRegistration } from "../components/ServiceWorkerRegistration";

// Page title, icons, and the settings that let the app be installed on a phone's home screen.
// The manifest link is added by Next.js from app/manifest.ts.
export const metadata: Metadata = {
  title: "Shift Scheduler",
  icons: {
    icon: "/icons/favicon-32.png",
    apple: "/icons/apple-touch-icon.png",
  },
  // iPhones read these instead of the manifest when the app is added to the home screen.
  appleWebApp: {
    capable: true,
    title: "Shifts",
    statusBarStyle: "default",
  },
};

// Colors the phone's status bar to match the app's top bar: white in light mode, the dark card color in dark mode.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
  colorScheme: "light dark",
};

// The outer frame of every page: the HTML document and its body styling.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang='en'>
      <body className='min-h-screen bg-slate-50 font-sans text-slate-900 antialiased'>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
