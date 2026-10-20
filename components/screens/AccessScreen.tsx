"use client";
import { cardClass, fieldClass, primaryButtonClass } from "../../lib/ui/styles";
import type { AccessMember } from "../types";
import { Callout } from "../ui/Callout";
import { CompanyAdminsCard } from "./CompanyAdminsCard";
import { CreateDepartmentCard } from "./CreateDepartmentCard";
import { CreateStoreCard } from "./CreateStoreCard";
import { DeleteDepartmentCard } from "./DeleteDepartmentCard";
import { DeleteStoreCard } from "./DeleteStoreCard";
import { EmailEditor } from "../ui/EmailEditor";
import { RenameCard } from "./RenameCard";
import { Heading } from "../ui/Heading";
import { StoreManagersCard } from "./StoreManagersCard";

// The Access screen, from the widest access to the narrowest:
// company admins, store managers, department managers, then creating and deleting.
// Company admins and store managers can change the department list. Department managers see it read-only.
export function AccessScreen({
  departmentName,
  storeName,
  isCompanyAdmin,
  currentEmail,
  canSeeStoreManagers,
  members,
  canManage,
  accessError,
  newEmail,
  onNewEmailChange,
  onRemoveMember,
  onEditMember,
  onAddMember,
}: {
  departmentName: string | undefined;
  storeName: string | undefined;
  isCompanyAdmin: boolean;
  currentEmail: string;
  canSeeStoreManagers: boolean;
  members: AccessMember[];
  // True for company admins and store managers, who can change who has access.
  canManage: boolean;
  accessError: string | null;
  newEmail: string;
  onNewEmailChange: (emailText: string) => void;
  onRemoveMember: (memberId: number) => void;
  onEditMember: (memberId: number, editedEmail: string) => Promise<unknown>;
  onAddMember: () => void;
}) {
  return (
    <>
      <Heading
        title={
          departmentName ? `Team access: ${departmentName}` : "Team access"
        }
      >
        Who can do what. Company admins see and change everything. Store
        managers manage their whole store. Department managers work in their
        departments but can't change who has access.
      </Heading>

      {isCompanyAdmin && (
        <>
          <h2 className='mb-2 mt-8 text-sm font-semibold text-slate-700'>
            Company admins
          </h2>
          <CompanyAdminsCard currentEmail={currentEmail} />
        </>
      )}

      {canSeeStoreManagers && (
        <>
          <h2 className='mb-2 mt-8 text-sm font-semibold text-slate-700'>
            Store managers
          </h2>
          <StoreManagersCard />
        </>
      )}

      <h2 className='mb-2 mt-8 text-sm font-semibold text-slate-700'>
        Department managers{departmentName ? `: ${departmentName}` : ""}
      </h2>
      {accessError && (
        <div className='mb-3'>
          <Callout tone='warn'>{accessError}</Callout>
        </div>
      )}
      <div className={`${cardClass} overflow-x-auto`}>
        <table className='min-w-full divide-y divide-slate-200 text-sm'>
          <thead className='bg-slate-50'>
            <tr>
              <th className='px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>
                Email
              </th>
              <th className='px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>
                Role
              </th>
              <th className='w-24' />
            </tr>
          </thead>
          <tbody className='divide-y divide-slate-100'>
            {members.map((member) => (
              <tr key={member.id}>
                <td className='px-3 py-2.5 text-slate-900'>{member.email}</td>
                <td className='px-3 py-2.5 text-slate-700'>
                  Department manager
                </td>
                <td className='px-3 py-2.5 text-right'>
                  {canManage && (
                    <div className='flex items-center justify-end gap-3'>
                      <EmailEditor
                        value={member.email}
                        onSave={(editedEmail) =>
                          onEditMember(member.id, editedEmail)
                        }
                      />
                      <button
                        onClick={() => {
                          if (
                            window.confirm(
                              `Remove ${member.email} from this department?`,
                            )
                          )
                            onRemoveMember(member.id);
                        }}
                        className='text-sm font-medium text-rose-600 hover:underline'
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canManage && (
        <div
          className={`${cardClass} mt-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-end`}
        >
          <label className='block flex-1'>
            <span className='text-sm font-medium text-slate-700'>
              Add department manager
            </span>
            <input
              className={`${fieldClass} mt-1`}
              type='email'
              placeholder='name@detwilermarket.com'
              value={newEmail}
              onChange={(changeEvent) =>
                onNewEmailChange(changeEvent.target.value)
              }
            />
          </label>
          <button className={primaryButtonClass} onClick={onAddMember}>
            Add
          </button>
        </div>
      )}
      <p className='mt-3 text-xs text-slate-500'>
        Create the person's login in Supabase first (Authentication, then Users,
        then Add user), since sign-up is turned off. Then add them here with the
        same email.
      </p>

      {isCompanyAdmin && (
        <>
          <h2 className='mb-2 mt-8 text-sm font-semibold text-slate-700'>
            Create a store
          </h2>
          <CreateStoreCard />
        </>
      )}

      {canManage && (
        <>
          <h2 className='mb-2 mt-8 text-sm font-semibold text-slate-700'>
            Create a department
          </h2>
          <CreateDepartmentCard />
        </>
      )}

      {canManage && departmentName && (
        <>
          <h2 className='mb-2 mt-8 text-sm font-semibold text-slate-700'>
            Rename this department
          </h2>
          <RenameCard
            currentName={departmentName}
            fieldLabel='Department name'
            endpoint='/api/departments/rename'
            description='Changes the name everywhere this department appears. Names must be unique within the store.'
          />
        </>
      )}

      {canManage && departmentName && (
        <>
          <h2 className='mb-2 mt-8 text-sm font-semibold text-rose-700'>
            Delete this department
          </h2>
          <DeleteDepartmentCard departmentName={departmentName} />
        </>
      )}

      {isCompanyAdmin && storeName && (
        <>
          <h2 className='mb-2 mt-8 text-sm font-semibold text-slate-700'>
            Rename this store
          </h2>
          <RenameCard
            currentName={storeName}
            fieldLabel='Store name'
            endpoint='/api/stores/rename'
            description='Changes the store name everywhere it appears. Store names must be unique.'
          />
        </>
      )}

      {isCompanyAdmin && storeName && (
        <>
          <h2 className='mb-2 mt-8 text-sm font-semibold text-rose-700'>
            Delete a store
          </h2>
          <DeleteStoreCard storeName={storeName} />
        </>
      )}
    </>
  );
}
