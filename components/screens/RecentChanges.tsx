"use client";
import { useEffect, useState } from "react";
import type { AuditEntry } from "../../lib/audit";
import { callApi, formatTimestamp } from "../../lib/ui/format";
import { cardClass } from "../../lib/ui/styles";
import { Callout } from "../ui/Callout";

// Readable names for actions saved by older versions of the app, so old lines read like new ones.
const OLDER_ACTION_NAMES: Record<string, string> = {
  access_added: "Added department manager",
  access_changed: "Changed department manager",
  access_removed: "Removed department manager",
};

// The action as it should read on screen.
function readableAction(action: string): string {
  return OLDER_ACTION_NAMES[action] ?? action;
}

// The list of recent changes in the department: who changed what, and when, newest first.
// It loads when the Settings screen opens, and again whenever reloadSignal changes
// (the page passes its data, which changes after every save), so a change shows up right away.
export function RecentChanges({ reloadSignal }: { reloadSignal?: unknown }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    callApi<{ entries: AuditEntry[] }>("/api/audit")
      .then((auditReply) => {
        setEntries(auditReply.entries);
        setLoadError(null);
      })
      .catch((thrownError: Error) => setLoadError(thrownError.message));
  }, [reloadSignal]);

  if (loadError) return <Callout tone='warn'>{loadError}</Callout>;

  if (entries === null)
    return (
      <div className={`${cardClass} p-4 text-sm text-slate-500`}>Loading…</div>
    );

  if (entries.length === 0)
    return (
      <div className={`${cardClass} p-4 text-sm text-slate-500`}>
        No changes yet.
      </div>
    );

  return (
    // The list scrolls inside its own box, about eight changes tall, so the page stays short.
    <div className={`${cardClass} max-h-96 overflow-y-auto overscroll-contain`}>
      <ul className='divide-y divide-slate-100'>
        {entries.map((entry) => (
          <li key={entry.id} className='px-4 py-2.5'>
            <div className='text-sm font-medium text-slate-900'>
              {readableAction(entry.action)}
              {entry.detail && (
                <span className='break-words font-normal text-slate-600'>
                  {" "}
                  · {entry.detail}
                </span>
              )}
            </div>
            <div className='text-xs text-slate-500'>
              {formatTimestamp(entry.created_at)} · {entry.email ?? "Unknown"}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
