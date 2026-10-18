"use client";
import { useEffect } from "react";
import type { Snapshot, TableName } from "../../lib/types";
import { callApi } from "../../lib/ui/format";
import { cardClass, secondaryButtonClass } from "../../lib/ui/styles";
import type { ColumnDefinition, SaveResult, TableRow } from "../types";
import { EditableCell } from "./EditableCell";

// An editable table. A table on a computer, and stacked cards on a phone.
// Saves a row whenever one of its fields changes.
// Props: which table it edits, its columns and rows, the default values for a new row,
// and options for hiding the add/remove buttons, allowing duplicates, and highlighting a new row.
export function EditableTable(props: {
  table: TableName;
  columns: ColumnDefinition[];
  rows: TableRow[];
  onDataChange: (newSnapshot: Snapshot) => void;
  defaultRow?: TableRow;
  hideActions?: boolean;
  addLabel?: string;
  highlightedId?: number | null;
  onRowAdded?: (newRowId: number) => void;
  canDuplicate?: boolean;
}) {
  const {
    table,
    columns,
    rows: rowsToShow,
    onDataChange,
    defaultRow,
    hideActions,
    addLabel,
    highlightedId,
    onRowAdded,
    canDuplicate,
  } = props;

  // Saves one row. A row without an id is new, so the id of the row the server created is passed on.
  const saveRow = (rowToSave: TableRow) =>
    callApi<SaveResult>("/api/data", { action: "save", table, row: rowToSave })
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
    callApi<Snapshot>("/api/data", { action: "delete", table, row: rowToDelete })
      .then(onDataChange)
      .catch((thrownError: Error) => alert(thrownError.message));

  return (
    <div>
      {/* Desktop: a table. Hidden on phones. */}
      <div className={`${cardClass} hidden overflow-x-auto md:block`}>
        <table className='min-w-full divide-y divide-slate-200 text-sm'>
          <thead className='bg-slate-50'>
            <tr>
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
                {columns.map((column, columnIndex) => (
                  <td key={column.key} className='px-2 py-2 align-middle'>
                    {columnIndex === 0 && tableRow.id === highlightedId && (
                      <span className='mb-1 block w-fit rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white'>
                        New
                      </span>
                    )}
                    <EditableCell column={column} row={tableRow} onSaveRow={saveRow} />
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

      {/* Phone: one card per row. Hidden on computers. */}
      <div className='space-y-3 md:hidden'>
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
            {columns.map((column) => (
              <label key={column.key} className='block'>
                <span className='mb-1 block text-xs font-medium text-slate-500'>
                  {column.label}
                </span>
                <EditableCell column={column} row={tableRow} onSaveRow={saveRow} />
              </label>
            ))}
            {!hideActions && (
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
