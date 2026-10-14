import './globals.css';
import type { ReactNode } from 'react';

export const metadata = { title: 'Shift Scheduler' };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">{children}</body>
    </html>
  );
}
