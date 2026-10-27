"use client";
import type { DepartmentWeekStatus } from "../../lib/storeOverview";
import { cardClass } from "../../lib/ui/styles";
import { addDays, isPastWeek, weekLabel } from "../../lib/weeks";
import { Pill } from "./schedule/WeekBar";

// The label and color for each department week status.
const STATUS_PILLS: Record<DepartmentWeekStatus, { tone: "published" | "draft" | "empty"; text: string }> = {
  published: { tone: "published", text: "Published" },
  draft: { tone: "draft", text: "Draft" },
  empty: { tone: "empty", text: "No schedule yet" },
};

// The status label for one department's week: Published, Draft, or No schedule yet.
export function DepartmentStatusPill({ status }: { status: DepartmentWeekStatus }) {
  return <Pill tone={STATUS_PILLS[status].tone}>{STATUS_PILLS[status].text}</Pill>;
}

// Counts the departments in each status and returns a short summary,
// for example "3 published · 2 drafts · 2 with no schedule yet".
export function statusSummary(statuses: DepartmentWeekStatus[]): string {
  const countOf = (status: DepartmentWeekStatus) => statuses.filter((candidate) => candidate === status).length;
  const publishedCount = countOf("published");
  const draftCount = countOf("draft");
  const emptyCount = countOf("empty");
  const parts: string[] = [];
  if (publishedCount) parts.push(`${publishedCount} published`);
  if (draftCount) parts.push(`${draftCount} draft${draftCount === 1 ? "" : "s"}`);
  if (emptyCount) parts.push(`${emptyCount} with no schedule yet`);
  return parts.join(" · ");
}

// The bar at the top of the store overview that picks the week: arrows for the week before and after,
// and buttons for this week and next week. It shares the week with the Schedule screen,
// and shows how many departments have published, drafted, or not yet made that week's schedule.
export function StoreWeekPicker({
  weekStart,
  today,
  currentWeek,
  upcomingWeek,
  isLoading,
  departmentStatuses,
  onChangeWeek,
}: {
  // The week shown, and today's date and the two weeks around it, as "YYYY-MM-DD".
  weekStart: string;
  today: string;
  currentWeek: string;
  upcomingWeek: string;
  // True while a different week is loading.
  isLoading: boolean;
  // Each department's status for the week, once loaded.
  departmentStatuses: DepartmentWeekStatus[];
  onChangeWeek: (weekStart: string) => void;
}) {
  const arrowClass =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50";
  const jumpClass =
    "rounded-lg px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:cursor-default disabled:text-slate-400 disabled:hover:bg-transparent";
  const summaryText = statusSummary(departmentStatuses);

  return (
    <div className={`${cardClass} mb-4 p-4`}>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
          {/* On a phone the arrows sit at the two ends with the week name between them. */}
          <div className='flex items-center justify-between gap-2 sm:justify-start'>
            <button className={arrowClass} aria-label='Week before' onClick={() => onChangeWeek(addDays(weekStart, -7))}>
              ◀
            </button>
            <div className='min-w-0 px-1 text-center sm:text-left'>
              <div className='text-xs font-medium uppercase tracking-wide text-slate-500'>Week of</div>
              <div className={`whitespace-nowrap text-lg font-semibold text-slate-900 ${isLoading ? "opacity-50" : ""}`}>
                {weekLabel(weekStart)}
              </div>
            </div>
            <button className={arrowClass} aria-label='Week after' onClick={() => onChangeWeek(addDays(weekStart, 7))}>
              ▶
            </button>
          </div>
          <div className='flex flex-wrap items-center justify-center gap-1.5 sm:ml-1 sm:justify-start'>
            {weekStart === currentWeek && <Pill tone='here'>This week</Pill>}
            {weekStart === upcomingWeek && weekStart !== currentWeek && <Pill tone='here'>Next week</Pill>}
            {isPastWeek(weekStart, today) && <Pill tone='past'>Past week</Pill>}
          </div>
        </div>
        <div className='flex flex-wrap items-center justify-center gap-1'>
          <button className={jumpClass} disabled={weekStart === currentWeek} onClick={() => onChangeWeek(currentWeek)}>
            This week
          </button>
          <button className={jumpClass} disabled={weekStart === upcomingWeek} onClick={() => onChangeWeek(upcomingWeek)}>
            Next week
          </button>
        </div>
      </div>
      {summaryText && !isLoading && (
        <p className='mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500'>
          Department schedules: {summaryText}. The Schedule screen shows the same week.
        </p>
      )}
    </div>
  );
}
