// Helpers for the screen code: calling the server, and formatting times and money.

// Short day names for the columns. Index 1 is Monday.
export const DAY_SHORT_LABELS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Full day names, indexed the same way.
export const DAY_FULL_NAMES = [
  "",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// The days the schedule covers (Monday to Saturday).
export const WORK_DAYS = [1, 2, 3, 4, 5, 6];

// Calls the server and returns the JSON reply.
// Sends a JSON body when one is given, otherwise makes a GET request.
// Throws an error carrying the server's message when the reply is not OK.
export const callApi = async <ResponseType,>(
  url: string,
  requestBody?: unknown,
): Promise<ResponseType> => {
  const response = await fetch(
    url,
    requestBody
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        }
      : undefined,
  );
  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      (responseBody as { error?: string }).error ||
        `Request failed (${response.status})`,
    );
  return responseBody as ResponseType;
};

// Converts "HH:MM" into minutes since midnight, so times can be compared.
export const minutesOfDay = (timeText: string) =>
  +timeText.split(":")[0] * 60 + +timeText.split(":")[1];

// Rounds to two decimals for hours and money-related figures.
export const roundTo2 = (value: number) => +value.toFixed(2);

// Formats a dollar amount with no cents, for example "$1,234".
export const formatMoney = (amount: number) =>
  "$" + Math.round(amount).toLocaleString();

// Formats "HH:MM" as a 12-hour time. Examples: "6:30 AM", or the short form "6:30a".
export const formatTime12 = (timeText: string, useShortForm = false) => {
  const [hourOf24, minuteOf60] = timeText.split(":").map(Number);
  const hourOf12 = hourOf24 % 12 || 12;
  const minuteText = minuteOf60
    ? ":" + String(minuteOf60).padStart(2, "0")
    : useShortForm
      ? ""
      : ":00";
  const meridiemText = useShortForm
    ? hourOf24 >= 12 ? "p" : "a"
    : hourOf24 >= 12 ? " PM" : " AM";
  return `${hourOf12}${minuteText}${meridiemText}`;
};

// Picks the chip colors for a shift by its name: opening, closing, or anything else.
export const shiftChipClasses = (shiftName: string) => {
  const lowerCaseName = shiftName.toLowerCase();
  if (lowerCaseName.includes("open")) return "bg-amber-50 text-amber-900 ring-amber-200";
  if (lowerCaseName.includes("clos")) return "bg-indigo-50 text-indigo-900 ring-indigo-200";
  return "bg-emerald-50 text-emerald-900 ring-emerald-200";
};

// Treats a list of data rows as table rows. The data comes from the server, so its shape is known.
export const asTableRows = <RowType,>(values: unknown) => values as RowType[];
