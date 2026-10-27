import "./globals.css";
import type { ReactNode } from "react";

// Page title shown in the browser tab.
export const metadata = { title: "Shift Scheduler" };

// The outer frame of every page: the HTML document and its body styling.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang='en'>
      <body className='min-h-screen bg-slate-50 font-sans text-slate-900 antialiased'>
        {children}
      </body>
    </html>
  );
}
