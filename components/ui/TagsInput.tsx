"use client";
import { useEffect, useId, useState } from "react";

// A row of removable chips with a box to add more.
// Press Enter or comma to add what was typed, or leave the box to add it. Backspace in an empty box
// removes the last chip. Chips update at once; the saved copy replaces them when it arrives.
export function TagsInput({
  values,
  suggestions = [],
  placeholder,
  onChange,
}: {
  values: string[];
  suggestions?: string[];
  placeholder?: string;
  onChange: (newValues: string[]) => void;
}) {
  // The chips on screen. They follow the saved values, but change right away when the person edits.
  const [chipValues, setChipValues] = useState<string[]>(values);
  // What is typed in the box, before it becomes a chip.
  const [draftText, setDraftText] = useState("");
  // Links the box to its list of suggestions.
  const suggestionListId = useId();

  useEffect(() => {
    setChipValues(values);
  }, [values]);

  // Updates the chips on screen and passes the new list up to be saved.
  const commitChips = (newChipValues: string[]) => {
    setChipValues(newChipValues);
    onChange(newChipValues);
  };

  // Turns the typed text into a chip. A duplicate (ignoring case) is not added twice.
  const addDraftChip = () => {
    const newChipText = draftText.trim();
    setDraftText("");
    if (!newChipText) return;
    const alreadyAdded = chipValues.some(
      (chipText) => chipText.toLowerCase() === newChipText.toLowerCase(),
    );
    if (!alreadyAdded) commitChips([...chipValues, newChipText]);
  };

  // Suggestions that are not already chips.
  const availableSuggestions = suggestions.filter(
    (suggestionText) =>
      !chipValues.some((chipText) => chipText.toLowerCase() === suggestionText.toLowerCase()),
  );

  return (
    <div className='flex min-w-[12rem] flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-1.5 shadow-sm focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20'>
      {chipValues.map((chipText, chipIndex) => (
        <span
          key={`${chipText}-${chipIndex}`}
          className='inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-800 ring-1 ring-inset ring-indigo-200'
        >
          {chipText}
          <button
            type='button'
            aria-label={`Remove ${chipText}`}
            onClick={() => commitChips(chipValues.filter((_, indexToKeep) => indexToKeep !== chipIndex))}
            className='rounded-full px-0.5 text-indigo-400 hover:text-rose-600'
          >
            ✕
          </button>
        </span>
      ))}
      <input
        type='text'
        list={suggestionListId}
        value={draftText}
        placeholder={chipValues.length ? "Add…" : placeholder}
        onChange={(changeEvent) => setDraftText(changeEvent.target.value)}
        onKeyDown={(keyEvent) => {
          if (keyEvent.key === "Enter" || keyEvent.key === ",") {
            keyEvent.preventDefault();
            addDraftChip();
          } else if (keyEvent.key === "Backspace" && draftText === "" && chipValues.length) {
            commitChips(chipValues.slice(0, -1));
          }
        }}
        onBlur={addDraftChip}
        className='min-w-[6rem] flex-1 bg-transparent py-1 text-sm text-slate-900 outline-none placeholder:text-slate-400'
      />
      <datalist id={suggestionListId}>
        {availableSuggestions.map((suggestionText) => (
          <option key={suggestionText} value={suggestionText} />
        ))}
      </datalist>
    </div>
  );
}
