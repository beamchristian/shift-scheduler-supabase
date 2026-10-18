export interface Settings {
  id: number;
  earliest_start: string;
  latest_start: string;
  payroll_pct: number;
  weekly_sales: number;
  fill_extra: number | string | null;
  max_closes: number | string | null;
  rate_override: number | string | null;
  break_minutes: number | string | null;
  break_after: number | string | null;
  breaks_unpaid: number | string | null;
  count_paid_hours: number | string | null;
  schedule_title: string | null;
}
export interface StoreHour {
  id: number;
  day: number;
  open: string;
  close: string;
  sales_pct: number;
}
export interface Employee {
  id: number;
  name: string;
  position: string;
  type: "FT" | "PT";
  min_hours: number;
  max_hours: number;
  skills: string;
  shifts: string | null;
  max_closes: number | string | null;
  avail_1: string | null;
  avail_2: string | null;
  avail_3: string | null;
  avail_4: string | null;
  avail_5: string | null;
  avail_6: string | null;
}
export interface ShiftTemplate {
  id: number;
  name: string;
  day: number;
  start: string;
  end: string;
  needed: number;
  skill: string;
  only_for: string | null;
}
export interface ScheduleRow {
  id: number;
  day: number;
  template_id: number;
  employee_id: number;
  name: string;
  start: string;
  end: string;
}
export interface Snapshot {
  settings: Settings;
  store_hours: StoreHour[];
  employees: Employee[];
  shift_templates: ShiftTemplate[];
  schedule: ScheduleRow[];
}
export type TableName =
  | "settings"
  | "store_hours"
  | "employees"
  | "shift_templates";
