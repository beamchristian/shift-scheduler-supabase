"use client";
import { useState } from "react";
import { callApi } from "../../lib/ui/format";
import { cardClass, fieldClass, primaryButtonClass } from "../../lib/ui/styles";
import { Callout } from "../ui/Callout";

// A form to change a store's or department's name. The page reloads afterwards so the new name shows everywhere.
export function RenameCard({
  currentName,
  fieldLabel,
  endpoint,
  description,
}: {
  currentName: string;
  fieldLabel: string;
  endpoint: string;
  description: string;
}) {
  const [newName, setNewName] = useState(currentName);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Saves the new name, then reloads.
  const rename = () => {
    setIsSaving(true);
    setSaveError(null);
    callApi(endpoint, { name: newName })
      .then(() => window.location.reload())
      .catch((thrownError: Error) => {
        setSaveError(thrownError.message);
        setIsSaving(false);
      });
  };

  return (
    <div className={`${cardClass} space-y-3 p-4`}>
      <p className='text-sm text-slate-600'>{description}</p>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-end'>
        <label className='block flex-1'>
          <span className='text-sm font-medium text-slate-700'>
            {fieldLabel}
          </span>
          <input
            className={`${fieldClass} mt-1`}
            type='text'
            maxLength={40}
            value={newName}
            onChange={(changeEvent) => setNewName(changeEvent.target.value)}
          />
        </label>
        <button
          className={primaryButtonClass}
          onClick={rename}
          disabled={
            isSaving || !newName.trim() || newName.trim() === currentName
          }
        >
          {isSaving ? "Saving…" : "Save name"}
        </button>
      </div>
      {saveError && <Callout tone='warn'>{saveError}</Callout>}
    </div>
  );
}
