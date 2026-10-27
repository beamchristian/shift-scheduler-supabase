// Shapes of the data the app reads from and writes to the database.
// Field names match the database columns exactly, so they are not renamed.

// One row of settings for a department. Holds the forecast, payroll target, and break rules.
export interface Settings {
  id: number;
  // Earliest and latest a shift may start, as "HH:MM".
  earliest_start: string;
  latest_start: string;
  // Target payroll as a percent of sales, for example 15 means 15%.
  payroll_pct: number;
  // Forecast sales for the whole week, in dollars.
  weekly_sales: number;
  // 0 turns off the extra-shifts phase of the generator. Blank or 1 leaves it on.
  fill_extra: number | string | null;
  // Default weekly closing limit for people who do not have their own.
  max_closes: number | string | null;
  // Average hourly rate, in dollars. Used for every person in the department.
  rate_override: number | string | null;
  // Lunch break rule: length in minutes, shift length after which it applies, and whether it is unpaid.
  break_minutes: number | string | null;
  break_after: number | string | null;
  breaks_unpaid: number | string | null;
  // 1 means scheduling logic uses paid hours instead of shift hours.
  count_paid_hours: number | string | null;
  // Title printed at the top of the PDF.
  schedule_title: string | null;
}

// The day weight for one day of the week: its share of the week's sales.
// Stored in the store_hours table. Its open and close columns are no longer used:
// closing time now comes from each day's latest shift template.
export interface StoreHour {
  id: number;
  // 1 = Monday through 6 = Saturday.
  day: number;
  // This day's share of weekly sales, as a number. Shares are compared against each other, not summed to 100.
  sales_pct: number;
}

// One person on the team, with their skills, hours, and availability.
export interface Employee {
  id: number;
  name: string;
  position: string;
  // Full-time or part-time. Part-timers are favored for shorter shifts.
  type: "FT" | "PT";
  min_hours: number;
  max_hours: number;
  // Comma-separated skill tags, for example "slicer, cook".
  skills: string;
  // Comma-separated shift template names this person may work. Blank means any.
  shifts: string | null;
  // Weekly closing limit for this person. Blank uses the department default.
  max_closes: number | string | null;
  // Availability for Monday (1) through Saturday (6). Blank means any time, "off" means unavailable, or a window such as "6am-2pm".
  avail_1: string | null;
  avail_2: string | null;
  avail_3: string | null;
  avail_4: string | null;
  avail_5: string | null;
  avail_6: string | null;
}

// A shift that the schedule needs, for one day, with how many people it needs.
export interface ShiftTemplate {
  id: number;
  name: string;
  day: number;
  start: string;
  end: string;
  // How many people this shift needs.
  needed: number;
  // Skill the person must be tagged with. Blank means none.
  skill: string;
  // Comma-separated names of people this shift is limited to. Blank means anyone.
  only_for: string | null;
}

// One person working one shift on one day in the saved schedule.
export interface ScheduleRow {
  id: number;
  day: number;
  // Which shift template this row was built from.
  template_id: number;
  employee_id: number;
  // Copied from the template, so the row still reads correctly if the template changes later.
  name: string;
  start: string;
  end: string;
}

// Everything the app needs for one department, loaded in one call.
export interface Snapshot {
  settings: Settings;
  store_hours: StoreHour[];
  employees: Employee[];
  shift_templates: ShiftTemplate[];
  schedule: ScheduleRow[];
}

// Tables the page is allowed to edit through the generic save and delete endpoint.
export type TableName =
  | "settings"
  | "store_hours"
  | "employees"
  | "shift_templates";
