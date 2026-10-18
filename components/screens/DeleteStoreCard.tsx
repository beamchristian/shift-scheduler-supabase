"use client";
import { useState } from "react";
import { callApi } from "../../lib/ui/format";
import { cardClass, fieldClass } from "../../lib/ui/styles";
import { Callout } from "../ui/Callout";

// Deletes the store the person is working in. Company admins only. It takes three checks before the
// Delete button turns on: typing the store name, ticking the box, and a second confirmation in the dialog.
// The server checks the name, the box, and that another store remains.
export function DeleteStoreCard({ storeName }: { storeName: string }) {
  const [typedName, setTypedName] = useState("");
  const [isAcknowledged, setIsAcknowledged] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const nameMatches = typedName.trim().toLowerCase() === storeName.trim().toLowerCase();
  const canDelete = nameMatches && isAcknowledged && !isDeleting;

  // Asks for a final confirmation, then deletes the store and reloads on another store.
  const deleteStore = () => {
    if (
      !window.confirm(
        `Delete ${storeName} permanently? Every department, team member, schedule, and setting in it will be lost. This cannot be undone.`,
      )
    )
      return;
    setIsDeleting(true);
    setDeleteError(null);
    callApi("/api/stores/remove", { confirmName: typedName, acknowledged: isAcknowledged })
      .then(() => window.location.reload())
      .catch((thrownError: Error) => {
        setDeleteError(thrownError.message);
        setIsDeleting(false);
      });
  };

  return (
    <div className={`${cardClass} space-y-3 border-rose-200 p-4`}>
      <Callout tone='warn'>
        Deleting {storeName} removes all of its departments, store managers, team members, schedules,
        shift templates, settings, store hours, and change history. This cannot be undone.
      </Callout>
      <label className='block'>
        <span className='text-sm font-medium text-slate-700'>
          Type <strong>{storeName}</strong> to confirm
        </span>
        <input
          className={`${fieldClass} mt-1`}
          type='text'
          value={typedName}
          onChange={(changeEvent) => setTypedName(changeEvent.target.value)}
        />
      </label>
      <label className='flex items-start gap-2 text-sm text-slate-700'>
        <input
          type='checkbox'
          className='mt-0.5'
          checked={isAcknowledged}
          onChange={(changeEvent) => setIsAcknowledged(changeEvent.target.checked)}
        />
        <span>I understand this store and everything in it will be permanently deleted.</span>
      </label>
      <div className='flex justify-end'>
        <button
          className='rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40'
          onClick={deleteStore}
          disabled={!canDelete}
        >
          {isDeleting ? "Deleting…" : "Delete store"}
        </button>
      </div>
      {deleteError && <Callout tone='warn'>{deleteError}</Callout>}
    </div>
  );
}
