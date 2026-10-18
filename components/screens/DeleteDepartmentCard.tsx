"use client";
import { useState } from "react";
import { callApi } from "../../lib/ui/format";
import { cardClass, fieldClass } from "../../lib/ui/styles";
import { Callout } from "../ui/Callout";

// A danger-zone card that deletes the open department. The owner must type its name to confirm.
// After deleting, the page reloads and opens another department the person belongs to.
export function DeleteDepartmentCard({ departmentName }: { departmentName: string }) {
  const [typedName, setTypedName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // The button only works once the typed name matches the department's name, ignoring capitals.
  const nameMatches = typedName.trim().toLowerCase() === departmentName.trim().toLowerCase();

  // Deletes the department, then reloads so the page opens another one.
  const deleteDepartment = () => {
    setIsDeleting(true);
    setDeleteError(null);
    callApi<{ ok: boolean }>("/api/departments/remove", { confirmName: typedName })
      .then(() => window.location.reload())
      .catch((thrownError: Error) => {
        setDeleteError(thrownError.message);
        setIsDeleting(false);
      });
  };

  return (
    <div className={`${cardClass} space-y-3 border-rose-200 p-4`}>
      <p className='text-sm text-slate-600'>
        Deleting <span className='font-semibold text-slate-900'>{departmentName}</span> removes its
        employees, shifts, schedule, settings and access list for good. This can't be undone, so
        export its data first from Settings if you may need it.
      </p>
      <label className='block'>
        <span className='text-sm font-medium text-slate-700'>
          Type <span className='font-semibold'>{departmentName}</span> to confirm
        </span>
        <input
          className={`${fieldClass} mt-1`}
          type='text'
          value={typedName}
          onChange={(changeEvent) => setTypedName(changeEvent.target.value)}
        />
      </label>
      <button
        onClick={deleteDepartment}
        disabled={!nameMatches || isDeleting}
        className='inline-flex items-center justify-center rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40'
      >
        {isDeleting ? "Deleting…" : `Delete ${departmentName}`}
      </button>
      {deleteError && <Callout tone='warn'>{deleteError}</Callout>}
    </div>
  );
}
