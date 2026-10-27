"use client";
import { useState, type ReactNode } from "react";
import { buildReport } from "../../lib/report";
import type { ScheduleRow, Snapshot, StoreHour } from "../../lib/types";
import { DAY_FULL_NAMES, formatMoney, roundTo2 } from "../../lib/ui/format";
import {
  cardClass,
  fieldClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "../../lib/ui/styles";
import type { StaffingCheck } from "../types";
import { Callout } from "../ui/Callout";
import { Heading } from "../ui/Heading";
import { StatTile } from "../ui/StatTile";
import { LaborMatrix } from "./schedule/LaborMatrix";
import { ScheduleGrid } from "./schedule/ScheduleGrid";
import { ShiftEditor } from "./schedule/ShiftEditor";
import { buildCoverageNotes } from "./schedule/coverageNotes";
import { dateOfDay, shortDateLabel, weekLabel } from "../../lib/weeks";

// The Schedule screen for one week: the week picker, the week's forecast, the budget summary, the staffing check,
// the labor matrix, and the generated schedule.
export function ScheduleScreen({
  data,
  weekBar,
  isLocked,
  pastWeekQuestion,
  staffingCheck,
  warnings,
  isGenerating,
  swapMessage,
  onGenerate,
  onSaveForecast,
  onSwapClosers,
  onShiftSaved,
  onSaveDayWeight,
}: {
  data: Snapshot;
  // The week picker shown at the top of the screen.
  weekBar: ReactNode;
  // True when the week is published, so nothing on it can be changed until it is unpublished.
  isLocked: boolean;
  // The question to ask before changing a week that is already over, or null for a current or future week.
  pastWeekQuestion: string | null;
  staffingCheck: StaffingCheck | null;
  warnings: string[];
  isGenerating: boolean;
  swapMessage: { tone: "ok" | "warn"; text: string } | null;
  onGenerate: () => void;
  // Returns false when the save was cancelled, so the box goes back to the saved value.
  onSaveForecast: (forecastText: string) => boolean;
  onSwapClosers: (dayNumber: number) => void;
  onShiftSaved: (reply: Snapshot) => void;
  // Saves one day's weight from the labor matrix.
  onSaveDayWeight: (dayWeightRow: StoreHour, newWeightText: string) => void;
}) {
  // The shift being edited, and any warnings left by the last saved change.
  const [editingShift, setEditingShift] = useState<ScheduleRow | null>(null);
  const [savedShiftWarnings, setSavedShiftWarnings] = useState<string[]>([]);
  // The week on screen, as its Monday.
  const weekStart = data.week.week_start;
  // Figures for the summary tiles, computed from this week's data.
  const report = buildReport(data);
  const rate = report.rate;
  const totals = report.totals;
  const requiredTotal = totals.req;
  const requiredCost = totals.reqCost;
  const allowedTotal = totals.allowed;
  const scheduledHoursTotal = totals.sched;
  const scheduledCost = totals.schedCost;
  const totalSales = totals.sales;
  // The week's own forecast and payroll target (a published week keeps the ones it was published with).
  const payrollPercent = report.payrollPercent;
  const weeklySales = report.weeklySales;
  const isOverBudget = requiredTotal > allowedTotal;
  // Full-coverage cost as a share of the forecast.
  const requiredCostPercent = weeklySales
    ? (requiredCost / weeklySales) * 100
    : 0;
  const coverageNotes = buildCoverageNotes(data, report);

  // Counts the unfilled shifts by name, so "Mon Opener x2" can be shown.
  const unfilledCounts: Record<string, number> = {};
  for (const unfilledName of staffingCheck?.unfilled ?? [])
    unfilledCounts[unfilledName] = (unfilledCounts[unfilledName] || 0) + 1;

  // Wording for the figures that are shown alongside the main ones.
  const alternateLabel = report.rule.countPaid ? "shift" : "paid";
  const costSubtitle = `${report.showAlt ? `${formatMoney(totals.reqCostAlt)} ${alternateLabel}, ` : ""}at $${rate.toFixed(2)}/hr average`;
  const scheduledSubtitle = [
    `${roundTo2(scheduledHoursTotal)} hrs`,
    totalSales
      ? `${((scheduledCost / totalSales) * 100).toFixed(1)}% of sales`
      : "",
    report.showAlt
      ? `${formatMoney(totals.schedCostAlt)} ${alternateLabel}${totalSales ? ` (${((totals.schedCostAlt / totalSales) * 100).toFixed(1)}%)` : ""}`
      : "",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <Heading title='Weekly schedule'>
        Pick the week, enter its forecast, review what full coverage costs,
        then generate.
      </Heading>

      {weekBar}

      {isLocked && (
        <div className='mb-4'>
          <Callout tone='ok'>
            This week is published, so its schedule, forecast and day weights
            are locked. To change anything, click Unpublish in the week bar
            first.
          </Callout>
        </div>
      )}
      {!isLocked && pastWeekQuestion && (
        <div className='mb-4'>
          <Callout tone='warn'>
            This week is already over. You can still change it, but each
            change asks you to confirm first.
          </Callout>
        </div>
      )}

      <div
        className={`${cardClass} mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between`}
      >
        <label className='block'>
          <span className='text-sm font-medium text-slate-700'>
            Forecast sales for {weekLabel(weekStart)}
          </span>
          <div className='relative mt-1 w-full sm:w-52'>
            <span className='pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400'>
              $
            </span>
            <input
              className={`${fieldClass} pl-7 disabled:bg-slate-100 disabled:text-slate-500`}
              type='number'
              inputMode='decimal'
              // The key resets the box when the week or its saved forecast changes.
              key={`${data.week.week_start}-${weeklySales}`}
              defaultValue={weeklySales}
              disabled={isLocked}
              onBlur={(blurEvent) => {
                if (!onSaveForecast(blurEvent.target.value))
                  blurEvent.target.value = String(weeklySales);
              }}
            />
          </div>
        </label>
        <div className='flex flex-col gap-2 sm:flex-row'>
          <a
            href={`/api/pdf?week=${weekStart}`}
            target='_blank'
            rel='noopener noreferrer'
            className={`${secondaryButtonClass} w-full sm:w-auto`}
          >
            Download PDF
          </a>
          <button
            className={`${primaryButtonClass} w-full disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto`}
            onClick={onGenerate}
            disabled={isGenerating || isLocked}
            title={isLocked ? "Unpublish this week to generate it again" : undefined}
          >
            {isGenerating ? "Generating…" : "Generate schedule"}
          </button>
        </div>
      </div>

      <div className='mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4'>
        <StatTile
          label='Hours to fully staff'
          value={String(roundTo2(requiredTotal))}
          sub={`${report.showAlt ? `${roundTo2(totals.reqAlt)} ${alternateLabel}, ` : ""}${roundTo2(allowedTotal)} allowed`}
          isWarning={isOverBudget}
        />
        <StatTile
          label='Cost to fully staff'
          value={formatMoney(requiredCost)}
          sub={costSubtitle}
        />
        <StatTile
          label='Share of forecast'
          value={`${requiredCostPercent.toFixed(1)}%`}
          sub={`target ${payrollPercent}%`}
          isWarning={requiredCostPercent > payrollPercent}
        />
        <StatTile
          label='Scheduled so far'
          value={formatMoney(scheduledCost)}
          sub={scheduledSubtitle}
        />
      </div>

      <div className='mb-4 space-y-2'>
        {isOverBudget ? (
          <Callout tone='warn'>
            Full coverage is {roundTo2(requiredTotal - allowedTotal)} hrs over
            budget. At {payrollPercent}% payroll you would need about $
            {payrollPercent > 0
              ? Math.ceil(
                  requiredCost / (payrollPercent / 100),
                ).toLocaleString()
              : 0}{" "}
            in weekly sales to afford it, or raise the payroll target to{" "}
            {requiredCostPercent.toFixed(1)}%.
          </Callout>
        ) : (
          <Callout tone='ok'>
            Within budget, with {roundTo2(allowedTotal - requiredTotal)} hrs to
            spare.
            {Number(data.settings.fill_extra) !== 0 &&
              " Generate adds extra shifts up to each day budget, weighted toward your busiest days."}
          </Callout>
        )}
        {coverageNotes.map((noteText, noteIndex) => (
          <Callout key={noteIndex} tone='warn'>
            {noteText}
          </Callout>
        ))}
        {staffingCheck?.config.map((configText, configIndex) => (
          <Callout key={configIndex} tone='warn'>
            {configText}
          </Callout>
        ))}
        {staffingCheck &&
          (staffingCheck.unfilled.length === 0 ? (
            <Callout tone='ok'>
              Your team can cover every required shift, ignoring payroll.
            </Callout>
          ) : (
            <Callout tone='warn'>
              Even with no payroll limit, your team cannot cover:{" "}
              {Object.entries(unfilledCounts)
                .map(
                  ([shiftName, count]) =>
                    `${shiftName}${count > 1 ? ` x${count}` : ""}`,
                )
                .join(", ")}
              . Your team can cover {staffingCheck.capacity} of the{" "}
              {staffingCheck.needed} required shifts.
              {/* Why each shift is open, so the fix is clear without guessing. */}
              {(staffingCheck.unfilledReasons ?? []).length > 0 && (
                <ul className='mt-2 list-disc space-y-1 pl-5'>
                  {staffingCheck.unfilledReasons!.map((reasonText) => (
                    <li key={reasonText}>{reasonText}</li>
                  ))}
                </ul>
              )}
            </Callout>
          ))}
        {staffingCheck && staffingCheck.underMin.length > 0 && (
          <Callout tone='warn'>
            Likely under minimum hours: {staffingCheck.underMin.join(", ")}.
          </Callout>
        )}
      </div>

      {staffingCheck && staffingCheck.suggestions.length > 0 && (
        <div className={`${cardClass} mb-4 p-4`}>
          <h2 className='text-sm font-semibold text-slate-900'>
            Ways to fix it
          </h2>
          <ul className='mt-2 divide-y divide-slate-100'>
            {staffingCheck.suggestions.map((suggestion, suggestionIndex) => (
              <li key={suggestionIndex} className='py-2.5 text-sm'>
                <span className='font-semibold text-slate-900'>
                  {suggestion.title}.
                </span>{" "}
                <span className='text-slate-600'>{suggestion.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className='mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4'>
          <h2 className='text-sm font-semibold text-amber-900'>
            Generated with {warnings.length} warning
            {warnings.length > 1 ? "s" : ""}
          </h2>
          <ul className='mt-1 list-disc space-y-0.5 pl-5 text-sm text-amber-900'>
            {warnings.map((warningText, warningIndex) => (
              <li key={warningIndex}>{warningText}</li>
            ))}
          </ul>
        </div>
      )}

      {savedShiftWarnings.length > 0 && (
        <div className='mb-3'>
          <Callout tone='warn'>
            <div className='mb-1 font-semibold'>Shift saved. Check these:</div>
            <ul className='list-disc space-y-1 pl-5'>
              {savedShiftWarnings.map((warningText) => (
                <li key={warningText}>{warningText}</li>
              ))}
            </ul>
          </Callout>
        </div>
      )}
      {editingShift && (
        <ShiftEditor
          shift={editingShift}
          personName={
            data.employees.find(
              (person) => person.id === editingShift.employee_id,
            )?.name ?? "Unknown"
          }
          weekStart={weekStart}
          confirmQuestion={pastWeekQuestion}
          dayName={`${DAY_FULL_NAMES[editingShift.day] ?? ""}, ${shortDateLabel(dateOfDay(weekStart, editingShift.day))}`}
          onClose={() => setEditingShift(null)}
          onSaved={(reply) => {
            setSavedShiftWarnings(reply.warnings);
            setEditingShift(null);
            onShiftSaved(reply);
          }}
        />
      )}
      <LaborMatrix
        report={report}
        weekStart={weekStart}
        isLocked={isLocked}
        dayWeights={report.dayWeights}
        onSaveDayWeight={onSaveDayWeight}
      />

      <h2 className='mb-2 mt-8 text-sm font-semibold text-slate-700'>
        Schedule
      </h2>
      {data.schedule.length === 0 && (
        <div className={`${cardClass} p-8 text-center text-sm text-slate-500`}>
          No schedule for {weekLabel(weekStart)} yet. Click Generate schedule
          to build one.
        </div>
      )}
      {data.schedule.length > 0 && (
        <ScheduleGrid
          data={data}
          weekStart={weekStart}
          isLocked={isLocked}
          report={report}
          swapMessage={swapMessage}
          onSwapClosers={onSwapClosers}
          onEditShift={(shift) => {
            setSavedShiftWarnings([]);
            setEditingShift(shift);
          }}
        />
      )}
    </>
  );
}
