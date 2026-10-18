"use client";
import { useEffect, useState } from "react";
import type { ScheduleRow, Snapshot } from "../../../lib/types";
import { callApi, formatTime12 } from "../../../lib/ui/format";
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from "../../../lib/ui/styles";
import { Callout } from "../../ui/Callout";

// What the server says about a proposed change: errors stop it, warnings are shown but don't.
interface ShiftCheck {
  errors: string[];
  warnings: string[];
}

// A dialog to change the start and end of one shift. It checks the change as the times are typed,
// so warnings about labor, hours, closings, and availability appear before saving.
// Anyone who can open the schedule can edit a shift.
export function ShiftEditor({
  shift,
  personName,
  dayName,
  onClose,
  onSaved,
}: {
  shift: ScheduleRow;
  personName: string;
  dayName: string;
  onClose: () => void;
  onSaved: (reply: Snapshot & { warnings: string[] }) => void;
}) {
  const [startTime, setStartTime] = useState(shift.start);
  const [endTime, setEndTime] = useState(shift.end);
  const [check, setCheck] = useState<ShiftCheck | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Re-checks the change shortly after the times stop changing. Nothing is saved by this check.
  useEffect(() => {
    if (!startTime || !endTime) return;
    const timer = setTimeout(() => {
      setIsChecking(true);
      callApi<{ errors: string[]; warnings: string[] }>("/api/schedule", {
        id: shift.id,
        start: startTime,
        end: endTime,
        dryRun: true,
      })
        .then((reply) => setCheck({ errors: reply.errors, warnings: reply.warnings }))
        .catch((thrownError: Error) => setCheck({ errors: [thrownError.message], warnings: [] }))
        .finally(() => setIsChecking(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [startTime, endTime, shift.id]);

  const hasChanged = startTime !== shift.start || endTime !== shift.end;
  const hasErrors = !!check && check.errors.length > 0;
  const canSave = hasChanged && !!startTime && !!endTime && !hasErrors && !isChecking && !isSaving;

  // Saves the new times. The page shows the updated schedule and any warnings.
  const save = () => {
    setIsSaving(true);
    setSaveError(null);
    callApi<Snapshot & { warnings: string[] }>("/api/schedule", {
      id: shift.id,
      start: startTime,
      end: endTime,
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
              value={startTime}
              onChange={(changeEvent) => setStartTime(changeEvent.target.value)}
            />
          </label>
          <label className='block'>
            <span className='text-sm font-medium text-slate-700'>End</span>
            <input
              className={`${fieldClass} mt-1`}
              type='time'
              value={endTime}
              onChange={(changeEvent) => setEndTime(changeEvent.target.value)}
            />
          </label>
        </div>
        <p className='text-xs text-slate-500'>
          Was {formatTime12(shift.start)} – {formatTime12(shift.end)}
        </p>

        {check && check.errors.length > 0 && (
          <Callout tone='warn'>
            {check.errors.map((errorText) => (
              <div key={errorText}>{errorText}</div>
            ))}
          </Callout>
        )}
        {check && check.warnings.length > 0 && (
          <Callout tone='warn'>
            <div className='mb-1 font-semibold'>You can still save this, but check:</div>
            <ul className='list-disc space-y-1 pl-5'>
              {check.warnings.map((warningText) => (
                <li key={warningText}>{warningText}</li>
              ))}
            </ul>
          </Callout>
        )}
        {check && check.errors.length === 0 && check.warnings.length === 0 && hasChanged && (
          <Callout tone='ok'>No problems with this change.</Callout>
        )}
        {saveError && <Callout tone='warn'>{saveError}</Callout>}

        <div className='flex items-center justify-between gap-3'>
          <span className='text-xs text-slate-500'>{isChecking ? "Checking…" : ""}</span>
          <div className='flex gap-2'>
            <button className={secondaryButtonClass} onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button className={primaryButtonClass} onClick={save} disabled={!canSave}>
              {isSaving ? "Saving…" : "Save shift"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
