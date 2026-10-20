"use client";
import { useEffect, useState } from "react";
import { callApi } from "../../lib/ui/format";
import { cardClass, fieldClass, primaryButtonClass } from "../../lib/ui/styles";
import { Callout } from "../ui/Callout";
import { EmailEditor } from "../ui/EmailEditor";

// One store manager of the active store.
interface StoreManager {
  id: number;
  email: string;
}

// The store managers of the store the person is working in. Store managers can manage every department in
// the store. Only company admins can add, edit, or remove them; store managers see the list read-only.
export function StoreManagersCard() {
  const [storeName, setStoreName] = useState("");
  const [storeManagers, setStoreManagers] = useState<StoreManager[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [isChanging, setIsChanging] = useState(false);

  // Loads the list when the card opens.
  const loadStoreManagers = () => {
    fetch("/api/store-managers")
      .then((response) => response.json())
      .then(
        (body: {
          storeName?: string;
          storeManagers?: StoreManager[];
          canManage?: boolean;
          error?: string;
        }) => {
          if (body.error) throw new Error(body.error);
          setStoreName(body.storeName ?? "");
          setStoreManagers(body.storeManagers ?? []);
          setCanManage(Boolean(body.canManage));
          setLoadError(null);
        },
      )
      .catch((thrownError: Error) => setLoadError(thrownError.message));
  };

  useEffect(loadStoreManagers, []);

  // Sends an add, edit, or remove request, then reloads the list. Returns a promise so the editor can close.
  const changeStoreManagers = (body: Record<string, unknown>) => {
    setIsChanging(true);
    setChangeError(null);
    return callApi("/api/store-managers", body)
      .then(() => {
        setNewEmail("");
        loadStoreManagers();
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
        {storeName ? `Store managers for ${storeName}. ` : ""}
        Store managers can manage every department in the store, including who
        has access to them. Only company admins can add, edit, or remove store
        managers.
      </p>
      {loadError && <Callout tone='warn'>{loadError}</Callout>}
      {canManage && (
        <div className='flex flex-col gap-3 sm:flex-row sm:items-end'>
          <label className='block flex-1'>
            <span className='text-sm font-medium text-slate-700'>Email</span>
            <input
              className={`${fieldClass} mt-1`}
              type='email'
              placeholder='manager@example.com'
              value={newEmail}
              onChange={(changeEvent) => setNewEmail(changeEvent.target.value)}
            />
          </label>
          <button
            className={primaryButtonClass}
            onClick={() =>
              changeStoreManagers({ action: "add", email: newEmail }).catch(
                () => undefined,
              )
            }
            disabled={isChanging || !newEmail.trim()}
          >
            Add store manager
          </button>
        </div>
      )}
      {changeError && <Callout tone='warn'>{changeError}</Callout>}
      {storeManagers.length === 0 && !loadError ? (
        <p className='text-sm text-slate-500'>No store managers yet.</p>
      ) : (
        <ul className='divide-y divide-slate-100'>
          {storeManagers.map((storeManager) => (
            <li
              key={storeManager.id}
              className='flex flex-wrap items-center justify-between gap-3 py-2 text-sm'
            >
              <span className='text-slate-900'>{storeManager.email}</span>
              {canManage && (
                <div className='flex items-center gap-3'>
                  <EmailEditor
                    value={storeManager.email}
                    disabled={isChanging}
                    onSave={(editedEmail) =>
                      changeStoreManagers({
                        action: "update",
                        id: storeManager.id,
                        email: editedEmail,
                      })
                    }
                  />
                  <button
                    className='rounded-lg px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50'
                    onClick={() =>
                      changeStoreManagers({
                        action: "remove",
                        id: storeManager.id,
                      }).catch(() => undefined)
                    }
                    disabled={isChanging}
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
