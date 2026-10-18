"use client";
import { useEffect, useState } from "react";
import { callApi } from "../../lib/ui/format";
import { cardClass, fieldClass, primaryButtonClass } from "../../lib/ui/styles";
import { EmailEditor } from "../ui/EmailEditor";
import { Callout } from "../ui/Callout";

// One company admin.
interface CompanyAdmin {
  email: string;
}

// The company admins: people who can see and change every store. Only company admins see this card,
// and only they can add, edit, or remove admins. The last admin cannot be removed, and nobody can change
// their own admin email here.
export function CompanyAdminsCard({ currentEmail }: { currentEmail: string }) {
  const [admins, setAdmins] = useState<CompanyAdmin[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [isChanging, setIsChanging] = useState(false);

  // Loads the list of admins.
  const loadAdmins = () => {
    fetch("/api/admins")
      .then((response) => response.json())
      .then((body: { admins?: CompanyAdmin[]; error?: string }) => {
        if (body.error) throw new Error(body.error);
        setAdmins(body.admins ?? []);
        setLoadError(null);
      })
      .catch((thrownError: Error) => setLoadError(thrownError.message));
  };

  useEffect(loadAdmins, []);

  // Sends an add, edit, or remove request, then shows the updated list. Returns a promise so the editor can close.
  const changeAdmins = (body: { action: string; email: string; newEmail?: string }) => {
    setIsChanging(true);
    setChangeError(null);
    return callApi<{ admins: CompanyAdmin[] }>("/api/admins", body)
      .then((reply) => {
        setAdmins(reply.admins);
        setNewEmail("");
      })
      .catch((thrownError: Error) => {
        setChangeError(thrownError.message);
        throw thrownError;
      })
      .finally(() => setIsChanging(false));
  };

  return (
    <div className={`${cardClass} space-y-3 p-4`}>
      <p className='text-sm text-slate-600'>
        Company admins can see and change every store, create stores, and assign store managers.
      </p>
      {loadError && <Callout tone='warn'>{loadError}</Callout>}
      <div className='flex flex-col gap-3 sm:flex-row sm:items-end'>
        <label className='block flex-1'>
          <span className='text-sm font-medium text-slate-700'>Email</span>
          <input
            className={`${fieldClass} mt-1`}
            type='email'
            placeholder='admin@detwilermarket.com'
            value={newEmail}
            onChange={(changeEvent) => setNewEmail(changeEvent.target.value)}
          />
        </label>
        <button
          className={primaryButtonClass}
          onClick={() => changeAdmins({ action: "add", email: newEmail }).catch(() => undefined)}
          disabled={isChanging || !newEmail.trim()}
        >
          Add company admin
        </button>
      </div>
      {changeError && <Callout tone='warn'>{changeError}</Callout>}
      <ul className='divide-y divide-slate-100'>
        {admins.map((admin) => {
          const isYou = admin.email.toLowerCase() === currentEmail.toLowerCase();
          return (
            <li key={admin.email} className='flex flex-wrap items-center justify-between gap-3 py-2 text-sm'>
              <span className='text-slate-900'>
                {admin.email}
                {isYou && <span className='ml-2 text-xs text-slate-500'>(you)</span>}
              </span>
              <div className='flex items-center gap-3'>
                <EmailEditor
                  value={admin.email}
                  disabled={isYou || isChanging}
                  onSave={(editedEmail) =>
                    changeAdmins({ action: "update", email: admin.email, newEmail: editedEmail })
                  }
                />
                <button
                  className='rounded-lg px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50'
                  onClick={() => {
                    if (window.confirm(`Remove ${admin.email} as a company admin?`))
                      changeAdmins({ action: "remove", email: admin.email }).catch(() => undefined);
                  }}
                  disabled={isChanging || admins.length <= 1}
                >
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
