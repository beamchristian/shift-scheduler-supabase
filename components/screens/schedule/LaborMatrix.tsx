import type { Report } from "../../../lib/report";
import {
  DAY_SHORT_LABELS,
  formatMoney,
  roundTo2,
} from "../../../lib/ui/format";
import { cardClass } from "../../../lib/ui/styles";

// One value in the matrix. Warning values are shown in amber.
type MatrixCell = { text: string; isWarning?: boolean };

// One line of the matrix, such as "Projected sales". Alternate lines are the smaller grey figures.
type MatrixRow = {
  label: string;
  cells: MatrixCell[];
  total: string;
  isAlternate?: boolean;
};

// The labor matrix: sales, payroll targets, and hours for each day, with a total column.
export function LaborMatrix({ report }: { report: Report }) {
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
      <h2 className='mb-2 mt-6 text-sm font-semibold text-slate-700'>
        Labor matrix
      </h2>
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
