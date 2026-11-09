"use client";
import { useEffect, useState, type ReactNode } from "react";

// Colors for the small badge beside a section title.
const BADGE_TONE_CLASSES = {
  ok: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warn: "bg-amber-50 text-amber-900 ring-amber-200",
  info: "bg-slate-100 text-slate-600 ring-slate-200",
};

// Prefix for the saved open/closed choices, so they don't clash with anything else in the browser.
const STORAGE_PREFIX = "ss_section_";

// Reads a saved open/closed choice from this browser.
// Returns true or false, or null when nothing is saved or storage is blocked (for example in a private window).
function readSavedOpenState(storageKey: string): boolean | null {
  try {
    const savedValue = window.localStorage.getItem(STORAGE_PREFIX + storageKey);
    return savedValue === null ? null : savedValue === "1";
  } catch {
    return null;
  }
}

// Saves an open/closed choice in this browser. Does nothing when storage is blocked. Returns nothing.
function saveOpenState(storageKey: string, isOpen: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + storageKey, isOpen ? "1" : "0");
  } catch {
    // Not being able to remember the choice is fine; the section still opens and closes.
  }
}

// A section with a title bar that opens and closes what is under it.
// The choice is remembered in this browser under storageKey, so a section someone closed stays closed.
// The badge (for example "3 to review") stays visible while closed, so nothing important is hidden silently.
export function CollapsibleSection({
  title,
  storageKey,
  badgeText,
  badgeTone = "info",
  defaultOpen = true,
  children,
}: {
  title: string;
  // Name the open/closed choice is saved under. Use a different one for each section.
  storageKey: string;
  badgeText?: string;
  badgeTone?: keyof typeof BADGE_TONE_CLASSES;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // The saved choice is read after the first render, because the browser's storage isn't there on the server.
  useEffect(() => {
    const savedOpenState = readSavedOpenState(storageKey);
    if (savedOpenState !== null) setIsOpen(savedOpenState);
  }, [storageKey]);

  // Opens or closes the section, and remembers the choice. Returns nothing.
  const toggleOpen = () => {
    setIsOpen((wasOpen) => {
      saveOpenState(storageKey, !wasOpen);
      return !wasOpen;
    });
  };

  const contentId = `section-${storageKey}`;
  return (
    <section className='mb-4'>
      <button
        type='button'
        onClick={toggleOpen}
        aria-expanded={isOpen}
        aria-controls={contentId}
        className='group flex w-full items-center gap-2 rounded-lg py-1.5 text-left'
      >
        <svg
          viewBox='0 0 20 20'
          fill='currentColor'
          aria-hidden='true'
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:text-slate-600 ${isOpen ? "rotate-90" : ""}`}
        >
          <path d='M7.2 4.7a1 1 0 0 1 1.4 0l4.6 4.6a1 1 0 0 1 0 1.4l-4.6 4.6a1 1 0 1 1-1.4-1.4L11.1 10 7.2 6.1a1 1 0 0 1 0-1.4Z' />
        </svg>
        <h2 className='text-sm font-semibold text-slate-700 group-hover:text-slate-900'>
          {title}
        </h2>
        {badgeText && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${BADGE_TONE_CLASSES[badgeTone]}`}
          >
            {badgeText}
          </span>
        )}
        <span className='ml-auto text-xs text-slate-400 group-hover:text-slate-600'>
          {isOpen ? "Hide" : "Show"}
        </span>
      </button>
      {isOpen && (
        <div id={contentId} className='mt-2'>
          {children}
        </div>
      )}
    </section>
  );
}
