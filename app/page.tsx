"use client";
import { useEffect, useState, type ReactNode } from "react";
import { buildReport } from "../lib/report";
import { hasBreak } from "../lib/hours";
import type { Snapshot, TableName } from "../lib/types";

const D = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FULL = [
  "",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const DAYS = [1, 2, 3, 4, 5, 6];

type Cell = string | number | null;
type Row = { id?: number } & Record<string, Cell>;
type Col = {
  k: string;
  l: string;
  t?: string;
  ro?: boolean;
  ph?: string;
  opts?: (string | number)[];
  fmt?: (v: string | number) => string;
};
type Result = Snapshot & { warnings?: string[] };
type Saved = Snapshot & { newId?: number };
type Check = {
  unfilled: string[];
  underMin: string[];
  capacity: number;
  needed: number;
  config: string[];
  suggestions: { title: string; detail: string }[];
};
type Tab = "Schedule" | "Team" | "Availability" | "Shifts" | "Settings" | "Access";
const TABS: Tab[] = ["Schedule", "Team", "Availability", "Shifts", "Settings", "Access"];
type Member = { id: number; email: string; role: string };

const api = async <T,>(url: string, body?: unknown): Promise<T> => {
  const r = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const j = await r.json().catch(() => ({}));
  if (!r.ok)
    throw new Error(
      (j as { error?: string }).error || `Request failed (${r.status})`,
    );
  return j as T;
};

const toMin = (t: string) => +t.split(":")[0] * 60 + +t.split(":")[1];
const hrs = (s: string, e: string) => (toMin(e) - toMin(s)) / 60;
const asRows = (x: unknown) => x as Row[];
const r2 = (x: number) => +x.toFixed(2);
const money = (x: number) => "$" + Math.round(x).toLocaleString();

// Standard (12-hour) time: "6:30 AM", or short form "6:30a"
const t12 = (t: string, short = false) => {
  const [h, m] = t.split(":").map(Number);
  const hh = h % 12 || 12;
  const mm = m ? ":" + String(m).padStart(2, "0") : short ? "" : ":00";
  return `${hh}${mm}${short ? (h >= 12 ? "p" : "a") : h >= 12 ? " PM" : " AM"}`;
};

const chip = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes("open")) return "bg-amber-50 text-amber-900 ring-amber-200";
  if (n.includes("clos")) return "bg-indigo-50 text-indigo-900 ring-indigo-200";
  return "bg-emerald-50 text-emerald-900 ring-emerald-200";
};

const field =
  "w-full min-w-[5rem] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";
const btnPrimary =
  "inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2";
const btnSecondary =
  "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";
const card = "rounded-xl border border-slate-200 bg-white shadow-sm";

const ICONS: Record<Tab, ReactNode> = {
  Access: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </>
  ),
  Schedule: (
    <>
      <rect x='3' y='4' width='18' height='18' rx='2' />
      <path d='M16 2v4M8 2v4M3 10h18' />
    </>
  ),
  Team: (
    <>
      <path d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' />
      <circle cx='9' cy='7' r='4' />
      <path d='M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' />
    </>
  ),
  Availability: (
    <>
      <circle cx='12' cy='12' r='10' />
      <path d='M12 6v6l4 2' />
    </>
  ),
  Shifts: <path d='M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' />,
  Settings: (
    <path d='M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6' />
  ),
};
function Icon({ tab }: { tab: Tab }) {
  return (
    <svg
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
      className='h-5 w-5'
    >
      {ICONS[tab]}
    </svg>
  );
}

const TONES = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warn: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-slate-200 bg-slate-50 text-slate-700",
};
function Callout({
  tone,
  children,
}: {
  tone: keyof typeof TONES;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm leading-relaxed ${TONES[tone]}`}
    >
      {children}
    </div>
  );
}
function Stat({
  label,
  value,
  sub,
  bad,
}: {
  label: string;
  value: string;
  sub?: string;
  bad?: boolean;
}) {
  return (
    <div className={`${card} p-4`}>
      <div className='text-xs font-medium uppercase tracking-wide text-slate-500'>
        {label}
      </div>
      <div
        className={`mt-1 text-2xl font-semibold ${bad ? "text-amber-600" : "text-slate-900"}`}
      >
        {value}
      </div>
      {sub && <div className='mt-0.5 text-xs text-slate-500'>{sub}</div>}
    </div>
  );
}
function Heading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className='mb-4'>
      <h1 className='text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl'>
        {title}
      </h1>
      {children && (
        <p className='mt-1 max-w-3xl text-sm text-slate-600'>{children}</p>
      )}
    </div>
  );
}

function Field({ c, r, save }: { c: Col; r: Row; save: (row: Row) => void }) {
  if (c.ro)
    return (
      <span className='font-medium text-slate-900'>
        {c.k === "day" ? FULL[Number(r[c.k])] : String(r[c.k] ?? "")}
      </span>
    );
  if (c.opts)
    return (
      <select
        className={field}
        defaultValue={String(r[c.k])}
        onChange={(e) => save({ ...r, [c.k]: e.target.value })}
      >
        {c.opts.map((o) => (
          <option key={o} value={o}>
            {c.fmt ? c.fmt(o) : o}
          </option>
        ))}
      </select>
    );
  return (
    <input
      className={field}
      type={c.t || "text"}
      step={c.t === "number" ? "any" : undefined}
      inputMode={c.t === "number" ? "decimal" : undefined}
      placeholder={c.ph}
      defaultValue={r[c.k] ?? ""}
      onBlur={(e) => {
        if (e.target.value !== String(r[c.k] ?? ""))
          save({ ...r, [c.k]: e.target.value });
      }}
    />
  );
}

// Editable table on desktop, stacked cards on phones. Saves a row whenever a field changes.
function Grid(props: {
  table: TableName;
  cols: Col[];
  rows: Row[];
  onData: (d: Snapshot) => void;
  defaults?: Row;
  fixed?: boolean;
  addLabel?: string;
  highlight?: number | null;
  onAdded?: (id: number) => void;
  duplicable?: boolean;
}) {
  const {
    table,
    cols,
    rows: list,
    onData,
    defaults,
    fixed,
    addLabel,
    highlight,
    onAdded,
    duplicable,
  } = props;
  const save = (row: Row) =>
    api<Saved>("/api/data", { action: "save", table, row })
      .then((d) => {
        onData(d);
        if (!row.id && d.newId) onAdded?.(d.newId);
      })
      .catch((e: Error) => alert(e.message));
  const dup = (row: Row) => {
    const { id: _id, ...copy } = row; // drop the id so the server inserts a new row
    return save(copy);
  };
  // Scroll the newly added or duplicated row into view and put the cursor in its first text field
  useEffect(() => {
    if (!highlight) return;
    for (const p of ["d", "m"]) {
      const el = document.getElementById(`row-${p}-${table}-${highlight}`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      const input = el?.querySelector(
        "input[type=text]",
      ) as HTMLInputElement | null;
      input?.focus({ preventScroll: true });
      input?.select();
    }
  }, [highlight, table]);
  const del = (row: Row) =>
    api<Snapshot>("/api/data", { action: "delete", table, row })
      .then(onData)
      .catch((e: Error) => alert(e.message));
  return (
    <div>
      <div className={`${card} hidden overflow-x-auto md:block`}>
        <table className='min-w-full divide-y divide-slate-200 text-sm'>
          <thead className='bg-slate-50'>
            <tr>
              {cols.map((c) => (
                <th
                  key={c.k}
                  className='px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'
                >
                  {c.l}
                </th>
              ))}
              {!fixed && <th className={duplicable ? "w-24" : "w-10"} />}
            </tr>
          </thead>
          <tbody className='divide-y divide-slate-100'>
            {list.map((r) => (
              <tr
                key={r.id}
                id={`row-d-${table}-${r.id}`}
                className={`transition-colors ${r.id === highlight ? "bg-indigo-50 ring-2 ring-inset ring-indigo-300" : "hover:bg-slate-50/60"}`}
              >
                {cols.map((c, i) => (
                  <td key={c.k} className='px-2 py-2 align-middle'>
                    {i === 0 && r.id === highlight && (
                      <span className='mb-1 block w-fit rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white'>
                        New
                      </span>
                    )}
                    <Field c={c} r={r} save={save} />
                  </td>
                ))}
                {!fixed && (
                  <td className='whitespace-nowrap pr-2 text-right'>
                    {duplicable && (
                      <button
                        title='Duplicate'
                        aria-label='Duplicate row'
                        onClick={() => dup(r)}
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
                      onClick={() => del(r)}
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

      <div className='space-y-3 md:hidden'>
        {list.map((r) => (
          <div
            key={r.id}
            id={`row-m-${table}-${r.id}`}
            className={`${card} space-y-3 p-4 transition-colors ${r.id === highlight ? "bg-indigo-50 ring-2 ring-indigo-300" : ""}`}
          >
            {r.id === highlight && (
              <span className='block w-fit rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white'>
                New
              </span>
            )}
            {cols.map((c) => (
              <label key={c.k} className='block'>
                <span className='mb-1 block text-xs font-medium text-slate-500'>
                  {c.l}
                </span>
                <Field c={c} r={r} save={save} />
              </label>
            ))}
            {!fixed && (
              <div className='flex gap-2'>
                {duplicable && (
                  <button
                    onClick={() => dup(r)}
                    className='flex-1 rounded-lg border border-indigo-200 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50'
                  >
                    Duplicate
                  </button>
                )}
                <button
                  onClick={() => del(r)}
                  className='flex-1 rounded-lg border border-rose-200 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50'
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {!fixed && defaults && (
        <button
          className={`${btnSecondary} mt-3 w-full sm:w-auto`}
          onClick={() => save(defaults)}
        >
          + {addLabel || "Add row"}
        </button>
      )}
    </div>
  );
}

export default function Page() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [tab, setTab] = useState<Tab>("Schedule");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [check, setCheck] = useState<Check | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [swapMsg, setSwapMsg] = useState<{
    tone: "ok" | "warn";
    text: string;
  } | null>(null);
  const [backupMsg, setBackupMsg] = useState<{
    tone: "ok" | "warn" | "info";
    text: string;
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [slow, setSlow] = useState(false);
  const [hl, setHl] = useState<{ table: TableName; id: number } | null>(null);
  const markNew = (table: TableName, id: number) => {
    setHl({ table, id });
    setTimeout(
      () => setHl((h) => (h && h.table === table && h.id === id ? null : h)),
      6000,
    );
  };
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    api<Snapshot>("/api/data")
      .then(setData)
      .catch((e: Error) => setLoadError(e.message));
  }, []);
  useEffect(() => {
    if (data)
      api<Check>("/api/preview", {})
        .then(setCheck)
        .catch(() => setCheck(null));
  }, [data]);

  const [members, setMembers] = useState<Member[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [accessErr, setAccessErr] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"owner" | "manager">("manager");
  const loadAccess = () =>
    api<{ members: Member[]; canManage: boolean }>("/api/team")
      .then((r) => { setMembers(r.members); setCanManage(r.canManage); setAccessErr(null); })
      .catch((e: Error) => setAccessErr(e.message));
  const accessAction = (body: Record<string, unknown>) =>
    api<{ members: Member[]; canManage: boolean }>("/api/team", body)
      .then((r) => { setMembers(r.members); setCanManage(r.canManage); setAccessErr(null); })
      .catch((e: Error) => setAccessErr(e.message));
  useEffect(() => { if (tab === "Access") loadAccess(); }, [tab]);
  const signOut = () => fetch("/api/logout", { method: "POST" }).finally(() => { window.location.href = "/login"; });

  if (!data)
    return loadError ? (
      <main className='mx-auto max-w-xl p-8'>
        <div className='rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900'>
          <b>Could not load data.</b>
          <div className='mt-1 break-words'>{loadError}</div>
          <div className='mt-2 text-amber-800'>
            Check that DATABASE_URL is set and that supabase/schema.sql has been
            run.
          </div>
        </div>
      </main>
    ) : (
      <main className='p-8 text-sm text-slate-500'>
        Loading…
        {slow && (
          <div className='mt-2 max-w-md text-amber-700'>
            This is taking longer than usual. The database may be busy or waking
            up. If it never loads, check the terminal or the Vercel logs.
          </div>
        )}
      </main>
    );

  const empCols: Col[] = [
    { k: "name", l: "Name" },
    { k: "position", l: "Position" },
    { k: "type", l: "Type", opts: ["FT", "PT"] },
    { k: "min_hours", l: "Min hrs", t: "number" },
    { k: "max_hours", l: "Max hrs", t: "number" },
    { k: "skills", l: "Key skills (comma separated)" },
    { k: "shifts", l: "Only these shift types (blank = all)" },
    { k: "max_closes", l: "Max closes / wk (blank = default)", t: "number" },
  ];
  const tplCols: Col[] = [
    { k: "name", l: "Shift" },
    { k: "day", l: "Day", opts: DAYS, fmt: (d) => D[Number(d)] },
    { k: "start", l: "Start", t: "time" },
    { k: "end", l: "End", t: "time" },
    { k: "needed", l: "People needed", t: "number" },
    { k: "skill", l: "Required skill (optional)" },
    { k: "only_for", l: "Only these people (blank = anyone)" },
  ];

  // Labor matrix, with hours counted both with and without breaks
  const report = buildReport(data);
  const { rate, heads } = report;
  const days = report.days;
  const totSales = report.totals.sales;
  const totHrs = report.totals.sched;
  const projCost = report.totals.schedCost;
  const req: Record<number, number> = Object.fromEntries(
    report.days.map((d) => [d.day, d.req]),
  );
  const reqTotal = report.totals.req;
  const reqCost = report.totals.reqCost;
  const allowedTotal = report.totals.allowed;
  const pct = Number(data.settings.payroll_pct);
  const weekly = Number(data.settings.weekly_sales);
  const minTotal = data.employees.reduce((a, e) => a + Number(e.min_hours), 0);
  const maxTotal = data.employees.reduce((a, e) => a + Number(e.max_hours), 0);
  const notes: string[] = [];
  if (reqTotal > maxTotal)
    notes.push(
      `Your team's maximum hours total ${r2(maxTotal)}, which is less than the ${r2(reqTotal)} needed. Add staff or raise max hours.`,
    );
  if (minTotal > reqTotal)
    notes.push(
      `Your team's minimum hours total ${r2(minTotal)}, more than the ${r2(reqTotal)} the shifts need. Add shifts or lower some minimums.`,
    );
  for (const d of days)
    if ((req[d.day] || 0) > d.allowed + 0.01)
      notes.push(
        `${FULL[d.day]} shifts need ${r2(req[d.day] || 0)} hrs but its day weight allows ${r2(d.allowed)}. Required shifts are still filled as long as the weekly total fits.`,
      );
  const grp: Record<string, number> = {};
  for (const u of check?.unfilled ?? []) grp[u] = (grp[u] || 0) + 1;
  for (const d of DAYS)
    if ((heads[d] || 0) > data.employees.length)
      notes.push(
        `${FULL[d]} needs ${heads[d]} people but you only have ${data.employees.length} employees.`,
      );
  const over = reqTotal > allowedTotal;
  const costPct = weekly ? (reqCost / weekly) * 100 : 0;

  const closeCount = (empId: number) =>
    data.schedule.filter((s) => {
      const h = data.store_hours.find((x) => x.day === s.day);
      return s.employee_id === empId && !!h && toMin(s.end) >= toMin(h.close);
    }).length;
  const closeLimit = (e: Snapshot["employees"][number]) => {
    const o = e.max_closes;
    const v =
      o == null || String(o).trim() === ""
        ? Number(data.settings.max_closes ?? 0)
        : Number(o);
    return v > 0 ? v : Infinity;
  };
  const empName = (id: number) =>
    data.employees.find((e) => e.id === id)?.name ?? "Unknown";
  const generate = () => {
    setBusy(true);
    setSwapMsg(null);
    api<Result>("/api/generate", {})
      .then((r) => {
        setWarnings(r.warnings ?? []);
        setData(r);
      })
      .catch((e: Error) => alert(e.message))
      .finally(() => setBusy(false));
  };
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setBackupMsg({ tone: "warn", text: "That file is not valid JSON." });
      return;
    }
    if (
      !window.confirm(
        "Importing replaces ALL current employees, shifts, settings and the schedule with the contents of this file. Export first if you want a backup. Continue?",
      )
    )
      return;
    setImporting(true);
    setBackupMsg({
      tone: "info",
      text: "Importing. This can take a little while on a slow connection, so please do not click again.",
    });
    try {
      const r = await api<Snapshot>("/api/import", parsed);
      setData(r);
      setWarnings([]);
      setBackupMsg({
        tone: "ok",
        text: `Imported ${r.employees.length} employees, ${r.shift_templates.length} shift templates and ${r.schedule.length} scheduled shifts.`,
      });
    } catch (e) {
      setBackupMsg({ tone: "warn", text: (e as Error).message });
    } finally {
      setImporting(false);
    }
  };
  const swapDay = (day: number) =>
    api<Snapshot & { ok: boolean; message: string }>("/api/swap", { day })
      .then((r) => {
        if (r.ok) setData(r);
        setSwapMsg({ tone: r.ok ? "ok" : "warn", text: r.message });
      })
      .catch((e: Error) => setSwapMsg({ tone: "warn", text: e.message }));
  const saveForecast = (v: string) =>
    api<Snapshot>("/api/data", {
      action: "save",
      table: "settings",
      row: { ...data.settings, weekly_sales: v },
    })
      .then(setData)
      .catch((e: Error) => alert(e.message));

  const T = report.totals;
  const altTag = report.rule.countPaid ? "shift" : "paid";
  const costSub = `${report.showAlt ? `${money(T.reqCostAlt)} ${altTag}, ` : ""}at $${rate.toFixed(2)}/hr average`;
  const schedSub = [
    `${r2(totHrs)} hrs`,
    totSales ? `${((projCost / totSales) * 100).toFixed(1)}% of sales` : "",
    report.showAlt
      ? `${money(T.schedCostAlt)} ${altTag}${totSales ? ` (${((T.schedCostAlt / totSales) * 100).toFixed(1)}%)` : ""}`
      : "",
  ]
    .filter(Boolean)
    .join(", ");
  const altName = report.rule.countPaid ? "shift length" : "paid, minus lunch";
  const matrix: {
    label: string;
    cells: { t: string; bad?: boolean }[];
    total: string;
    alt?: boolean;
  }[] = (
    [
      {
        label: "Projected sales",
        cells: days.map((d) => ({ t: money(d.sales) })),
        total: money(T.sales),
      },
      {
        label: "Target payroll",
        cells: days.map((d) => ({ t: money(d.target) })),
        total: money(T.target),
      },
      {
        label: "Allowed hours",
        cells: days.map((d) => ({ t: String(r2(d.allowed)) })),
        total: String(r2(T.allowed)),
      },
      {
        label: "Hours to fully staff",
        cells: days.map((d) => ({ t: String(r2(d.req)) })),
        total: String(r2(T.req)),
      },
      {
        label: altName,
        alt: true,
        cells: days.map((d) => ({ t: String(r2(d.reqAlt)) })),
        total: String(r2(T.reqAlt)),
      },
      {
        label: "Cost to fully staff",
        cells: days.map((d) => ({ t: money(d.req * rate) })),
        total: money(T.reqCost),
      },
      {
        label: altName,
        alt: true,
        cells: days.map((d) => ({ t: money(d.reqAlt * rate) })),
        total: money(T.reqCostAlt),
      },
      {
        label: "Hours scheduled",
        cells: days.map((d) => ({ t: String(r2(d.sched)) })),
        total: String(r2(T.sched)),
      },
      {
        label: altName,
        alt: true,
        cells: days.map((d) => ({ t: String(r2(d.schedAlt)) })),
        total: String(r2(T.schedAlt)),
      },
      {
        label: "Scheduled payroll",
        cells: days.map((d) => ({ t: money(d.schedCost) })),
        total: money(T.schedCost),
      },
      {
        label: altName,
        alt: true,
        cells: days.map((d) => ({ t: money(d.schedCostAlt) })),
        total: money(T.schedCostAlt),
      },
      {
        label: "+/- hours",
        cells: days.map((d) => ({
          t: String(r2(d.sched - d.allowed)),
          bad: d.sched > d.allowed,
        })),
        total: String(r2(T.sched - T.allowed)),
      },
    ] as {
      label: string;
      cells: { t: string; bad?: boolean }[];
      total: string;
      alt?: boolean;
    }[]
  ).filter((r) => !r.alt || report.showAlt);

  return (
    <div className='min-h-screen pb-24 md:pb-10'>
      <header className='sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur'>
        <div className='mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3'>
          <div className='flex items-center gap-2.5'>
            <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white'>
              S
            </div>
            <span className='text-base font-semibold tracking-tight'>
              Shift Scheduler
            </span>
          </div>
          <nav className='hidden gap-1 md:flex'>
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${tab === t ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100"}`}
              >
                <Icon tab={t} />
                {t}
              </button>
            ))}
          </nav>
          <button onClick={signOut} className='rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100'>
            Sign out
          </button>
        </div>
      </header>

      <main className='mx-auto max-w-6xl px-4 py-6'>
        {tab === "Team" && (
          <>
            <Heading title='Team'>
              Tag skills like subshop, service or production; a shift that
              requires a skill can only go to people tagged with it. To limit
              someone to certain shift types, enter names like Opener or Closer
              in the last column.
            </Heading>
            <Grid
              table='employees'
              cols={empCols}
              rows={asRows(data.employees)}
              onData={setData}
              addLabel='Add employee'
              highlight={hl?.table === "employees" ? hl.id : null}
              onAdded={(id) => markNew("employees", id)}
              defaults={{
                name: "New employee",
                position: "",
                type: "PT",
                min_hours: 10,
                max_hours: 25,
                skills: "",
                shifts: "",
                max_closes: "",
              }}
            />
          </>
        )}

        {tab === "Availability" && (
          <>
            <Heading title='Availability'>
              Leave a day blank if the person can work any time. Type off if
              they can't work that day, or a window such as 6am-2pm (the whole
              shift must fit inside it).
            </Heading>
            <Grid
              table='employees'
              fixed
              rows={asRows(data.employees)}
              onData={setData}
              cols={[
                { k: "name", l: "Employee", ro: true },
                ...DAYS.map((d) => ({
                  k: "avail_" + d,
                  l: FULL[d],
                  ph: "Any",
                })),
              ]}
            />
          </>
        )}

        {tab === "Shifts" && (
          <>
            <Heading title='Shift templates'>
              One row per shift type per day. Use the copy icon (or Duplicate on
              a phone) to clone a shift, then change its day or times. New and
              duplicated shifts are highlighted and scrolled into view. Rows are
              sorted by day and start time. To make a shift only for certain
              people, enter their names in the last column, separated by commas.
            </Heading>
            <Grid
              table='shift_templates'
              cols={tplCols}
              rows={asRows(data.shift_templates)}
              onData={setData}
              addLabel='Add shift'
              duplicable
              highlight={hl?.table === "shift_templates" ? hl.id : null}
              onAdded={(id) => markNew("shift_templates", id)}
              defaults={{
                name: "New shift",
                day: 1,
                start: "06:00",
                end: "16:00",
                needed: 1,
                skill: "",
                only_for: "",
              }}
            />
          </>
        )}

        {tab === "Access" && (
          <>
            <Heading title="Team access">
              Who can sign in to this department. Owners can add people and change access. Managers can edit schedules, the forecast and settings, but can't change access.
            </Heading>
            {accessErr && <div className="mb-3"><Callout tone="warn">{accessErr}</Callout></div>}
            <div className={`${card} overflow-x-auto`}>
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Email</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Role</th>
                    <th className="w-24" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td className="px-3 py-2.5 text-slate-900">{m.email}</td>
                      <td className="px-3 py-2.5">
                        {canManage ? (
                          <select className={field} value={m.role} onChange={(e) => accessAction({ action: "role", id: m.id, role: e.target.value })}>
                            <option value="owner">Owner</option>
                            <option value="manager">Manager</option>
                          </select>
                        ) : (
                          <span className="capitalize">{m.role}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {canManage && (
                          <button onClick={() => { if (window.confirm(`Remove ${m.email} from this department?`)) accessAction({ action: "remove", id: m.id }); }} className="text-sm font-medium text-rose-600 hover:underline">
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canManage && (
              <div className={`${card} mt-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-end`}>
                <label className="block flex-1">
                  <span className="text-sm font-medium text-slate-700">Add person</span>
                  <input className={`${field} mt-1`} type="email" placeholder="name@detwilermarket.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                </label>
                <label className="block sm:w-40">
                  <span className="text-sm font-medium text-slate-700">Role</span>
                  <select className={`${field} mt-1`} value={newRole} onChange={(e) => setNewRole(e.target.value as "owner" | "manager")}>
                    <option value="manager">Manager</option>
                    <option value="owner">Owner</option>
                  </select>
                </label>
                <button className={btnPrimary} onClick={() => { accessAction({ action: "add", email: newEmail, role: newRole }).then(() => setNewEmail("")); }}>
                  Add
                </button>
              </div>
            )}
            <p className="mt-3 text-xs text-slate-500">
              Create the person's login in Supabase first (Authentication, then Users, then Add user), since sign-up is turned off. Then add them here with the same email.
            </p>
          </>
        )}

        {tab === "Settings" && (
          <>
            <Heading title='Store and payroll'>
              Payroll target, shift start window, store hours, and how each day
              shares the week's sales and labor hours.
            </Heading>
            <h2 className='mb-2 text-sm font-semibold text-slate-700'>
              Payroll and start window
            </h2>
            <Grid
              table='settings'
              fixed
              rows={asRows([data.settings])}
              onData={setData}
              cols={[
                {
                  k: "payroll_pct",
                  l: "Target payroll (% of sales)",
                  t: "number",
                },
                {
                  k: "fill_extra",
                  l: "Fill extra shifts to budget (1 = yes, 0 = no)",
                  t: "number",
                },
                {
                  k: "max_closes",
                  l: "Default max closing shifts per person per week (0 = no limit)",
                  t: "number",
                },
                {
                  k: "rate_override",
                  l: "Average hourly rate (used for all payroll cost)",
                  t: "number",
                },
                { k: "earliest_start", l: "Earliest shift start", t: "time" },
                { k: "latest_start", l: "Latest shift start", t: "time" },
              ]}
            />
            <h2 className='mb-2 mt-8 text-sm font-semibold text-slate-700'>
              Lunch breaks and printing
            </h2>
            <Grid
              table='settings'
              fixed
              rows={asRows([data.settings])}
              onData={setData}
              cols={[
                { k: "break_minutes", l: "Lunch break (minutes)", t: "number" },
                {
                  k: "break_after",
                  l: "Applies to shifts longer than (hours)",
                  t: "number",
                },
                {
                  k: "breaks_unpaid",
                  l: "Lunch is unpaid? (1 = yes, 0 = no)",
                  t: "number",
                },
                {
                  k: "count_paid_hours",
                  l: "Run budget and min/max on paid hours? (0 = no, use shift hours)",
                  t: "number",
                },
                { k: "schedule_title", l: "Schedule title printed on the PDF" },
              ]}
            />
            <p className='mt-2 text-xs text-slate-500'>
              By default the budget, payroll and each person's min and max hours
              all run on scheduled shift hours, and the paid figure (lunch
              deducted) is shown in grey for reference. Set the last option to 1
              to run everything on paid hours instead.
            </p>
            <h2 className='mb-2 mt-8 text-sm font-semibold text-slate-700'>
              Store hours and day weights
            </h2>
            <Grid
              table='store_hours'
              fixed
              rows={asRows(data.store_hours)}
              onData={setData}
              cols={[
                { k: "day", l: "Day", ro: true },
                { k: "open", l: "Opens", t: "time" },
                { k: "close", l: "Closes", t: "time" },
                { k: "sales_pct", l: "Day weight (% of week)", t: "number" },
              ]}
            />
            <p className='mt-2 text-xs text-slate-500'>
              Day weights currently total{" "}
              {data.store_hours
                .reduce((a, h) => a + Number(h.sales_pct), 0)
                .toFixed(1)}
              % and should total 100. They split the weekly forecast, and the
              extra hours, across the days.
            </p>

            <h2 className='mb-2 mt-8 text-sm font-semibold text-slate-700'>
              Backup and transfer
            </h2>
            <div className={`${card} space-y-3 p-4`}>
              <p className='text-sm text-slate-600'>
                Export everything (employees, availability, shift templates,
                settings, store hours and the current schedule) to a single
                file. Import it later, or on another computer, to restore it.
                Importing replaces all current data.
              </p>
              <div className='flex flex-col gap-2 sm:flex-row'>
                <a
                  href='/api/export'
                  download
                  className={`${btnPrimary} w-full sm:w-auto`}
                >
                  Export all data
                </a>
                <label
                  htmlFor='import-file'
                  className={`${btnSecondary} w-full cursor-pointer sm:w-auto ${importing ? "pointer-events-none opacity-50" : ""}`}
                >
                  {importing ? "Importing…" : "Import from file"}
                </label>
                <input
                  id='import-file'
                  type='file'
                  accept='application/json,.json'
                  className='hidden'
                  disabled={importing}
                  onChange={(e) => {
                    importFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>
              {backupMsg && (
                <Callout tone={backupMsg.tone}>{backupMsg.text}</Callout>
              )}
            </div>
          </>
        )}

        {tab === "Schedule" && (
          <>
            <Heading title='Weekly schedule'>
              Enter this week's forecast, review what full coverage costs, then
              generate.
            </Heading>

            <div
              className={`${card} mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between`}
            >
              <label className='block'>
                <span className='text-sm font-medium text-slate-700'>
                  Forecast sales for this week
                </span>
                <div className='relative mt-1 w-full sm:w-52'>
                  <span className='pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400'>
                    $
                  </span>
                  <input
                    className={`${field} pl-7`}
                    type='number'
                    inputMode='decimal'
                    defaultValue={data.settings.weekly_sales}
                    onBlur={(e) => saveForecast(e.target.value)}
                  />
                </div>
              </label>
              <div className='flex flex-col gap-2 sm:flex-row'>
                <a
                  href='/api/pdf'
                  target='_blank'
                  rel='noopener noreferrer'
                  className={`${btnSecondary} w-full sm:w-auto`}
                >
                  Download PDF
                </a>
                <button
                  className={`${btnPrimary} w-full sm:w-auto`}
                  onClick={generate}
                  disabled={busy}
                >
                  {busy ? "Generating…" : "Generate schedule"}
                </button>
              </div>
            </div>

            <div className='mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4'>
              <Stat
                label='Hours to fully staff'
                value={`${r2(reqTotal)}`}
                sub={`${report.showAlt ? `${r2(report.totals.reqAlt)} ${report.rule.countPaid ? "shift" : "paid"}, ` : ""}${r2(allowedTotal)} allowed`}
                bad={over}
              />
              <Stat
                label='Cost to fully staff'
                value={money(reqCost)}
                sub={costSub}
              />
              <Stat
                label='Share of forecast'
                value={`${costPct.toFixed(1)}%`}
                sub={`target ${pct}%`}
                bad={costPct > pct}
              />
              <Stat
                label='Scheduled so far'
                value={money(projCost)}
                sub={schedSub}
              />
            </div>

            <div className='mb-4 space-y-2'>
              {over ? (
                <Callout tone='warn'>
                  Full coverage is {r2(reqTotal - allowedTotal)} hrs over
                  budget. At {pct}% payroll you would need about $
                  {pct > 0
                    ? Math.ceil(reqCost / (pct / 100)).toLocaleString()
                    : 0}{" "}
                  in weekly sales to afford it, or raise the payroll target to{" "}
                  {costPct.toFixed(1)}%.
                </Callout>
              ) : (
                <Callout tone='ok'>
                  Within budget, with {r2(allowedTotal - reqTotal)} hrs to
                  spare.
                  {Number(data.settings.fill_extra) !== 0 &&
                    " Generate adds extra shifts up to each day budget, weighted toward your busiest days."}
                </Callout>
              )}
              {notes.map((n, i) => (
                <Callout key={i} tone='warn'>
                  {n}
                </Callout>
              ))}
              {check?.config.map((c, i) => (
                <Callout key={i} tone='warn'>
                  {c}
                </Callout>
              ))}
              {check &&
                (check.unfilled.length === 0 ? (
                  <Callout tone='ok'>
                    Your team can cover every required shift, ignoring payroll.
                  </Callout>
                ) : (
                  <Callout tone='warn'>
                    Even with no payroll limit, your team cannot cover:{" "}
                    {Object.entries(grp)
                      .map(([k, n]) => `${k}${n > 1 ? ` x${n}` : ""}`)
                      .join(", ")}
                    . Your team can cover {check.capacity} of the {check.needed}{" "}
                    required shifts.
                  </Callout>
                ))}
              {check && check.underMin.length > 0 && (
                <Callout tone='warn'>
                  Likely under minimum hours: {check.underMin.join(", ")}.
                </Callout>
              )}
            </div>

            {check && check.suggestions.length > 0 && (
              <div className={`${card} mb-4 p-4`}>
                <h2 className='text-sm font-semibold text-slate-900'>
                  Ways to fix it
                </h2>
                <ul className='mt-2 divide-y divide-slate-100'>
                  {check.suggestions.map((x, i) => (
                    <li key={i} className='py-2.5 text-sm'>
                      <span className='font-semibold text-slate-900'>
                        {x.title}.
                      </span>{" "}
                      <span className='text-slate-600'>{x.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {warnings.length > 0 && (
              <div className='mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4'>
                <h2 className='text-sm font-semibold text-amber-900'>
                  Generated with {warnings.length} warning
                  {warnings.length > 1 ? "s" : ""}
                </h2>
                <ul className='mt-1 list-disc space-y-0.5 pl-5 text-sm text-amber-900'>
                  {warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <h2 className='mb-2 mt-6 text-sm font-semibold text-slate-700'>
              Labor matrix
            </h2>
            <div className={`${card} overflow-x-auto`}>
              <table className='min-w-full text-sm'>
                <thead className='bg-slate-50'>
                  <tr>
                    <th className='sticky left-0 bg-slate-50 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500' />
                    {DAYS.map((d) => (
                      <th
                        key={d}
                        className='px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500'
                      >
                        {D[d]}
                      </th>
                    ))}
                    <th className='px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500'>
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-slate-100'>
                  {matrix.map((row) => (
                    <tr key={row.label}>
                      <td
                        className={`sticky left-0 whitespace-nowrap bg-white px-3 ${row.alt ? "py-1 pl-6 text-xs text-slate-400" : "py-2 font-medium text-slate-700"}`}
                      >
                        {row.label}
                      </td>
                      {row.cells.map((c, i) => (
                        <td
                          key={i}
                          className={`whitespace-nowrap px-3 text-right tabular-nums ${row.alt ? "py-1 text-xs text-slate-400" : `py-2 ${c.bad ? "font-semibold text-amber-600" : "text-slate-700"}`}`}
                        >
                          {c.t}
                        </td>
                      ))}
                      <td
                        className={`whitespace-nowrap px-3 text-right tabular-nums ${row.alt ? "py-1 text-xs text-slate-400" : "py-2 font-semibold text-slate-900"}`}
                      >
                        {row.total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 className='mb-2 mt-8 text-sm font-semibold text-slate-700'>
              Schedule
            </h2>
            {data.schedule.length === 0 && (
              <div className={`${card} p-8 text-center text-sm text-slate-500`}>
                No schedule yet. Click Generate schedule to build one.
              </div>
            )}

            {data.schedule.length > 0 && (
              <>
                {swapMsg && (
                  <div className='mb-3'>
                    <Callout tone={swapMsg.tone}>{swapMsg.text}</Callout>
                  </div>
                )}
                <div className={`${card} hidden overflow-x-auto md:block`}>
                  <table className='min-w-full text-sm'>
                    <thead className='bg-slate-50'>
                      <tr>
                        <th className='px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>
                          Employee
                        </th>
                        {DAYS.map((d) => (
                          <th
                            key={d}
                            className='px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'
                          >
                            {D[d]}
                            <button
                              onClick={() => swapDay(d)}
                              className='mt-0.5 block text-[11px] font-medium normal-case tracking-normal text-indigo-600 hover:underline'
                            >
                              Swap closers
                            </button>
                          </th>
                        ))}
                        <th className='px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500'>
                          Hours
                        </th>
                      </tr>
                    </thead>
                    <tbody className='divide-y divide-slate-100'>
                      {data.employees.map((e) => {
                        const mine = data.schedule.filter(
                          (s) => s.employee_id === e.id,
                        );
                        const er = report.employees.find(
                          (x) => x.emp.id === e.id,
                        );
                        const h = er ? er.hours : 0;
                        const alt = er ? er.alt : 0;
                        const off = h < e.min_hours || h > e.max_hours;
                        return (
                          <tr key={e.id} className='align-top'>
                            <td className='whitespace-nowrap px-3 py-2.5'>
                              <div className='font-medium text-slate-900'>
                                {e.name}
                              </div>
                              <div className='text-xs text-slate-500'>
                                <span className='mr-1 rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600'>
                                  {e.type}
                                </span>
                                {e.position}
                              </div>
                            </td>
                            {DAYS.map((d) => (
                              <td key={d} className='px-2 py-2.5'>
                                <div className='space-y-1'>
                                  {mine
                                    .filter((s) => s.day === d)
                                    .map((s) => (
                                      <div
                                        key={s.id}
                                        className={`whitespace-nowrap rounded-md px-2 py-1 text-xs ring-1 ring-inset ${chip(s.name)}`}
                                      >
                                        <div className='font-semibold'>
                                          {s.name}
                                        </div>
                                        <div>
                                          {t12(s.start, true)}–
                                          {t12(s.end, true)}
                                        </div>
                                      </div>
                                    ))}
                                </div>
                              </td>
                            ))}
                            <td
                              className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${off ? "font-semibold text-amber-600" : "text-slate-700"}`}
                            >
                              {r2(h)}
                              <div className='text-xs font-normal text-slate-400'>
                                {e.min_hours}–{e.max_hours}
                              </div>
                              {report.showAlt && (
                                <div className='text-xs font-normal text-slate-400'>
                                  {r2(alt)}{" "}
                                  {report.rule.countPaid ? "shift" : "paid"}
                                </div>
                              )}
                              <div
                                className={`text-xs font-normal ${closeCount(e.id) > closeLimit(e) ? "text-amber-600" : "text-slate-400"}`}
                              >
                                {closeCount(e.id)} close
                                {closeCount(e.id) === 1 ? "" : "s"}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className='space-y-3 md:hidden'>
                  {days.map((d) => {
                    const list = data.schedule
                      .filter((s) => s.day === d.day)
                      .sort(
                        (a, b) =>
                          toMin(a.start) - toMin(b.start) ||
                          a.name.localeCompare(b.name),
                      );
                    return (
                      <div key={d.day} className={`${card} overflow-hidden`}>
                        <div className='flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5'>
                          <span className='font-semibold text-slate-900'>
                            {FULL[d.day]}
                          </span>
                          <div className='flex items-center gap-3'>
                            <button
                              onClick={() => swapDay(d.day)}
                              className='text-xs font-medium text-indigo-600'
                            >
                              Swap closers
                            </button>
                            <span
                              className={`text-xs ${d.sched > d.allowed ? "font-semibold text-amber-600" : "text-slate-500"}`}
                            >
                              {r2(d.sched)} of {r2(d.allowed)} hrs
                              {report.showAlt &&
                                ` (${r2(d.schedAlt)} ${report.rule.countPaid ? "shift" : "paid"})`}
                            </span>
                          </div>
                        </div>
                        <ul className='divide-y divide-slate-100'>
                          {list.length === 0 && (
                            <li className='px-4 py-3 text-sm text-slate-400'>
                              No shifts
                            </li>
                          )}
                          {list.map((s) => (
                            <li
                              key={s.id}
                              className='flex items-center justify-between gap-3 px-4 py-2.5'
                            >
                              <div>
                                <div className='text-sm font-medium text-slate-900'>
                                  {empName(s.employee_id)}
                                </div>
                                <div className='text-xs text-slate-500'>
                                  {t12(s.start)} – {t12(s.end)}
                                  {hasBreak(s.start, s.end, report.rule) &&
                                    ` · ${report.rule.minutes} min lunch`}
                                </div>
                              </div>
                              <span
                                className={`rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset ${chip(s.name)}`}
                              >
                                {s.name}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </main>

      <nav className='fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden'>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${tab === t ? "text-indigo-600" : "text-slate-500"}`}
          >
            <Icon tab={t} />
            {t}
          </button>
        ))}
      </nav>
    </div>
  );
}
