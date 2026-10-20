"use client";
import { useState } from "react";
import { cardClass, fieldClass, secondaryButtonClass } from "../../lib/ui/styles";
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
  // True for each day that is over its allowance, or under target, so the figure shows in amber.
  flags?: boolean[];
  totalFlag?: boolean;
};

// Projected sales typed in for each department, keyed by day number, as text while the person types.
type SalesDraft = Record<number, string>;

// Formats an hours figure with at most two decimals, for example "7.5".
const formatHoursText = (hours: number) => String(roundTo2(hours));

// Shows a figure over its allowance in a different color. A small margin avoids rounding noise.
const isOver = (actual: number, allowed: number) => actual > allowed + 0.005;

// Reads the payroll percent the person typed. Returns null when it is blank or not a usable number.
function parsePayrollPercent(percentText: string): number | null {
  if (percentText.trim() === "") return null;
  const percent = Number(percentText);
  return Number.isFinite(percent) && percent >= 0 ? percent : null;
}

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

// Builds the rows that compare the store's sales, at the typed payroll percent, with what is scheduled.
// A positive difference means the schedule is under target.
function payrollCheckRows(days: StoreDayTotals[], totals: StoreDayTotals, payrollPercent: number): OverviewRow[] {
  const targetFor = (salesDollars: number) => (salesDollars * payrollPercent) / 100;
  const differenceFor = (salesDollars: number, scheduledDollars: number) =>
    targetFor(salesDollars) - scheduledDollars;
  return [
    {
      label: `Target payroll at ${roundTo2(payrollPercent)}%`,
      cells: days.map((dayTotals) => formatMoney(targetFor(dayTotals.sales))),
      total: formatMoney(targetFor(totals.sales)),
    },
    {
      label: "Scheduled payroll",
      cells: days.map((dayTotals) => formatMoney(dayTotals.schedCost)),
      total: formatMoney(totals.schedCost),
    },
    {
      label: "Under (+) / over (−) target",
      cells: days.map((dayTotals) => formatMoney(differenceFor(dayTotals.sales, dayTotals.schedCost))),
      total: formatMoney(differenceFor(totals.sales, totals.schedCost)),
      strong: true,
      flags: days.map((dayTotals) => differenceFor(dayTotals.sales, dayTotals.schedCost) < -0.5),
      totalFlag: differenceFor(totals.sales, totals.schedCost) < -0.5,
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

// One department's projected sales, one input per day, with a save button once something is typed.
function ProjectedSalesEditor({
  departmentName,
  dailySales,
  draft,
  isSaving,
  saveError,
  onChangeDay,
  onSave,
}: {
  departmentName: string;
  dailySales: DayRow[];
  draft: SalesDraft | undefined;
  isSaving: boolean;
  saveError: string | undefined;
  onChangeDay: (dayNumber: number, dollarsText: string) => void;
  onSave: () => void;
}) {
  const hasDraft = !!draft && Object.keys(draft).length > 0;
  // Shows what the person typed, or the saved amount for any day they have not changed.
  const shownValueFor = (dayRow: DayRow) =>
    draft?.[dayRow.day] ?? String(Math.round(dayRow.sales));
  const typedTotal = dailySales.reduce(
    (running, dayRow) => running + (Number(shownValueFor(dayRow)) || 0),
    0,
  );
  return (
    <div className={`${cardClass} p-4`}>
      <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
        <h3 className='text-sm font-semibold text-slate-900'>{departmentName}: projected sales</h3>
        <span className='text-xs text-slate-500'>Week total {formatMoney(typedTotal)}</span>
      </div>
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6'>
        {dailySales.map((dayRow) => (
          <label key={dayRow.day} className='block'>
            <span className='text-xs font-medium text-slate-600'>{DAY_SHORT_LABELS[dayRow.day]}</span>
            <input
              className={`${fieldClass} mt-1 text-right`}
              type='number'
              min='0'
              step='100'
              inputMode='decimal'
              value={shownValueFor(dayRow)}
              onChange={(changeEvent) => onChangeDay(dayRow.day, changeEvent.target.value)}
            />
          </label>
        ))}
      </div>
      <div className='mt-3 flex flex-wrap items-center gap-3'>
        <button
          className={secondaryButtonClass}
          disabled={!hasDraft || isSaving}
          onClick={onSave}
        >
          {isSaving ? "Saving…" : "Save projected sales"}
        </button>
        {saveError && <span className='text-sm text-rose-600'>{saveError}</span>}
      </div>
    </div>
  );
}

// The store overview screen: every department in the store added together by day, the store payroll check,
// projected sales for each department, and each department's own figures.
export function StoreOverviewScreen({
  overview,
  storeName,
  loadError,
  onSaveDepartmentSales,
}: {
  overview: StoreOverview | null;
  storeName: string | undefined;
  loadError: string | null;
  // Saves one department's projected sales, keyed by day number. The page reloads the overview after it succeeds.
  onSaveDepartmentSales: (departmentId: number, dailySales: Record<number, number>) => Promise<unknown>;
}) {
  // The payroll percent typed for the whole store. It is not saved; it only changes this comparison.
  const [payrollPercentText, setPayrollPercentText] = useState("");
  // Projected sales typed but not yet saved, and the save status, for each department.
  const [salesDrafts, setSalesDrafts] = useState<Record<number, SalesDraft>>({});
  const [savingDepartmentId, setSavingDepartmentId] = useState<number | null>(null);
  const [saveErrors, setSaveErrors] = useState<Record<number, string>>({});

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

  const payrollPercent = parsePayrollPercent(payrollPercentText);

  // Records one typed day for a department, without saving yet.
  const changeDraftDay = (departmentId: number, dayNumber: number, dollarsText: string) =>
    setSalesDrafts((currentDrafts) => ({
      ...currentDrafts,
      [departmentId]: { ...currentDrafts[departmentId], [dayNumber]: dollarsText },
    }));

  // Saves all of one department's days. Blank or invalid days are treated as zero.
  const saveDepartmentSales = (departmentId: number, dailySales: DayRow[]) => {
    const draft = salesDrafts[departmentId] ?? {};
    const dollarsByDay: Record<number, number> = {};
    for (const dayRow of dailySales) {
      const typedText = draft[dayRow.day] ?? String(Math.round(dayRow.sales));
      const dollars = Number(typedText);
      dollarsByDay[dayRow.day] = Number.isFinite(dollars) && dollars >= 0 ? dollars : 0;
    }
    setSavingDepartmentId(departmentId);
    setSaveErrors((currentErrors) => ({ ...currentErrors, [departmentId]: "" }));
    onSaveDepartmentSales(departmentId, dollarsByDay)
      .then(() =>
        setSalesDrafts((currentDrafts) => {
          const remainingDrafts = { ...currentDrafts };
          delete remainingDrafts[departmentId];
          return remainingDrafts;
        }),
      )
      .catch((thrownError: Error) =>
        setSaveErrors((currentErrors) => ({ ...currentErrors, [departmentId]: thrownError.message })),
      )
      .finally(() => setSavingDepartmentId(null));
  };

  return (
    <>
      <Heading title={storeName ? `Store overview: ${storeName}` : "Store overview"}>
        Every department in the store, added together by day. Type a payroll
        percent to see where the whole store stands. Projected sales for each
        department can be changed below.
      </Heading>

      <h2 className='mb-2 mt-6 text-sm font-semibold text-slate-700'>Whole store</h2>
      <MatrixTable rows={storeTotalRows(overview.days, overview.totals)} />

      <h2 className='mb-2 mt-8 text-sm font-semibold text-slate-700'>Store payroll check</h2>
      <div className={`${cardClass} p-4`}>
        <label className='block max-w-xs'>
          <span className='text-sm font-medium text-slate-700'>Store payroll target (%)</span>
          <input
            className={`${fieldClass} mt-1`}
            type='number'
            min='0'
            step='0.1'
            inputMode='decimal'
            placeholder='for example 12'
            value={payrollPercentText}
            onChange={(changeEvent) => setPayrollPercentText(changeEvent.target.value)}
          />
        </label>
        <p className='mt-2 text-xs text-slate-500'>
          This isn't saved. It only changes this comparison.
        </p>
        {payrollPercent !== null && (
          <div className='mt-4'>
            <MatrixTable rows={payrollCheckRows(overview.days, overview.totals, payrollPercent)} />
          </div>
        )}
      </div>

      <h2 className='mb-2 mt-8 text-sm font-semibold text-slate-700'>Projected sales by department</h2>
      <div className='space-y-4'>
        {overview.departments.map((department) => (
          <ProjectedSalesEditor
            key={department.departmentId}
            departmentName={department.departmentName}
            dailySales={department.days}
            draft={salesDrafts[department.departmentId]}
            isSaving={savingDepartmentId === department.departmentId}
            saveError={saveErrors[department.departmentId] || undefined}
            onChangeDay={(dayNumber, dollarsText) =>
              changeDraftDay(department.departmentId, dayNumber, dollarsText)
            }
            onSave={() => saveDepartmentSales(department.departmentId, department.days)}
          />
        ))}
      </div>

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
