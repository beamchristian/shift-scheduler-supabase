"use client";
import { cardClass, fieldClass, primaryButtonClass } from "../../lib/ui/styles";
import type { AccessMember } from "../types";
import { Callout } from "../ui/Callout";
import { Heading } from "../ui/Heading";

// The Access screen: who can sign in to this department, and their roles.
// Only owners can change anything here; managers see the list.
export function AccessScreen({
  departmentName,
  members,
  canManage,
  accessError,
  newEmail,
  newRole,
  onNewEmailChange,
  onNewRoleChange,
  onChangeRole,
  onRemoveMember,
  onAddMember,
}: {
  departmentName: string | undefined;
  members: AccessMember[];
  canManage: boolean;
  accessError: string | null;
  newEmail: string;
  newRole: "owner" | "manager";
  onNewEmailChange: (emailText: string) => void;
  onNewRoleChange: (role: "owner" | "manager") => void;
  onChangeRole: (memberId: number, role: string) => void;
  onRemoveMember: (memberId: number) => void;
  onAddMember: () => void;
}) {
  return (
    <>
      <Heading
        title={
          departmentName ? `Team access: ${departmentName}` : "Team access"
        }
      >
        Who can sign in to this department. Owners can add people and change
        access. Managers can edit schedules, the forecast and settings, but
        can't change access.
      </Heading>
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
                <td className='px-3 py-2.5'>
                  {canManage ? (
                    <select
                      className={fieldClass}
                      value={member.role}
                      onChange={(changeEvent) =>
                        onChangeRole(member.id, changeEvent.target.value)
                      }
                    >
                      <option value='owner'>Owner</option>
                      <option value='manager'>Manager</option>
                    </select>
                  ) : (
                    <span className='capitalize'>{member.role}</span>
                  )}
                </td>
                <td className='px-3 py-2.5 text-right'>
                  {canManage && (
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
              Add person
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
          <label className='block sm:w-40'>
            <span className='text-sm font-medium text-slate-700'>Role</span>
            <select
              className={`${fieldClass} mt-1`}
              value={newRole}
              onChange={(changeEvent) =>
                onNewRoleChange(changeEvent.target.value as "owner" | "manager")
              }
            >
              <option value='manager'>Manager</option>
              <option value='owner'>Owner</option>
            </select>
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
    </>
  );
}
