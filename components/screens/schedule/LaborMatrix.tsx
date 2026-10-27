"use client";
import type { Report } from "../../../lib/report";
import type { StoreHour } from "../../../lib/types";
import {
  DAY_SHORT_LABELS,
  formatMoney,
  roundTo2,
} from "../../../lib/ui/format";
import { cardClass } from "../../../lib/ui/styles";

// A small number box that lines up with the figures in the column below it.
const DAY_WEIGHT_INPUT_CLASS =
  "ml-auto block w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-right text-sm tabular-nums text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

// One value in the matrix. Warning values are shown in amber.
type MatrixCell = { text: string; isWarning?: boolean };

// One line of the matrix, such as "Projected sales". Alternate lines are the smaller grey figures.
type MatrixRow = {
  label: string;
  cells: MatrixCell[];
  total: string;
  isAlternate?: boolean;
};

// The editable "Day weight" row at the top of the matrix. Each day's weight sets its share of the week's
// sales, so changing one moves that day's sales, payroll target and allowed hours in the rows below.
// Weights are relative, so they don't need to add up to 100. Each box saves when the person leaves it.
function DayWeightRow({
  days,
  dayWeights,
  onSaveDayWeight,
}: {
  days: Report["days"];
  dayWeights: StoreHour[];
  onSaveDayWeight: (dayWeightRow: StoreHour, newWeightText: string) => void;
}) {
  const weightTotal = dayWeights.reduce(
    (runningTotal, dayWeightRow) => runningTotal + Number(dayWeightRow.sales_pct),
    0,
  );
  return (
    <tr className='bg-indigo-50'>
      <td className='sticky left-0 whitespace-nowrap bg-indigo-50 px-3 py-2 font-medium text-slate-700'>
        Day weight
        <div className='text-xs font-normal text-slate-500'>
          % shows each day's share
        </div>
      </td>
      {days.map((dayRow) => {
        const dayWeightRow = dayWeights.find(
          (weightRow) => weightRow.day === dayRow.day,
        );
        if (!dayWeightRow) return <td key={dayRow.day} />;
        const sharePercent = weightTotal
          ? (Number(dayWeightRow.sales_pct) / weightTotal) * 100
          : 0;
        return (
          <td key={dayRow.day} className='px-3 py-2 text-right'>
            <input
              // The key resets the box when a save brings back a new value.
              key={`${dayWeightRow.id}-${dayWeightRow.sales_pct}`}
              className={DAY_WEIGHT_INPUT_CLASS}
              type='number'
              inputMode='decimal'
              step='any'
              min='0'
              aria-label={`${DAY_SHORT_LABELS[dayRow.day]} day weight`}
              defaultValue={dayWeightRow.sales_pct}
              onBlur={(blurEvent) => {
                // Only save when the number really changed.
                if (blurEvent.target.value !== String(dayWeightRow.sales_pct ?? ""))
                  onSaveDayWeight(dayWeightRow, blurEvent.target.value);
              }}
            />
            <div className='mt-0.5 whitespace-nowrap text-xs text-slate-500'>
              {sharePercent.toFixed(1)}%
            </div>
          </td>
        );
      })}
      <td className='whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-slate-900'>
        {roundTo2(weightTotal)}
      </td>
    </tr>
  );
}

// The labor matrix: day weights, sales, payroll targets, and hours for each day, with a total column.
// The day weight row at the top can be changed here; everything below follows from it.
export function LaborMatrix({
  report,
  dayWeights,
  onSaveDayWeight,
}: {
  report: Report;
  dayWeights: StoreHour[];
  onSaveDayWeight: (dayWeightRow: StoreHour, newWeightText: string) => void;
}) {
  const days = report.days;
  const totals = report.totals;
  const rate = report.rate;
  // The label for the alternate figures: shift length, or paid hours without lunch.
  const alternateLabel = report.rule.countPaid
    ? "shift length"
    : "paid, minus lunch";

  const matrixRows: MatrixRow[] = [
    {
      label: "Projected sales",
      cells: days.map((dayRow) => ({ text: formatMoney(dayRow.sales) })),
      total: formatMoney(totals.sales),
    },
    {
      label: "Target payroll",
      cells: days.map((dayRow) => ({ text: formatMoney(dayRow.target) })),
      total: formatMoney(totals.target),
    },
    {
      label: "Allowed hours",
      cells: days.map((dayRow) => ({ text: String(roundTo2(dayRow.allowed)) })),
      total: String(roundTo2(totals.allowed)),
    },
    {
      label: "Hours to fully staff",
      cells: days.map((dayRow) => ({ text: String(roundTo2(dayRow.req)) })),
      total: String(roundTo2(totals.req)),
    },
    {
      label: alternateLabel,
      isAlternate: true,
      cells: days.map((dayRow) => ({ text: String(roundTo2(dayRow.reqAlt)) })),
      total: String(roundTo2(totals.reqAlt)),
    },
    {
      label: "Cost to fully staff",
      cells: days.map((dayRow) => ({ text: formatMoney(dayRow.req * rate) })),
      total: formatMoney(totals.reqCost),
    },
    {
      label: alternateLabel,
      isAlternate: true,
      cells: days.map((dayRow) => ({
        text: formatMoney(dayRow.reqAlt * rate),
      })),
      total: formatMoney(totals.reqCostAlt),
    },
    {
      label: "Hours scheduled",
      cells: days.map((dayRow) => ({ text: String(roundTo2(dayRow.sched)) })),
      total: String(roundTo2(totals.sched)),
    },
    {
      label: alternateLabel,
      isAlternate: true,
      cells: days.map((dayRow) => ({
        text: String(roundTo2(dayRow.schedAlt)),
      })),
      total: String(roundTo2(totals.schedAlt)),
    },
    {
      label: "Scheduled payroll",
      cells: days.map((dayRow) => ({ text: formatMoney(dayRow.schedCost) })),
      total: formatMoney(totals.schedCost),
    },
    {
      label: alternateLabel,
      isAlternate: true,
      cells: days.map((dayRow) => ({ text: formatMoney(dayRow.schedCostAlt) })),
      total: formatMoney(totals.schedCostAlt),
    },
    {
      label: "+/- hours",
      cells: days.map((dayRow) => ({
        text: String(roundTo2(dayRow.sched - dayRow.allowed)),
        isWarning: dayRow.sched > dayRow.allowed,
      })),
      total: String(roundTo2(totals.sched - totals.allowed)),
    },
  ];
  // The alternate rows are only shown when they differ from the main figures.
  const visibleRows = matrixRows.filter(
    (matrixRow) => !matrixRow.isAlternate || report.showAlt,
  );

  return (
    <>
      <h2 className='mb-1 mt-6 text-sm font-semibold text-slate-700'>
        Labor matrix
      </h2>
      <p className='mb-2 text-xs text-slate-500'>
        Day weights split the weekly forecast across the days. They are
        relative, so they don't need to add up to 100. Change one and the
        sales, payroll target and allowed hours for that day update below.
      </p>
      <div className={`${cardClass} overflow-x-auto`}>
        <table className='min-w-full text-sm'>
          <thead className='bg-slate-50'>
            <tr>
              <th className='sticky left-0 bg-slate-50 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500' />
              {days.map((dayRow) => (
                <th
                  key={dayRow.day}
                  className='px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500'
                >
                  {DAY_SHORT_LABELS[dayRow.day]}
                </th>
              ))}
              <th className='px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500'>
                Total
              </th>
            </tr>
          </thead>
          <tbody className='divide-y divide-slate-100'>
            <DayWeightRow
              days={days}
              dayWeights={dayWeights}
              onSaveDayWeight={onSaveDayWeight}
            />
            {visibleRows.map((matrixRow, rowIndex) => (
              <tr key={rowIndex}>
                <td
                  className={`sticky left-0 whitespace-nowrap bg-white px-3 ${matrixRow.isAlternate ? "py-1 pl-6 text-xs text-slate-400" : "py-2 font-medium text-slate-700"}`}
                >
                  {matrixRow.label}
                </td>
                {matrixRow.cells.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className={`whitespace-nowrap px-3 text-right tabular-nums ${matrixRow.isAlternate ? "py-1 text-xs text-slate-400" : `py-2 ${cell.isWarning ? "font-semibold text-amber-600" : "text-slate-700"}`}`}
                  >
                    {cell.text}
                  </td>
                ))}
                <td
                  className={`whitespace-nowrap px-3 text-right tabular-nums ${matrixRow.isAlternate ? "py-1 text-xs text-slate-400" : "py-2 font-semibold text-slate-900"}`}
                >
                  {matrixRow.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
