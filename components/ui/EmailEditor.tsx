"use client";
import { useState } from "react";
import { fieldClass, primaryButtonClass, secondaryButtonClass } from "../../lib/ui/styles";

// An Edit button that turns into an email field with Save and Cancel. Used on every list of people.
// onSave is given the new email and should return a promise. The editor closes when it resolves.
export function EmailEditor({
  value,
  onSave,
  disabled = false,
}: {
  value: string;
  onSave: (newEmail: string) => Promise<unknown>;
  disabled?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Opens the editor with the current email filled in.
  const startEditing = () => {
    setDraft(value);
    setSaveError(null);
    setIsEditing(true);
  };

  // Saves the new email, then closes the editor.
  const save = () => {
    setIsSaving(true);
    setSaveError(null);
    onSave(draft.trim())
      .then(() => setIsEditing(false))
      .catch((thrownError: Error) => setSaveError(thrownError.message))
      .finally(() => setIsSaving(false));
  };

  if (!isEditing)
    return (
      <button
        className='text-sm font-medium text-indigo-600 hover:underline disabled:opacity-40'
        onClick={startEditing}
        disabled={disabled}
      >
        Edit
      </button>
    );

  return (
    <div className='flex flex-wrap items-center gap-2'>
      <input
        className={`${fieldClass} w-64 py-1 text-sm`}
        type='email'
        value={draft}
        onChange={(changeEvent) => setDraft(changeEvent.target.value)}
      />
      <button
        className={`${primaryButtonClass} py-1 text-sm`}
        onClick={save}
        disabled={isSaving || !draft.trim()}
      >
        Save
      </button>
      <button
        className={`${secondaryButtonClass} py-1 text-sm`}
        onClick={() => setIsEditing(false)}
        disabled={isSaving}
      >
        Cancel
      </button>
      {saveError && <span className='w-full text-xs text-rose-600'>{saveError}</span>}
    </div>
  );
}
