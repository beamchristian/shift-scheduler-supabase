"use client";
import { fieldClass } from "../lib/ui/styles";
import { TAB_ORDER, type CurrentUser, type Tab } from "./types";
import { TabIcon } from "./ui/TabIcon";

// Puts each person's departments under the store they belong to, in the order they came back.
function groupMembershipsByStore(
  memberships: CurrentUser["memberships"],
): { storeId: number; storeName: string; memberships: CurrentUser["memberships"] }[] {
  const groups: { storeId: number; storeName: string; memberships: CurrentUser["memberships"] }[] = [];
  for (const membership of memberships) {
    const existingGroup = groups.find((group) => group.storeId === membership.storeId);
    if (existingGroup) existingGroup.memberships.push(membership);
    else
      groups.push({
        storeId: membership.storeId,
        storeName: membership.storeName,
        memberships: [membership],
      });
  }
  return groups;
}

// Names the person's role and store, for example "Store manager · Store 2".
function roleLabel(user: CurrentUser): string {
  const roleNames: Record<string, string> = {
    admin: "Company admin",
    store_manager: "Store manager",
    department_manager: "Department manager",
  };
  return `${roleNames[user.role] ?? ""} · ${user.storeName}`;
}

// The top bar: the app name, the screen links (computers only), the department name or switcher, and sign-out.
export function AppHeader({
  currentUser,
  currentTab,
  onSelectTab,
  onSwitchDepartment,
  onSignOut,
}: {
  currentUser: CurrentUser | null;
  currentTab: Tab;
  onSelectTab: (tab: Tab) => void;
  onSwitchDepartment: (departmentId: number) => void;
  onSignOut: () => void;
}) {
  return (
    <header className='sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur'>
      <div className='mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3'>
        <div className='flex items-center gap-2.5'>
          <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white'>
            S
          </div>
          <span className='text-base font-semibold tracking-tight'>
            Shift Scheduler
          </span>
        </div>
        <nav className='hidden gap-1 md:flex'>
          {TAB_ORDER.map((tabName) => (
            <button
              key={tabName}
              onClick={() => onSelectTab(tabName)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${currentTab === tabName ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100"}`}
            >
              <TabIcon tab={tabName} />
              {tabName}
            </button>
          ))}
        </nav>
        {currentUser && (
          <span className='hidden text-xs font-medium text-slate-500 lg:inline'>
            {roleLabel(currentUser)}
          </span>
        )}
        {currentUser &&
          (currentUser.memberships.length > 1 ? (
            // More than one department: show a dropdown to switch between them, grouped by store.
            <select
              aria-label='Department'
              className={`${fieldClass} w-auto py-1.5 text-sm`}
              value={currentUser.departmentId}
              onChange={(changeEvent) =>
                onSwitchDepartment(Number(changeEvent.target.value))
              }
            >
              {groupMembershipsByStore(currentUser.memberships).map((group) => (
                <optgroup key={group.storeId} label={group.storeName}>
                  {group.memberships.map((membership) => (
                    <option
                      key={membership.departmentId}
                      value={membership.departmentId}
                    >
                      {membership.departmentName}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          ) : (
            // Only one department: show its name.
            <span className='text-sm font-semibold text-slate-700'>
              {currentUser.departmentName}
            </span>
          ))}
        <button
          onClick={onSignOut}
          className='rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100'
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
