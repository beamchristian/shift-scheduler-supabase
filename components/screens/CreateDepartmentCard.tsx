"use client";
import { useState } from "react";
import { callApi } from "../../lib/ui/format";
import { cardClass, fieldClass, primaryButtonClass } from "../../lib/ui/styles";
import { Callout } from "../ui/Callout";

// A form to create a new department. Owners only. The new department opens as soon as it is created.
export function CreateDepartmentCard() {
  const [departmentName, setDepartmentName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Creates the department, then reloads so the page opens it.
  const createDepartment = () => {
    setIsCreating(true);
    setCreateError(null);
    callApi<{ ok: boolean; departmentId: number }>("/api/departments", {
      name: departmentName,
    })
      .then(() => window.location.reload())
      .catch((thrownError: Error) => {
        setCreateError(thrownError.message);
        setIsCreating(false);
      });
  };

  return (
    <div className={`${cardClass} space-y-3 p-4`}>
      <p className='text-sm text-slate-600'>
        The new department starts with standard day weights and an empty team
        and schedule. You become its owner, and you can add other people on the
        Access list once it opens.
      </p>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-end'>
        <label className='block flex-1'>
          <span className='text-sm font-medium text-slate-700'>
            Department name
          </span>
          <input
            className={`${fieldClass} mt-1`}
            type='text'
            maxLength={40}
            placeholder='Floral'
            value={departmentName}
            onChange={(changeEvent) =>
              setDepartmentName(changeEvent.target.value)
            }
          />
        </label>
        <button
          className={primaryButtonClass}
          onClick={createDepartment}
          disabled={isCreating || !departmentName.trim()}
        >
          {isCreating ? "Creating…" : "Create department"}
        </button>
      </div>
      {createError && <Callout tone='warn'>{createError}</Callout>}
    </div>
  );
}
