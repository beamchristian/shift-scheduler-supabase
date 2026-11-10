"use client";
import { useEffect, type ReactNode } from "react";
import type { Snapshot, TableName } from "../../lib/types";
import { callApi } from "../../lib/ui/format";
import { cardClass, secondaryButtonClass } from "../../lib/ui/styles";
import type { ColumnDefinition, SaveResult, TableRow } from "../types";
import { EditableCell } from "./EditableCell";

// Tailwind needs whole class names written out, so each card width has its own class.
const CARD_SPAN_CLASSES = {
  2: "lg:col-span-2",
  3: "lg:col-span-3",
  4: "lg:col-span-4",
  6: "lg:col-span-6",
};

// An editable table. A table on a computer, and stacked cards on a phone.
// With layout "cards", every screen size gets one card per row, with the fields laid out in a grid that
// wraps to the screen width, so a row with many fields never needs scrolling sideways.
// Saves a row whenever one of its fields changes.
// Props: which table it edits, the week on screen, its columns and rows, the default values for a new row,
// and options for hiding the add/remove buttons, allowing duplicates, highlighting a new row,
// and showing a read-only summary (such as a colored time range) at the start of each row.
export function EditableTable(props: {
  table: TableName;
  // The week on screen, as its Monday. Each save replies with that week's data, so the screen stays on it.
  weekStart: string;
  columns: ColumnDefinition[];
  rows: TableRow[];
  onDataChange: (newSnapshot: Snapshot) => void;
  defaultRow?: TableRow;
  hideActions?: boolean;
  addLabel?: string;
  highlightedId?: number | null;
  onRowAdded?: (newRowId: number) => void;
  canDuplicate?: boolean;
  // Optional read-only summary for a row, shown as the first column on computers and at the top of each phone card.
  renderRowSummary?: (row: TableRow) => ReactNode;
  // Heading for the summary column.
  summaryLabel?: string;
  // "table" (the default) shows a table on computers; "cards" shows wrapping cards everywhere.
  layout?: "table" | "cards";
}) {
  const {
    table,
    weekStart,
    columns,
    rows: rowsToShow,
    onDataChange,
    defaultRow,
    hideActions,
    addLabel,
    highlightedId,
    onRowAdded,
    canDuplicate,
    renderRowSummary,
    summaryLabel,
    layout = "table",
  } = props;
  const isCardLayout = layout === "cards";

  // The Duplicate and Remove buttons for one card in the card layout. Returns the buttons.
  const renderRowButtons = (tableRow: TableRow) => (
    <>
      {canDuplicate && (
        <button
          type='button'
          onClick={() => duplicateRow(tableRow)}
          className='flex-1 rounded-lg border border-indigo-200 px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 lg:flex-none'
        >
          Duplicate
        </button>
      )}
      <button
        type='button'
        onClick={() => deleteRow(tableRow)}
        className='flex-1 rounded-lg border border-rose-200 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 lg:flex-none'
      >
        Remove
      </button>
    </>
  );

  // The fields to show for one row: every column, except those whose showWhen says no for this row.
  const columnsShownFor = (tableRow: TableRow) =>
    columns.filter((column) => !column.showWhen || column.showWhen(tableRow));

  // Saves one row. A row without an id is new, so the id of the row the server created is passed on.
  const saveRow = (rowToSave: TableRow) =>
    callApi<SaveResult>("/api/data", { action: "save", table, row: rowToSave, week: weekStart })
      .then((savedResult) => {
        onDataChange(savedResult);
        if (!rowToSave.id && savedResult.newId) onRowAdded?.(savedResult.newId);
      })
      .catch((thrownError: Error) => alert(thrownError.message));

  // Copies a row as a new row. The id is removed so the server creates a new one.
  const duplicateRow = (rowToCopy: TableRow) => {
    const { id: _removedId, ...rowCopy } = rowToCopy;
    return saveRow(rowCopy);
  };

  // Scrolls a newly added or duplicated row into view, and puts the cursor in its first text box.
  // Both the desktop row and the phone card are checked, because only one of them is visible.
  useEffect(() => {
    if (!highlightedId) return;
    for (const layoutPrefix of ["d", "m"]) {
      const rowElement = document.getElementById(`row-${layoutPrefix}-${table}-${highlightedId}`);
      rowElement?.scrollIntoView({ block: "center", behavior: "smooth" });
      const firstTextInput = rowElement?.querySelector(
        "input[type=text]",
      ) as HTMLInputElement | null;
      firstTextInput?.focus({ preventScroll: true });
      firstTextInput?.select();
    }
  }, [highlightedId, table]);

  // Deletes one row.
  const deleteRow = (rowToDelete: TableRow) =>
    callApi<Snapshot>("/api/data", { action: "delete", table, row: rowToDelete, week: weekStart })
      .then(onDataChange)
      .catch((thrownError: Error) => alert(thrownError.message));

  return (
    <div>
      {/* Desktop: a table. Hidden on phones, and not used at all in the card layout. */}
      {!isCardLayout && (
        <div className={`${cardClass} hidden overflow-x-auto md:block`}>
          <table className='min-w-full divide-y divide-slate-200 text-sm'>
            <thead className='bg-slate-50'>
              <tr>
                {renderRowSummary && (
                  <th className='px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>
                    {summaryLabel}
                  </th>
                )}
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className='px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'
                  >
                    {column.label}
                  </th>
                ))}
                {!hideActions && <th className={canDuplicate ? "w-24" : "w-10"} />}
              </tr>
            </thead>
            <tbody className='divide-y divide-slate-100'>
              {rowsToShow.map((tableRow) => (
                <tr
                  key={tableRow.id}
                  id={`row-d-${table}-${tableRow.id}`}
                  className={`transition-colors ${tableRow.id === highlightedId ? "bg-indigo-50 ring-2 ring-inset ring-indigo-300" : "hover:bg-slate-50/60"}`}
                >
                  {renderRowSummary && (
                    <td className='whitespace-nowrap px-3 py-2 align-middle'>
                      {renderRowSummary(tableRow)}
                    </td>
                  )}
                  {columns.map((column, columnIndex) => (
                    <td key={column.key} className={`px-2 py-2 align-middle ${column.cellClassName ?? ""}`}>
                      {columnIndex === 0 && tableRow.id === highlightedId && (
                        <span className='mb-1 block w-fit rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white'>
                          New
                        </span>
                      )}
                      {!column.showWhen || column.showWhen(tableRow) ? (
                        <EditableCell column={column} row={tableRow} onSaveRow={saveRow} />
                      ) : (
                        <span className='px-1 text-slate-300'>–</span>
                      )}
                    </td>
                  ))}
                  {!hideActions && (
                    <td className='whitespace-nowrap pr-2 text-right'>
                      {canDuplicate && (
                        <button
                          title='Duplicate'
                          aria-label='Duplicate row'
                          onClick={() => duplicateRow(tableRow)}
                          className='rounded-md p-2 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600'
                        >
                          <svg
                            viewBox='0 0 24 24'
                            fill='none'
                            stroke='currentColor'
                            strokeWidth='2'
                            strokeLinecap='round'
                            strokeLinejoin='round'
                            className='h-4 w-4'
                          >
                            <rect x='9' y='9' width='13' height='13' rx='2' />
                            <path d='M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' />
                          </svg>
                        </button>
                      )}
                      <button
                        title='Remove'
                        aria-label='Remove row'
                        onClick={() => deleteRow(tableRow)}
                        className='rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600'
                      >
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Cards: one per row. On phones always; on computers only in the card layout. */}
      <div className={isCardLayout ? "space-y-3" : "space-y-3 md:hidden"}>
        {rowsToShow.map((tableRow) => (
          <div
            key={tableRow.id}
            id={`row-m-${table}-${tableRow.id}`}
            className={`${cardClass} space-y-3 p-4 transition-colors ${tableRow.id === highlightedId ? "bg-indigo-50 ring-2 ring-indigo-300" : ""}`}
          >
            {tableRow.id === highlightedId && (
              <span className='block w-fit rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white'>
                New
              </span>
            )}
            {renderRowSummary?.(tableRow)}
            <div
              className={
                isCardLayout
                  ? "grid gap-x-3 gap-y-3 sm:grid-cols-2 lg:grid-cols-12"
                  : "space-y-3"
              }
            >
              {columnsShownFor(tableRow).map((column) => (
                // Labels wrap to different heights, so each field is a column with the box pushed to the bottom,
                // which keeps the boxes in one line lined up.
                <label
                  key={column.key}
                  className={`flex flex-col ${isCardLayout ? `${column.wide ? "sm:col-span-2" : ""} ${CARD_SPAN_CLASSES[column.cardSpan ?? 2]}` : ""}`}
                >
                  <span className='mb-1 block text-xs font-medium text-slate-500'>
                    {column.label}
                  </span>
                  <div className='mt-auto'>
                    <EditableCell column={column} row={tableRow} onSaveRow={saveRow} />
                  </div>
                </label>
              ))}
              {/* In the card layout the buttons sit in the last three columns of the last line,
                  next to the final fields when there is room, so a card takes no extra line for them. */}
              {isCardLayout && !hideActions && (
                <div className='flex items-end gap-2 sm:col-span-2 lg:col-span-3 lg:col-start-10 lg:justify-end'>
                  {renderRowButtons(tableRow)}
                </div>
              )}
            </div>
            {!isCardLayout && !hideActions && (
              <div className='flex gap-2'>
                {canDuplicate && (
                  <button
                    onClick={() => duplicateRow(tableRow)}
                    className='flex-1 rounded-lg border border-indigo-200 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50'
                  >
                    Duplicate
                  </button>
                )}
                <button
                  onClick={() => deleteRow(tableRow)}
                  className='flex-1 rounded-lg border border-rose-200 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50'
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {!hideActions && defaultRow && (
        <button
          className={`${secondaryButtonClass} mt-3 w-full sm:w-auto`}
          onClick={() => saveRow(defaultRow)}
        >
          + {addLabel || "Add row"}
        </button>
      )}
    </div>
  );
}
