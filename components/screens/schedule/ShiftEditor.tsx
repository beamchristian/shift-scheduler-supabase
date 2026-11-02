"use client";
import { useEffect, useState } from "react";
import type { ScheduleRow, Snapshot } from "../../../lib/types";
import { callApi, formatTime12 } from "../../../lib/ui/format";
import {
  cardClass,
  fieldClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "../../../lib/ui/styles";
import { Callout } from "../../ui/Callout";

// What the server says about a proposed change: errors stop it, warnings are shown but don't.
// renamedTo is the shift's new name when the new times change it between opening, closing and other.
interface ShiftCheck {
  errors: string[];
  warnings: string[];
  renamedTo?: string | null;
}

// The chosen swap, as the picker stores it: "" for none, "shift:<id>" to swap with another shift that day,
// or "person:<id>" to give the shift to someone off that day.
type SwapChoice = "" | `shift:${number}` | `person:${number}`;

// Turns the picker's value into the fields the server expects. Returns an empty object when nothing is chosen.
const swapFields = (swapChoice: SwapChoice) => {
  const [choiceType, idText] = swapChoice.split(":");
  if (choiceType === "shift") return { swapWithShiftId: Number(idText) };
  if (choiceType === "person") return { giveToEmployeeId: Number(idText) };
  return {};
};

// A dialog to change the start and end of one shift, or to swap it with someone else's shift that day,
// or give it to someone who is off. It checks the change as it is made, so warnings about labor, hours,
// closings, and availability appear before saving. Anyone who can open the schedule can edit a shift.
export function ShiftEditor({
  shift,
  data,
  weekStart,
  confirmQuestion,
  personName,
  dayName,
  onClose,
  onSaved,
}: {
  shift: ScheduleRow;
  // The week's data, used to list the shifts and people this shift can be swapped with.
  data: Snapshot;
  // The week the shift is in, as its Monday. Checks and saves are sent for that week.
  weekStart: string;
  // A question to ask before saving (for a week that is already over), or null to save straight away.
  confirmQuestion: string | null;
  personName: string;
  dayName: string;
  onClose: () => void;
  onSaved: (reply: Snapshot & { warnings: string[] }) => void;
}) {
  const [startTime, setStartTime] = useState(shift.start);
  const [endTime, setEndTime] = useState(shift.end);
  const [swapChoice, setSwapChoice] = useState<SwapChoice>("");
  const [check, setCheck] = useState<ShiftCheck | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Who else works this day (to swap with), and who is off this day (to give the shift to).
  const otherShiftsThatDay = data.schedule.filter(
    (scheduleRow) =>
      scheduleRow.day === shift.day &&
      scheduleRow.employee_id !== shift.employee_id,
  );
  const peopleOffThatDay = data.employees.filter(
    (person) =>
      !data.schedule.some(
        (scheduleRow) =>
          scheduleRow.day === shift.day && scheduleRow.employee_id === person.id,
      ),
  );
  // Looks up a person's name from their id.
  const nameOf = (employeeId: number) =>
    data.employees.find((person) => person.id === employeeId)?.name ?? "Unknown";

  // Re-checks the change shortly after it stops changing. Nothing is saved by this check.
  // A chosen swap is checked instead of the times, since only one of them is saved.
  useEffect(() => {
    if (!startTime || !endTime) return;
    const timer = setTimeout(() => {
      setIsChecking(true);
      callApi<ShiftCheck>("/api/schedule", {
        id: shift.id,
        start: startTime,
        end: endTime,
        ...swapFields(swapChoice),
        dryRun: true,
        week: weekStart,
      })
        .then((reply) =>
          setCheck({
            errors: reply.errors,
            warnings: reply.warnings,
            renamedTo: reply.renamedTo,
          }),
        )
        .catch((thrownError: Error) =>
          setCheck({ errors: [thrownError.message], warnings: [] }),
        )
        .finally(() => setIsChecking(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [startTime, endTime, swapChoice, shift.id, weekStart]);

  const hasChanged =
    swapChoice !== "" || startTime !== shift.start || endTime !== shift.end;
  const hasErrors = !!check && check.errors.length > 0;
  const canSave =
    hasChanged &&
    !!startTime &&
    !!endTime &&
    !hasErrors &&
    !isChecking &&
    !isSaving;

  // Saves the new times or the chosen swap, after asking first when the week is already over.
  // The page shows the updated schedule and any warnings.
  const save = () => {
    if (confirmQuestion && !window.confirm(confirmQuestion)) return;
    setIsSaving(true);
    setSaveError(null);
    callApi<Snapshot & { warnings: string[] }>("/api/schedule", {
      id: shift.id,
      start: startTime,
      end: endTime,
      ...swapFields(swapChoice),
      week: weekStart,
    })
      .then((reply) => onSaved(reply))
      .catch((thrownError: Error) => {
        setSaveError(thrownError.message);
        setIsSaving(false);
      });
  };

  return (
    <div
      className='fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4'
      role='dialog'
      aria-modal='true'
      aria-label='Edit shift'
    >
      <div className={`${cardClass} w-full max-w-md space-y-4 p-5`}>
        <div>
          <h3 className='text-base font-semibold text-slate-900'>Edit shift</h3>
          <p className='text-sm text-slate-600'>
            {personName} · {shift.name} · {dayName}
          </p>
        </div>

        <div className='grid grid-cols-2 gap-3'>
          <label className='block'>
            <span className='text-sm font-medium text-slate-700'>Start</span>
            <input
              className={`${fieldClass} mt-1`}
              type='time'
              disabled={swapChoice !== ""}
              value={startTime}
              onChange={(changeEvent) => setStartTime(changeEvent.target.value)}
            />
          </label>
          <label className='block'>
            <span className='text-sm font-medium text-slate-700'>End</span>
            <input
              className={`${fieldClass} mt-1`}
              type='time'
              disabled={swapChoice !== ""}
              value={endTime}
              onChange={(changeEvent) => setEndTime(changeEvent.target.value)}
            />
          </label>
        </div>
        <p className='text-xs text-slate-500'>
          Was {formatTime12(shift.start)} – {formatTime12(shift.end)}
        </p>

        <label className='block'>
          <span className='text-sm font-medium text-slate-700'>
            Swap or give away
          </span>
          <select
            className={`${fieldClass} mt-1`}
            value={swapChoice}
            onChange={(changeEvent) => {
              // A swap keeps the shift's times, so any typed times go back to the saved ones.
              setStartTime(shift.start);
              setEndTime(shift.end);
              setSwapChoice(changeEvent.target.value as SwapChoice);
            }}
          >
            <option value=''>Keep {personName} on this shift</option>
            {otherShiftsThatDay.length > 0 && (
              <optgroup label='Swap with a shift this day'>
                {otherShiftsThatDay.map((otherShift) => (
                  <option key={otherShift.id} value={`shift:${otherShift.id}`}>
                    {nameOf(otherShift.employee_id)}: {otherShift.name}{" "}
                    {formatTime12(otherShift.start)} –{" "}
                    {formatTime12(otherShift.end)}
                  </option>
                ))}
              </optgroup>
            )}
            {peopleOffThatDay.length > 0 && (
              <optgroup label='Give to someone off this day'>
                {peopleOffThatDay.map((person) => (
                  <option key={person.id} value={`person:${person.id}`}>
                    {person.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>

        {check?.renamedTo && swapChoice === "" && (
          <Callout tone='info'>
            The new times make this a different kind of shift, so it will be
            renamed to {check.renamedTo}.
          </Callout>
        )}

        {check && check.errors.length > 0 && (
          <Callout tone='warn'>
            {check.errors.map((errorText) => (
              <div key={errorText}>{errorText}</div>
            ))}
          </Callout>
        )}
        {check && check.warnings.length > 0 && (
          <Callout tone='warn'>
            <div className='mb-1 font-semibold'>
              You can still save this, but check:
            </div>
            <ul className='list-disc space-y-1 pl-5'>
              {check.warnings.map((warningText) => (
                <li key={warningText}>{warningText}</li>
              ))}
            </ul>
          </Callout>
        )}
        {check &&
          check.errors.length === 0 &&
          check.warnings.length === 0 &&
          hasChanged && (
            <Callout tone='ok'>No problems with this change.</Callout>
          )}
        {saveError && <Callout tone='warn'>{saveError}</Callout>}

        <div className='flex items-center justify-between gap-3'>
          <span className='text-xs text-slate-500'>
            {isChecking ? "Checking…" : ""}
          </span>
          <div className='flex gap-2'>
            <button
              className={secondaryButtonClass}
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              className={primaryButtonClass}
              onClick={save}
              disabled={!canSave}
            >
              {isSaving ? "Saving…" : "Save shift"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
