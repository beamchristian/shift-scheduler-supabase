"use client";
import { cardClass } from "../../lib/ui/styles";
import { DAY_SHORT_LABELS, formatMoney, roundTo2 } from "../../lib/ui/format";
import type { DayRow } from "../../lib/report";
import type { StoreDayTotals, StoreOverview } from "../../lib/storeOverview";
import { Callout } from "../ui/Callout";
import { Heading } from "../ui/Heading";

// One line of a store table: a label, one value per day, a week total, and optional emphasis.
type OverviewRow = {
  label: string;
  cells: string[];
  total: string;
  strong?: boolean;
  // True for each day that is over its allowance, so the figure shows in amber.
  flags?: boolean[];
  totalFlag?: boolean;
};

// Formats an hours figure with at most two decimals, for example "7.5".
const formatHoursText = (hours: number) => String(roundTo2(hours));

// Shows a figure over its allowance in a different color. A small margin avoids rounding noise.
const isOver = (actual: number, allowed: number) => actual > allowed + 0.005;

// Builds the rows for the store totals table, one value per day.
function storeTotalRows(days: StoreDayTotals[], totals: StoreDayTotals): OverviewRow[] {
  return [
    {
      label: "Projected sales",
      cells: days.map((dayTotals) => formatMoney(dayTotals.sales)),
      total: formatMoney(totals.sales),
    },
    {
      label: "Target payroll",
      cells: days.map((dayTotals) => formatMoney(dayTotals.target)),
      total: formatMoney(totals.target),
    },
    {
      label: "Allowed hours",
      cells: days.map((dayTotals) => formatHoursText(dayTotals.allowed)),
      total: formatHoursText(totals.allowed),
      strong: true,
    },
    {
      label: "Hours to fully staff",
      cells: days.map((dayTotals) => formatHoursText(dayTotals.req)),
      total: formatHoursText(totals.req),
    },
    {
      label: "Cost to fully staff",
      cells: days.map((dayTotals) => formatMoney(dayTotals.reqCost)),
      total: formatMoney(totals.reqCost),
    },
    {
      label: "Hours scheduled",
      cells: days.map((dayTotals) => formatHoursText(dayTotals.sched)),
      total: formatHoursText(totals.sched),
      strong: true,
    },
    {
      label: "Scheduled payroll",
      cells: days.map((dayTotals) => formatMoney(dayTotals.schedCost)),
      total: formatMoney(totals.schedCost),
    },
    {
      label: "+/- hours",
      cells: days.map((dayTotals) => formatHoursText(dayTotals.sched - dayTotals.allowed)),
      total: formatHoursText(totals.sched - totals.allowed),
      strong: true,
      flags: days.map((dayTotals) => isOver(dayTotals.sched, dayTotals.allowed)),
      totalFlag: isOver(totals.sched, totals.allowed),
    },
  ];
}

// Builds the rows for one department's breakdown table, one value per day.
function departmentRows(days: DayRow[]): OverviewRow[] {
  const totalAllowed = days.reduce((running, dayRow) => running + dayRow.allowed, 0);
  const totalSched = days.reduce((running, dayRow) => running + dayRow.sched, 0);
  const totalSchedCost = days.reduce((running, dayRow) => running + dayRow.schedCost, 0);
  return [
    {
      label: "Allowed hours",
      cells: days.map((dayRow) => formatHoursText(dayRow.allowed)),
      total: formatHoursText(totalAllowed),
    },
    {
      label: "Hours scheduled",
      cells: days.map((dayRow) => formatHoursText(dayRow.sched)),
      total: formatHoursText(totalSched),
    },
    {
      label: "+/- hours",
      cells: days.map((dayRow) => formatHoursText(dayRow.sched - dayRow.allowed)),
      total: formatHoursText(totalSched - totalAllowed),
      flags: days.map((dayRow) => isOver(dayRow.sched, dayRow.allowed)),
      totalFlag: isOver(totalSched, totalAllowed),
    },
    {
      label: "Scheduled payroll",
      cells: days.map((dayRow) => formatMoney(dayRow.schedCost)),
      total: formatMoney(totalSchedCost),
    },
  ];
}

// One matrix table: a header with the day names, then one row per figure.
function MatrixTable({ rows }: { rows: OverviewRow[] }) {
  return (
    <div className={`${cardClass} overflow-x-auto`}>
      <table className='min-w-full divide-y divide-slate-200 text-sm'>
        <thead className='bg-slate-50'>
          <tr>
            <th className='px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>
              Labor
            </th>
            {DAY_SHORT_LABELS.slice(1).map((dayName) => (
              <th
                key={dayName}
                className='px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500'
              >
                {dayName}
              </th>
            ))}
            <th className='px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500'>
              Total
            </th>
          </tr>
        </thead>
        <tbody className='divide-y divide-slate-100'>
          {rows.map((row) => (
            <tr key={row.label} className={row.strong ? "font-semibold" : ""}>
              <td className='whitespace-nowrap px-3 py-2 text-slate-900'>{row.label}</td>
              {row.cells.map((cellText, dayIndex) => (
                <td
                  key={dayIndex}
                  className={`px-3 py-2 text-right tabular-nums ${row.flags?.[dayIndex] ? "text-amber-700" : "text-slate-700"}`}
                >
                  {cellText}
                </td>
              ))}
              <td
                className={`px-3 py-2 text-right font-semibold tabular-nums ${row.totalFlag ? "text-amber-700" : "text-slate-900"}`}
              >
                {row.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// The store overview screen: every department in the store added together by day, then each department on its own.
export function StoreOverviewScreen({
  overview,
  storeName,
  loadError,
}: {
  overview: StoreOverview | null;
  storeName: string | undefined;
  loadError: string | null;
}) {
  if (loadError)
    return (
      <>
        <Heading title='Store overview' />
        <Callout tone='warn'>{loadError}</Callout>
      </>
    );
  if (!overview)
    return (
      <>
        <Heading title='Store overview' />
        <p className='text-sm text-slate-500'>Loading…</p>
      </>
    );

  return (
    <>
      <Heading title={storeName ? `Store overview: ${storeName}` : "Store overview"}>
        Every department in the store, added together by day. Each department's
        own figures are below the totals.
      </Heading>

      <h2 className='mb-2 mt-6 text-sm font-semibold text-slate-700'>Whole store</h2>
      <MatrixTable rows={storeTotalRows(overview.days, overview.totals)} />

      <h2 className='mb-2 mt-8 text-sm font-semibold text-slate-700'>By department</h2>
      <div className='space-y-6'>
        {overview.departments.map((department) => (
          <div key={department.departmentId}>
            <h3 className='mb-2 text-sm font-semibold text-slate-900'>{department.departmentName}</h3>
            <MatrixTable rows={departmentRows(department.days)} />
          </div>
        ))}
      </div>
    </>
  );
}
