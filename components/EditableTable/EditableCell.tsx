"use client";
import { DAY_FULL_NAMES, splitCommaList } from "../../lib/ui/format";
import { fieldClass } from "../../lib/ui/styles";
import type { ColumnDefinition, TableRow } from "../types";
import { TagsInput } from "../ui/TagsInput";

// One editable cell. Shows a dropdown, a text box or a plain label, depending on the column.
// Saves the whole row when the value changes.
export function EditableCell({
  column,
  row,
  onSaveRow,
}: {
  column: ColumnDefinition;
  row: TableRow;
  onSaveRow: (row: TableRow) => void;
}) {
  // Read-only columns show a plain label. The day column shows the full day name.
  if (column.readOnly)
    return (
      <span className='font-medium text-slate-900'>
        {column.key === "day"
          ? DAY_FULL_NAMES[Number(row[column.key])]
          : String(row[column.key] ?? "")}
      </span>
    );
  // Comma-separated lists show as removable chips. Each change is saved as a comma-separated text value.
  if (column.inputType === "tags")
    return (
      <TagsInput
        values={splitCommaList(row[column.key])}
        suggestions={column.suggestions}
        placeholder={column.placeholder}
        onChange={(newValues) =>
          onSaveRow({ ...row, [column.key]: newValues.join(", ") })
        }
      />
    );
  // Columns with a fixed list of choices show a dropdown.
  if (column.options)
    return (
      <select
        className={fieldClass}
        defaultValue={String(row[column.key])}
        onChange={(changeEvent) =>
          onSaveRow({ ...row, [column.key]: changeEvent.target.value })
        }
      >
        {column.options.map((optionValue) => (
          <option key={optionValue} value={optionValue}>
            {column.formatOption ? column.formatOption(optionValue) : optionValue}
          </option>
        ))}
      </select>
    );
  // Everything else is a text or number box.
  return (
    <input
      className={fieldClass}
      type={column.inputType || "text"}
      step={column.inputType === "number" ? "any" : undefined}
      inputMode={column.inputType === "number" ? "decimal" : undefined}
      placeholder={column.placeholder}
      defaultValue={row[column.key] ?? ""}
      onBlur={(blurEvent) => {
        // Only save when the text really changed.
        if (blurEvent.target.value !== String(row[column.key] ?? ""))
          onSaveRow({ ...row, [column.key]: blurEvent.target.value });
      }}
    />
  );
}
