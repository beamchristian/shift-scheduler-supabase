import { COLS, coerce, ensureSeed, errMsg, snapshot, transaction } from "./db";

type Rec = Record<string, unknown>;
const SCHEDULE_COLS = [
  "day",
  "template_id",
  "employee_id",
  "name",
  "start",
  "end",
];

export async function exportAll() {
  return {
    app: "shift-scheduler",
    version: 1,
    exported_at: new Date().toISOString(),
    data: await snapshot(),
  };
}

const quote = (cols: string[]) => cols.map((c) => `"${c}"`).join(",");

// Replaces all data with the contents of an export file. Runs in one transaction, so a bad file changes nothing.
export async function importAll(
  payload: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = payload as { app?: string; data?: Rec } | null;
  const d = p?.data;
  if (!p || p.app !== "shift-scheduler" || !d || typeof d !== "object")
    return { ok: false, error: "This file is not a Shift Scheduler export." };

  const arr = (k: string): Rec[] | null => {
    const v = d[k];
    return Array.isArray(v) && v.every((x) => x && typeof x === "object")
      ? (v as Rec[])
      : null;
  };
  const employees = arr("employees");
  const templates = arr("shift_templates");
  const hours = arr("store_hours");
  const schedule = d.schedule === undefined ? [] : arr("schedule");
  const settings = d.settings as Rec | undefined;
  if (
    !employees ||
    !templates ||
    !hours ||
    !schedule ||
    !settings ||
    typeof settings !== "object"
  )
    return {
      ok: false,
      error:
        "The file is missing employees, shift templates, store hours or settings.",
    };
  for (const r of [...templates, ...hours]) {
    const day = Number(r.day);
    if (!(day >= 1 && day <= 6))
      return {
        ok: false,
        error: `A row has an invalid day (${String(r.day)}). Days must be 1 (Mon) to 6 (Sat).`,
      };
  }

  try {
    await ensureSeed();
    await transaction(async (tx) => {
      await tx(
        "truncate table schedule, shift_templates, employees, store_hours restart identity",
      );
      // One multi-row insert per table. Rows without an id get the next free one.
      const put = async (table: string, cols: string[], rows: Rec[]) => {
        if (!rows.length) return;
        let next =
          Math.max(
            0,
            ...rows.map((r) =>
              Number.isInteger(Number(r.id)) ? Number(r.id) : 0,
            ),
          ) + 1;
        const names = ["id", ...cols];
        const params: (string | number | null)[] = [];
        const tuples = rows.map((r, k) => {
          const id = Number(r.id);
          params.push(
            Number.isInteger(id) && id > 0 ? id : next++,
            ...cols.map((c) => coerce(c, r[c])),
          );
          return `(${names.map((_, i) => `$${k * names.length + i + 1}`).join(",")})`;
        });
        await tx(
          `insert into ${table} (${quote(names)}) values ${tuples.join(",")}`,
          params,
        );
      };
      await put("employees", COLS.employees, employees);
      await put("shift_templates", COLS.shift_templates, templates);
      await put("store_hours", COLS.store_hours, hours);
      await put("schedule", SCHEDULE_COLS, schedule);
      // Keep the id counters ahead of the ids we just inserted
      await tx(
        `select ${["employees", "shift_templates", "store_hours", "schedule"]
          .map(
            (t) =>
              `setval(pg_get_serial_sequence('${t}','id'), coalesce((select max(id) from ${t}),0)+1, false)`,
          )
          .join(", ")}`,
      );

      // Settings: keep current values for anything the file doesn't include
      const cur = (await tx<Rec>("select * from settings where id=1"))[0] ?? {};
      const cols = COLS.settings;
      const vals = cols.map((c) =>
        coerce(c, settings[c] !== undefined ? settings[c] : cur[c]),
      );
      await tx(
        `insert into settings ("id",${quote(cols)}) values (1,${cols.map((_, i) => `$${i + 1}`).join(",")})
         on conflict (id) do update set ${cols.map((c) => `"${c}"=excluded."${c}"`).join(",")}`,
        vals,
      );
    });
  } catch (e) {
    return {
      ok: false,
      error: `Import failed and nothing was changed: ${errMsg(e)}`,
    };
  }
  return { ok: true };
}
