import type { ReactNode } from "react";
import type { Tab } from "../types";

// The icon drawn for each screen.
const TAB_ICONS: Record<Tab, ReactNode> = {
  Access: (
    <>
      <path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' />
    </>
  ),
  Schedule: (
    <>
      <rect x='3' y='4' width='18' height='18' rx='2' />
      <path d='M16 2v4M8 2v4M3 10h18' />
    </>
  ),
  Team: (
    <>
      <path d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' />
      <circle cx='9' cy='7' r='4' />
      <path d='M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' />
    </>
  ),
  Availability: (
    <>
      <circle cx='12' cy='12' r='10' />
      <path d='M12 6v6l4 2' />
    </>
  ),
  Shifts: <path d='M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' />,
  Settings: (
    <path d='M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6' />
  ),
  "Store overview": (
    <path d='M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' />
  ),
};

// Draws the icon for one screen.
export function TabIcon({ tab }: { tab: Tab }) {
  return (
    <svg
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
      className='h-5 w-5'
    >
      {TAB_ICONS[tab]}
    </svg>
  );
}
