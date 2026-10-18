"use client";
import { TAB_ORDER, type Tab } from "./types";
import { TabIcon } from "./ui/TabIcon";

// The bottom navigation bar, shown on phones only.
export function MobileTabBar({
  currentTab,
  onSelectTab,
}: {
  currentTab: Tab;
  onSelectTab: (tab: Tab) => void;
}) {
  return (
    <nav className='fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden'>
      {TAB_ORDER.map((tabName) => (
        <button
          key={tabName}
          onClick={() => onSelectTab(tabName)}
          className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${currentTab === tabName ? "text-indigo-600" : "text-slate-500"}`}
        >
          <TabIcon tab={tabName} />
          {tabName}
        </button>
      ))}
    </nav>
  );
}
