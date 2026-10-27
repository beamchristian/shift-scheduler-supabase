import type { ReactNode } from "react";

// Background and text colors for each kind of message box.
const CALLOUT_TONE_CLASSES = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warn: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-slate-200 bg-slate-50 text-slate-700",
};

// A message box. The tone (ok, warn or info) sets its colors.
export function Callout({
  tone,
  children,
}: {
  tone: keyof typeof CALLOUT_TONE_CLASSES;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm leading-relaxed ${CALLOUT_TONE_CLASSES[tone]}`}
    >
      {children}
    </div>
  );
}
