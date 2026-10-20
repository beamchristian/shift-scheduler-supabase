"use client";
import { useState, type ReactNode } from "react";
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

// The overview as the screen receives it: the store overview, plus the store's name and saved payroll target.
type OverviewData = StoreOverview & { storeName: string; storePayrollPercent: number | null };

// Formats an hours figure with at most two decimals, for example "7.5".
const formatHoursText = (hours: number) => String(roundTo2(hours));

// Shows a figure over its allowance in a different color. A small margin avoids rounding noise.
const isOver = (actual: number, allowed: number) => actual > allowed + 0.005;

// Reads a percent the person typed. Returns null when it is blank or not a usable number.
function parsePercent(percentText: string): number | null {
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

// Builds the rows that compare the store's sales, at the payroll percent, with what is scheduled.
// A negative difference means scheduled payroll is over target.
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
  const totalSales = days.reduce((running, dayRow) => running + dayRow.sales, 0);
  const totalAllowed = days.reduce((running, dayRow) => running + dayRow.allowed, 0);
  const totalSched = days.reduce((running, dayRow) => running + dayRow.sched, 0);
  const totalSchedCost = days.reduce((running, dayRow) => running + dayRow.schedCost, 0);
  return [
    {
      label: "Projected sales",
      cells: days.map((dayRow) => formatMoney(dayRow.sales)),
      total: formatMoney(totalSales),
    },
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

// One matrix table: a header with the day names, then one row per figure. An optional header sits above it in the same card.
function MatrixTable({ rows, header }: { rows: OverviewRow[]; header?: ReactNode }) {
  return (
    <div className={`${cardClass} overflow-x-auto`}>
      {header}
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

// The bar above one department's table: its name, and the weekly projected sales box with its save button.
// Changing the total keeps the day split from Settings.
function DepartmentSalesBar({
  departmentName,
  weeklySalesDefault,
  isSaving,
  saveError,
  onSave,
}: {
  departmentName: string;
  weeklySalesDefault: number;
  isSaving: boolean;
  saveError: string | undefined;
  onSave: (weeklySales: number) => Promise<unknown>;
}) {
  // The text the person is typing. Starts at the department's saved weekly total.
  const [weeklySalesText, setWeeklySalesText] = useState(String(Math.round(weeklySalesDefault)));
  const [justSaved, setJustSaved] = useState(false);
  const typedWeeklySales = Number(weeklySalesText);
  const isValidAmount = weeklySalesText.trim() !== "" && Number.isFinite(typedWeeklySales) && typedWeeklySales >= 0;
  const hasChanged = isValidAmount && Math.round(typedWeeklySales) !== Math.round(weeklySalesDefault);

  return (
    <div className='flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3'>
      <div>
        <h3 className='text-sm font-semibold text-slate-900'>{departmentName}</h3>
        <p className='text-xs text-slate-500'>Each day gets its share of this total from the day weights in Settings.</p>
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        <span className='text-xs font-medium text-slate-600'>Weekly projected sales</span>
        <input
          className={`${fieldClass} w-36 text-right`}
          type='number'
          min='0'
          step='100'
          inputMode='decimal'
          aria-label={`${departmentName} weekly projected sales`}
          value={weeklySalesText}
          onChange={(changeEvent) => {
            setJustSaved(false);
            setWeeklySalesText(changeEvent.target.value);
          }}
        />
        <button
          className={secondaryButtonClass}
          disabled={!hasChanged || isSaving}
          onClick={() => onSave(typedWeeklySales).then(() => setJustSaved(true)).catch(() => undefined)}
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
        {saveError ? (
          <span className='text-sm text-rose-600'>{saveError}</span>
        ) : justSaved ? (
          <span className='text-sm text-emerald-700'>Saved</span>
        ) : null}
      </div>
    </div>
  );
}

// The store overview screen: every department added together by day, the store payroll check,
// and each department's own projected sales and figures.
export function StoreOverviewScreen({
  overview,
  storeName,
  loadError,
  onSaveDepartmentSales,
  onSaveStorePayroll,
}: {
  overview: OverviewData | null;
  storeName: string | undefined;
  loadError: string | null;
  // Saves one department's weekly projected sales, and shows the overview it sends back.
  onSaveDepartmentSales: (departmentId: number, weeklySales: number) => Promise<unknown>;
  // Saves the store payroll target, and shows the overview it sends back. Blank clears it.
  onSaveStorePayroll: (payrollPercentText: string) => Promise<unknown>;
}) {
  // The store payroll target as typed. It starts at the saved value.
  const [payrollPercentText, setPayrollPercentText] = useState<string | null>(null);
  const [savingPayroll, setSavingPayroll] = useState(false);
  const [payrollError, setPayrollError] = useState<string | null>(null);
  const [payrollSaved, setPayrollSaved] = useState(false);
  // Which department is being saved, and the last save error for each department.
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

  // What the box shows: what the person typed, or the saved target until they change it.
  const shownPayrollText =
    payrollPercentText ?? (overview.storePayrollPercent === null ? "" : String(overview.storePayrollPercent));
  const payrollPercent = parsePercent(shownPayrollText);
  const hasUnsavedPayroll =
    payrollPercentText !== null && parsePercent(payrollPercentText) !== overview.storePayrollPercent;

  // Saves the store payroll target. The screen updates from the reply.
  const savePayroll = () => {
    setSavingPayroll(true);
    setPayrollError(null);
    setPayrollSaved(false);
    onSaveStorePayroll(shownPayrollText)
      .then(() => {
        setPayrollPercentText(null);
        setPayrollSaved(true);
      })
      .catch((thrownError: Error) => setPayrollError(thrownError.message))
      .finally(() => setSavingPayroll(false));
  };

  // Saves one department's weekly sales, and shows its error on that department's bar.
  const saveDepartmentSales = (departmentId: number, weeklySales: number) => {
    setSavingDepartmentId(departmentId);
    setSaveErrors((currentErrors) => ({ ...currentErrors, [departmentId]: "" }));
    return onSaveDepartmentSales(departmentId, weeklySales)
      .catch((thrownError: Error) => {
        setSaveErrors((currentErrors) => ({ ...currentErrors, [departmentId]: thrownError.message }));
        throw thrownError;
      })
      .finally(() => setSavingDepartmentId(null));
  };

  return (
    <>
      <Heading title={storeName ? `Store overview: ${storeName}` : "Store overview"}>
        Every department in the store, added together by day. Set the store payroll
        target to see whether total scheduled payroll is over or under it. Each
        department's weekly projected sales can be changed in its table.
      </Heading>

      <h2 className='mb-2 mt-6 text-sm font-semibold text-slate-700'>Whole store</h2>
      <MatrixTable rows={storeTotalRows(overview.days, overview.totals)} />

      <h2 className='mb-2 mt-8 text-sm font-semibold text-slate-700'>Store payroll target</h2>
      <div className='flex flex-wrap items-end gap-3'>
        <label className='block'>
          <span className='text-sm font-medium text-slate-700'>Payroll target for the whole store (%)</span>
          <input
            className={`${fieldClass} mt-1 w-40`}
            type='number'
            min='0'
            max='100'
            step='0.1'
            inputMode='decimal'
            placeholder='for example 12'
            value={shownPayrollText}
            onChange={(changeEvent) => {
              setPayrollSaved(false);
              setPayrollPercentText(changeEvent.target.value);
            }}
          />
        </label>
        <button
          className={secondaryButtonClass}
          disabled={!hasUnsavedPayroll || savingPayroll}
          onClick={savePayroll}
        >
          {savingPayroll ? "Saving…" : "Save target"}
        </button>
        {payrollError ? (
          <span className='text-sm text-rose-600'>{payrollError}</span>
        ) : payrollSaved ? (
          <span className='text-sm text-emerald-700'>Saved</span>
        ) : null}
      </div>
      <div className='mt-3'>
        {payrollPercent === null ? (
          <p className='text-sm text-slate-500'>
            Enter a payroll target and save it to see whether scheduled payroll is over or under it.
          </p>
        ) : (
          <MatrixTable rows={payrollCheckRows(overview.days, overview.totals, payrollPercent)} />
        )}
      </div>

      <h2 className='mb-2 mt-8 text-sm font-semibold text-slate-700'>By department</h2>
      <div className='space-y-6'>
        {overview.departments.map((department) => {
          const departmentSales = department.days.reduce((running, dayRow) => running + dayRow.sales, 0);
          return (
            <div key={department.departmentId}>
              <MatrixTable
                rows={departmentRows(department.days)}
                header={
                  <DepartmentSalesBar
                    key={`${department.departmentId}-${Math.round(department.weeklySales)}`}
                    departmentName={department.departmentName}
                    weeklySalesDefault={department.weeklySales || departmentSales}
                    isSaving={savingDepartmentId === department.departmentId}
                    saveError={saveErrors[department.departmentId] || undefined}
                    onSave={(weeklySales) => saveDepartmentSales(department.departmentId, weeklySales)}
                  />
                }
              />
            </div>
          );
        })}
      </div>
    </>
  );
}
