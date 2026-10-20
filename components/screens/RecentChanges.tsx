"use client";
import { useEffect, useState } from "react";
import type { AuditEntry } from "../../lib/audit";
import { callApi, formatTimestamp } from "../../lib/ui/format";
import { cardClass } from "../../lib/ui/styles";
import { Callout } from "../ui/Callout";

// The list of recent changes: schedule generations, closer swaps, and backup imports.
// It loads each time the Settings screen opens.
export function RecentChanges() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    callApi<{ entries: AuditEntry[] }>("/api/audit")
      .then((auditReply) => setEntries(auditReply.entries))
      .catch((thrownError: Error) => setLoadError(thrownError.message));
  }, []);

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
    <div className={`${cardClass} overflow-hidden`}>
      <ul className='divide-y divide-slate-100'>
        {entries.map((entry) => (
          <li key={entry.id} className='px-4 py-2.5'>
            <div className='text-sm font-medium text-slate-900'>
              {entry.action}
              {entry.detail && (
                <span className='font-normal text-slate-600'>
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
