"use client";
import type { Snapshot } from "../../lib/types";
import { asTableRows } from "../../lib/ui/format";
import {
  cardClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "../../lib/ui/styles";
import { EditableTable } from "../EditableTable/EditableTable";
import type { ColumnDefinition, TableRow } from "../types";
import { Callout } from "../ui/Callout";
import { Heading } from "../ui/Heading";
import { RecentChanges } from "./RecentChanges";

// Settings for payroll and the shift start window.
const PAYROLL_COLUMNS: ColumnDefinition[] = [
  {
    key: "payroll_pct",
    label: "Target payroll (% of sales)",
    inputType: "number",
  },
  {
    key: "fill_extra",
    label: "Fill extra shifts to budget (1 = yes, 0 = no)",
    inputType: "number",
  },
  {
    key: "max_closes",
    label: "Default max closing shifts per person per week (0 = no limit)",
    inputType: "number",
  },
  {
    key: "rate_override",
    label: "Average hourly rate (used for all payroll cost)",
    inputType: "number",
  },
  { key: "earliest_start", label: "Earliest shift start", inputType: "time" },
  { key: "latest_start", label: "Latest shift start", inputType: "time" },
];

// Settings for lunch breaks and the printed PDF.
const BREAK_COLUMNS: ColumnDefinition[] = [
  { key: "break_minutes", label: "Lunch break (minutes)", inputType: "number" },
  {
    key: "break_after",
    label: "Applies to shifts longer than (hours)",
    inputType: "number",
  },
  {
    key: "breaks_unpaid",
    label: "Lunch is unpaid? (1 = yes, 0 = no)",
    inputType: "number",
  },
  {
    key: "count_paid_hours",
    label: "Run budget and min/max on paid hours? (0 = no, use shift hours)",
    inputType: "number",
  },
  { key: "schedule_title", label: "Schedule title printed on the PDF" },
];

// The Settings screen: payroll, lunch, export/import of all data, and the list of recent changes.
// Day weights are set in the labor matrix on the Schedule screen.
export function SettingsScreen({
  weekStart,
  data,
  onDataChange,
  isImporting,
  backupMessage,
  onImportFile,
}: {
  // The week on screen, as its Monday. Saves reply with that week's data.
  weekStart: string;
  data: Snapshot;
  onDataChange: (newSnapshot: Snapshot) => void;
  isImporting: boolean;
  backupMessage: { tone: "ok" | "warn" | "info"; text: string } | null;
  onImportFile: (selectedFile: File | undefined) => void;
}) {
  return (
    <>
      <Heading title='Store and payroll'>
        Payroll target, shift start window, lunch breaks, and backups. Each
        day's share of the week's sales is set in the labor matrix on the
        Schedule screen.
      </Heading>
      <h2 className='mb-2 text-sm font-semibold text-slate-700'>
        Payroll and start window
      </h2>
      <EditableTable
        weekStart={weekStart}
        table='settings'
        hideActions
        columns={PAYROLL_COLUMNS}
        rows={asTableRows<TableRow>([data.settings])}
        onDataChange={onDataChange}
      />

      <h2 className='mb-2 mt-8 text-sm font-semibold text-slate-700'>
        Lunch breaks and printing
      </h2>
      <EditableTable
        weekStart={weekStart}
        table='settings'
        hideActions
        columns={BREAK_COLUMNS}
        rows={asTableRows<TableRow>([data.settings])}
        onDataChange={onDataChange}
      />
      <p className='mt-2 text-xs text-slate-500'>
        By default the budget, payroll and each person's min and max hours all
        run on scheduled shift hours, and the paid figure (lunch deducted) is
        shown in grey for reference. Set the last option to 1 to run everything
        on paid hours instead.
      </p>

      <h2 className='mb-2 mt-8 text-sm font-semibold text-slate-700'>
        Backup and transfer
      </h2>
      <div className={`${cardClass} space-y-3 p-4`}>
        <p className='text-sm text-slate-600'>
          Export everything (employees, availability, shift templates, settings,
          day weights and every saved week, with its status and schedule) to a
          single file. Import it later, or on another computer, to restore it.
          Importing replaces all current data, including every saved week.
        </p>
        <div className='flex flex-col gap-2 sm:flex-row'>
          <a
            href='/api/export'
            download
            className={`${primaryButtonClass} w-full sm:w-auto`}
          >
            Export all data
          </a>
          <label
            htmlFor='import-file'
            className={`${secondaryButtonClass} w-full cursor-pointer sm:w-auto ${isImporting ? "pointer-events-none opacity-50" : ""}`}
          >
            {isImporting ? "Importing…" : "Import from file"}
          </label>
          <input
            id='import-file'
            type='file'
            accept='application/json,.json'
            className='hidden'
            disabled={isImporting}
            onChange={(changeEvent) => {
              onImportFile(changeEvent.target.files?.[0]);
              changeEvent.target.value = "";
            }}
          />
        </div>
        {backupMessage && (
          <Callout tone={backupMessage.tone}>{backupMessage.text}</Callout>
        )}
      </div>

      <h2 className='mb-2 mt-8 text-sm font-semibold text-slate-700'>
        Recent changes
      </h2>
      <p className='mb-2 text-sm text-slate-600'>
        The last 50 changes in this department: who made them, when, and what
        changed.
      </p>
      <RecentChanges reloadSignal={data} />
    </>
  );
}
