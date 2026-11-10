"use client";
import { hasBreak } from "../../../lib/hours";
import type { Report } from "../../../lib/report";
import {
  closingTimesByDay,
  isClosingTime,
  limitFor,
  minDaysFor,
  shiftKindFinder,
} from "../../../lib/rules";
import { dateOfDay, shortDateLabel } from "../../../lib/weeks";
import type { ScheduleRow, Snapshot } from "../../../lib/types";
import {
  DAY_FULL_NAMES,
  DAY_SHORT_LABELS,
  WORK_DAYS,
  formatTime12,
  minutesOfDay,
  roundTo2,
  shiftChipClasses,
} from "../../../lib/ui/format";
import { cardClass } from "../../../lib/ui/styles";
import { payrollNote } from "../../../lib/payroll";
import { Callout } from "../../ui/Callout";

// The generated schedule: a grid of people by day on wide screens, and a card for each day on phones and
// tablets. The grid's columns have fixed widths, so all six days always fit without scrolling sideways.
export function ScheduleGrid({
  data,
  weekStart,
  isLocked,
  report,
  swapMessage,
  onSwapClosers,
  onEditShift,
}: {
  data: Snapshot;
  // The week shown, as its Monday, so each day can show its date.
  weekStart: string;
  // True on a published week: no swaps, and shifts can't be opened for editing.
  isLocked: boolean;
  report: Report;
  swapMessage: { tone: "ok" | "warn"; text: string } | null;
  onSwapClosers: (dayNumber: number) => void;
  onEditShift: (shift: ScheduleRow) => void;
}) {
  const days = report.days;
  const altLabel = report.rule.countPaid ? "shift" : "paid";

  // Looks up a person's name from their id.
  const employeeNameFor = (employeeId: number) =>
    data.employees.find((employee) => employee.id === employeeId)?.name ??
    "Unknown";

  // Closing time for each day: the time in Settings, or the latest end time among that day's shift templates.
  const closingTimes = closingTimesByDay(
    data.shift_templates,
    data.settings.closing_time,
  );
  // Whether each shift is an opening, closing or other shift, from its times. Sets the chip color.
  const shiftKindOf = shiftKindFinder(
    data.shift_templates,
    data.settings.closing_time,
  );

  // Counts how many of this person's shifts run to closing time (or later).
  const countClosingShifts = (employeeId: number) =>
    data.schedule.filter(
      (shift) =>
        shift.employee_id === employeeId &&
        isClosingTime(closingTimes, shift.day, shift.end),
    ).length;

  // The most closing shifts this person may work, using the same rule as the scheduler.
  const closeLimitFor = (employee: Snapshot["employees"][number]) =>
    limitFor(employee, data.settings.max_closes);

  return (
    <>
      {swapMessage && (
        <div className='mb-3'>
          <Callout tone={swapMessage.tone}>{swapMessage.text}</Callout>
        </div>
      )}

      {/* Computers: one row per person, one column per day. */}
      <div className={`${cardClass} hidden overflow-x-auto lg:block`}>
        <table className='w-full table-fixed text-sm'>
          {/* The name and hours columns get set widths; the six days share the rest equally. */}
          <colgroup>
            <col className='w-36' />
            {WORK_DAYS.map((dayNumber) => (
              <col key={dayNumber} />
            ))}
            <col className='w-28' />
          </colgroup>
          <thead className='bg-slate-50'>
            <tr>
              <th className='px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>
                Employee
              </th>
              {WORK_DAYS.map((dayNumber) => (
                <th
                  key={dayNumber}
                  className='px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'
                >
                  {DAY_SHORT_LABELS[dayNumber]}
                  <span className='block font-medium normal-case tracking-normal text-slate-400'>
                    {shortDateLabel(dateOfDay(weekStart, dayNumber))}
                  </span>
                  {!isLocked && (
                    <button
                      onClick={() => onSwapClosers(dayNumber)}
                      className='mt-0.5 block text-[11px] font-medium normal-case tracking-normal text-indigo-600 hover:underline'
                    >
                      Swap closers
                    </button>
                  )}
                </th>
              ))}
              <th className='px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500'>
                Hours
              </th>
            </tr>
          </thead>
          <tbody className='divide-y divide-slate-100'>
            {data.employees.map((employee) => {
              const employeeShifts = data.schedule.filter(
                (shift) => shift.employee_id === employee.id,
              );
              const reportRow = report.employees.find(
                (reportEmployee) => reportEmployee.emp.id === employee.id,
              );
              const hours = reportRow ? reportRow.hours : 0;
              const altHours = reportRow ? reportRow.alt : 0;
              // Hours outside the person's min and max are highlighted in amber.
              const isOffTarget =
                hours < employee.min_hours || hours > employee.max_hours;
              const closingCount = countClosingShifts(employee.id);
              // Days worked against the person's minimum (5 for full-timers unless set lower), trainees included.
              const daysWorked = new Set(employeeShifts.map((shift) => shift.day)).size;
              const minimumDays = minDaysFor(employee);
              return (
                <tr key={employee.id} className='align-top'>
                  <td className='px-3 py-2.5'>
                    <div className='truncate font-medium text-slate-900' title={employee.name}>
                      {employee.name}
                    </div>
                    <div className='text-xs text-slate-500'>
                      <span className='mr-1 rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600'>
                        {employee.type}
                      </span>
                      {employee.position}
                    </div>
                  </td>
                  {WORK_DAYS.map((dayNumber) => (
                    <td key={dayNumber} className='px-1.5 py-2.5'>
                      <div className='space-y-1'>
                        {employeeShifts
                          .filter((shift) => shift.day === dayNumber)
                          .map((shift) => (
                            <button
                              key={shift.id}
                              type='button'
                              onClick={() => onEditShift(shift)}
                              disabled={isLocked}
                              title={isLocked ? "Published. Unpublish the week to change shifts." : "Click to change this shift"}
                              className={`block w-full rounded-md px-2 py-1 text-left text-xs ring-1 ring-inset ${isLocked ? "cursor-default" : "hover:brightness-95"} ${shiftChipClasses(shiftKindOf(shift))}`}
                            >
                              {/* Long names such as "Subshop Close (training)" wrap instead of widening the day. */}
                              <div className='break-words font-semibold leading-tight'>{shift.name}</div>
                              <div className='whitespace-nowrap'>
                                {formatTime12(shift.start, true)}–
                                {formatTime12(shift.end, true)}
                              </div>
                            </button>
                          ))}
                      </div>
                    </td>
                  ))}
                  <td
                    className={`px-3 py-2.5 text-right tabular-nums ${isOffTarget ? "font-semibold text-amber-600" : "text-slate-700"}`}
                  >
                    {roundTo2(hours)}
                    <div className='text-xs font-normal text-slate-400'>
                      {employee.min_hours}–{employee.max_hours}
                    </div>
                    {daysWorked < minimumDays && (
                      <div className='text-xs font-semibold text-amber-600'>
                        {daysWorked} of {minimumDays} days
                      </div>
                    )}
                    {payrollNote(employee) && (
                      <div className='text-xs font-normal text-indigo-600'>
                        {payrollNote(employee)}
                      </div>
                    )}
                    {report.showAlt && (
                      <div className='text-xs font-normal text-slate-400'>
                        {roundTo2(altHours)} {altLabel}
                      </div>
                    )}
                    <div
                      className={`text-xs font-normal ${closingCount > closeLimitFor(employee) ? "text-amber-600" : "text-slate-400"}`}
                    >
                      {closingCount} close
                      {closingCount === 1 ? "" : "s"}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phones and tablets: one card per day, listing who works each shift. */}
      <div className='space-y-3 lg:hidden'>
        {days.map((dayRow) => {
          const dayShifts = data.schedule
            .filter((shift) => shift.day === dayRow.day)
            .sort(
              (firstShift, secondShift) =>
                minutesOfDay(firstShift.start) -
                  minutesOfDay(secondShift.start) ||
                firstShift.name.localeCompare(secondShift.name),
            );
          return (
            <div key={dayRow.day} className={`${cardClass} overflow-hidden`}>
              <div className='flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-slate-100 bg-slate-50 px-4 py-2.5'>
                <span className='whitespace-nowrap font-semibold text-slate-900'>
                  {DAY_FULL_NAMES[dayRow.day]}
                  <span className='ml-1.5 font-normal text-slate-500'>
                    {shortDateLabel(dateOfDay(weekStart, dayRow.day))}
                  </span>
                </span>
                <div className='flex items-center gap-3'>
                  {!isLocked && (
                    <button
                      onClick={() => onSwapClosers(dayRow.day)}
                      className='whitespace-nowrap text-xs font-medium text-indigo-600'
                    >
                      Swap closers
                    </button>
                  )}
                  <span
                    className={`whitespace-nowrap text-xs ${dayRow.sched > dayRow.allowed ? "font-semibold text-amber-600" : "text-slate-500"}`}
                  >
                    {roundTo2(dayRow.sched)} of {roundTo2(dayRow.allowed)} hrs
                    {report.showAlt &&
                      ` (${roundTo2(dayRow.schedAlt)} ${altLabel})`}
                  </span>
                </div>
              </div>
              <ul className='divide-y divide-slate-100'>
                {dayShifts.length === 0 && (
                  <li className='px-4 py-3 text-sm text-slate-400'>
                    No shifts
                  </li>
                )}
                {dayShifts.map((shift) => (
                  <li
                    key={shift.id}
                    onClick={() => {
                      if (!isLocked) onEditShift(shift);
                    }}
                    className={`flex items-center justify-between gap-3 px-4 py-2.5 ${isLocked ? "" : "cursor-pointer hover:bg-slate-50"}`}
                  >
                    <div>
                      <div className='text-sm font-medium text-slate-900'>
                        {employeeNameFor(shift.employee_id)}
                      </div>
                      <div className='text-xs text-slate-500'>
                        {formatTime12(shift.start)} – {formatTime12(shift.end)}
                        {hasBreak(shift.start, shift.end, report.rule) &&
                          ` · ${report.rule.minutes} min lunch`}
                      </div>
                    </div>
                    <span
                      className={`rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset ${shiftChipClasses(shiftKindOf(shift))}`}
                    >
                      {shift.name}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </>
  );
}
