import postgres from "postgres";
import type {
  Employee,
  ScheduleRow,
  Settings,
  ShiftTemplate,
  Snapshot,
  StoreHour,
  TableName,
} from "./types";

// Minimal view of the postgres.js client. Keeping it narrow means the rest of the app never touches its types.
interface Pg {
  unsafe(text: string, params?: unknown[]): Promise<unknown[]>;
  begin<T>(fn: (tx: Pg) => Promise<T>): Promise<T>;
}

const g = globalThis as unknown as { _pg?: Pg; _seeded?: Promise<void> };
const url = process.env.DATABASE_URL;
if (!g._pg) {
  g._pg = postgres(url || "postgres://missing:missing@localhost:5432/missing", {
    prepare: false, // required for Supabase's transaction pooler
    max: 3, // a few connections so one slow request does not block the rest
    idle_timeout: 20,
    connect_timeout: 15,
    ssl: url && !/localhost|127\.0\.0\.1/.test(url) ? "require" : false,
  }) as unknown as Pg;
}
const client = g._pg as Pg;

export type Row = Record<string, unknown>;
export type Q = <T = Row>(
  text: string,
  params?: (string | number | null)[],
) => Promise<T[]>;
const make =
  (c: Pg): Q =>
  async <T = Row>(text: string, params: (string | number | null)[] = []) =>
    (await c.unsafe(text, params)) as T[];

export const q: Q = make(client);
export const transaction = <T>(fn: (tx: Q) => Promise<T>): Promise<T> =>
  client.begin((t) => fn(make(t)));
export const errMsg = (e: unknown) =>
  e instanceof Error ? e.message : String(e);

export const COLS: Record<TableName, string[]> = {
  settings: [
    "weekly_sales",
    "payroll_pct",
    "rate_override",
    "fill_extra",
    "max_closes",
    "break_minutes",
    "break_after",
    "breaks_unpaid",
    "count_paid_hours",
    "schedule_title",
    "earliest_start",
    "latest_start",
  ],
  store_hours: ["day", "open", "close", "sales_pct"],
  employees: [
    "name",
    "position",
    "type",
    "min_hours",
    "max_hours",
    "skills",
    "shifts",
    "max_closes",
    "avail_1",
    "avail_2",
    "avail_3",
    "avail_4",
    "avail_5",
    "avail_6",
  ],
  shift_templates: [
    "name",
    "day",
    "start",
    "end",
    "needed",
    "skill",
    "only_for",
  ],
};

// Numeric columns arrive from the UI as text ("" when cleared); convert them so Postgres accepts them.
const INT = new Set(["day", "needed", "template_id", "employee_id"]);
const NUM = new Set([
  "weekly_sales",
  "payroll_pct",
  "rate_override",
  "fill_extra",
  "max_closes",
  "sales_pct",
  "min_hours",
  "max_hours",
  "break_minutes",
  "break_after",
  "breaks_unpaid",
  "count_paid_hours",
]);
export function coerce(col: string, v: unknown): string | number | null {
  if (v === undefined || v === null) return null;
  if (INT.has(col) || NUM.has(col)) {
    if (String(v).trim() === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`"${col}" must be a number.`);
    return INT.has(col) ? Math.round(n) : n;
  }
  return String(v);
}

async function seed() {
  await q("insert into settings (id) values (1) on conflict (id) do nothing");
  const c = await q<{ n: number }>(
    "select count(*)::int as n from store_hours",
  );
  if (!c[0].n)
    await q(`insert into store_hours (day, "open", "close", sales_pct) values
      (1,'06:00','20:00',19),(2,'06:00','20:00',15.5),(3,'06:00','20:00',14),(4,'06:00','20:00',15),(5,'06:00','20:00',17),(6,'06:00','20:00',19.5)`);
}
// Makes sure the one settings row and the six store-hours rows exist, once per server instance.
export function ensureSeed(): Promise<void> {
  if (!g._seeded)
    g._seeded = seed().catch((e) => {
      g._seeded = undefined;
      throw e;
    });
  return g._seeded;
}

// Everything the app needs, in one round trip to the database.
export async function snapshot(): Promise<Snapshot> {
  await ensureSeed();
  const r = await q<Snapshot>(`select
    (select to_jsonb(s) from settings s where s.id = 1) as settings,
    (select coalesce(jsonb_agg(to_jsonb(h) order by h.day), '[]'::jsonb) from store_hours h where h.department_id = 1) as store_hours,
    (select coalesce(jsonb_agg(to_jsonb(e) order by e.id), '[]'::jsonb) from employees e where e.department_id = 1) as employees,
    (select coalesce(jsonb_agg(to_jsonb(t) order by t.day, t."start", t.name, t.id), '[]'::jsonb) from shift_templates t where t.department_id = 1) as shift_templates,
    (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb) from schedule x where x.department_id = 1) as schedule`);
  return r[0];
}
