"use client";
import { useState } from "react";
import { callApi } from "../../lib/ui/format";
import { cardClass, fieldClass, primaryButtonClass } from "../../lib/ui/styles";
import { Callout } from "../ui/Callout";

// A form to create a new store, for company admins. The store starts with the seven standard departments
// and the store managers you name here. Then the page reloads on the store's first department.
export function CreateStoreCard() {
  const [storeName, setStoreName] = useState("");
  const [managerEmails, setManagerEmails] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Creates the store, then reloads so the page opens its first department.
  const createStore = () => {
    setIsCreating(true);
    setCreateError(null);
    callApi<{ ok: boolean; departmentId: number }>("/api/stores", {
      name: storeName,
      managerEmails,
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
        A new store starts with its own Deli, Seafood, Grocery, Bakery, Butcher,
        Cafe and Produce departments, each with standard store hours and an
        empty team and schedule. Store managers are owners of every department
        in the store, so they can add people and change access.
      </p>
      <label className='block'>
        <span className='text-sm font-medium text-slate-700'>Store name</span>
        <input
          className={`${fieldClass} mt-1`}
          type='text'
          maxLength={40}
          placeholder='Store 2'
          value={storeName}
          onChange={(changeEvent) => setStoreName(changeEvent.target.value)}
        />
      </label>
      <label className='block'>
        <span className='text-sm font-medium text-slate-700'>
          Store manager emails
        </span>
        <textarea
          className={`${fieldClass} mt-1`}
          rows={2}
          placeholder='manager@example.com, second@example.com'
          value={managerEmails}
          onChange={(changeEvent) => setManagerEmails(changeEvent.target.value)}
        />
        <span className='mt-1 block text-xs text-slate-500'>
          Separate several with commas. They sign in with these emails.
        </span>
      </label>
      <div className='flex justify-end'>
        <button
          className={primaryButtonClass}
          onClick={createStore}
          disabled={isCreating || !storeName.trim() || !managerEmails.trim()}
        >
          {isCreating ? "Creating…" : "Create store"}
        </button>
      </div>
      {createError && <Callout tone='warn'>{createError}</Callout>}
    </div>
  );
}
