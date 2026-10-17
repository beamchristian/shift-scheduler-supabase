import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { hasBreak, t12 } from "./hours";
import { buildReport } from "./report";
import type { Snapshot } from "./types";

// US Letter, landscape. Coordinates below are measured from the top of the page.
const W = 792;
const H = 612;
const M = 28;
const BOTTOM = 40;
const C = {
  ink: rgb(0.06, 0.09, 0.16),
  mute: rgb(0.4, 0.45, 0.53),
  line: rgb(0.83, 0.86, 0.9),
  band: rgb(0.965, 0.971, 0.98),
  head: rgb(0.31, 0.27, 0.9),
  white: rgb(1, 1, 1),
  warn: rgb(0.71, 0.33, 0.04),
  ok: rgb(0.02, 0.45, 0.32),
};
const FILL = {
  open: rgb(0.996, 0.953, 0.78),
  close: rgb(0.878, 0.906, 1),
  other: rgb(0.82, 0.98, 0.9),
};
const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS = [1, 2, 3, 4, 5, 6];

// The built-in PDF fonts only cover Latin text, so anything else becomes a question mark.
const clean = (s: string) =>
  s.replace(
    /[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g,
    "?",
  );
const money = (x: number) => "$" + Math.round(x).toLocaleString("en-US");
const r2 = (x: number) => String(+x.toFixed(2));
const shiftFill = (name: string) => {
  const n = name.toLowerCase();
  return n.includes("open")
    ? FILL.open
    : n.includes("clos")
      ? FILL.close
      : FILL.other;
};

export async function buildPdf(snap: Snapshot): Promise<Uint8Array> {
  const rep = buildReport(snap);
  const { rule, rate, totals } = rep;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const title = clean(
    snap.settings.schedule_title?.trim() || "Weekly Schedule",
  );

  let page: PDFPage = doc.addPage([W, H]);
  let y = M; // current distance from the top

  const fit = (s: string, f: PDFFont, size: number, w: number) => {
    let t = clean(s);
    if (f.widthOfTextAtSize(t, size) <= w) return t;
    while (t.length > 1 && f.widthOfTextAtSize(t + "...", size) > w)
      t = t.slice(0, -1);
    return t + "...";
  };
  // Text centered vertically on `mid` (distance from top), aligned inside the box [x, x + w]
  const put = (
    s: string,
    x: number,
    w: number,
    mid: number,
    size: number,
    f: PDFFont,
    color = C.ink,
    align: "left" | "center" | "right" = "left",
  ) => {
    const t = fit(s, f, size, w);
    const tw = f.widthOfTextAtSize(t, size);
    const tx =
      align === "left" ? x : align === "center" ? x + (w - tw) / 2 : x + w - tw;
    page.drawText(t, { x: tx, y: H - mid - size * 0.34, size, font: f, color });
  };
  const rect = (
    x: number,
    top: number,
    w: number,
    h: number,
    color: ReturnType<typeof rgb>,
  ) => page.drawRectangle({ x, y: H - top - h, width: w, height: h, color });
  const hline = (top: number, x1 = M, x2 = W - M) =>
    page.drawLine({
      start: { x: x1, y: H - top },
      end: { x: x2, y: H - top },
      thickness: 0.5,
      color: C.line,
    });

  // ---- Title block
  put(title, M, 520, y + 11, 18, bold);
  put(
    "Generated " +
      new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    W - M - 200,
    200,
    y + 9,
    8,
    font,
    C.mute,
    "right",
  );
  y += 26;
  const weekly = Number(snap.settings.weekly_sales);
  const pct = Number(snap.settings.payroll_pct);
  const sub = [
    `Forecast sales ${money(weekly)}`,
    `Payroll target ${pct}% (${money(totals.target)})`,
    `Average rate $${rate.toFixed(2)}/hr`,
    rule.minutes > 0
      ? `Lunch ${rule.minutes} min ${rule.unpaid ? "unpaid" : "paid"} on shifts over ${r2(rule.after)} hrs`
      : "No lunch breaks",
  ].join("   |   ");
  put(sub, M, W - 2 * M, y + 5, 8.5, font, C.mute);
  y += 15;
  const pctOf = (x: number) =>
    totals.sales ? ((x / totals.sales) * 100).toFixed(1) + "%" : "-";
  const diff = totals.target - totals.schedCost;
  const summary = [
    `Scheduled payroll ${money(totals.schedCost)} (${pctOf(totals.schedCost)})`,
    rep.showAlt
      ? `${rule.countPaid ? "Shift hours" : "Paid, minus lunch"} ${money(totals.schedCostAlt)} (${pctOf(totals.schedCostAlt)})`
      : "",
    `${diff >= 0 ? money(diff) + " under" : money(-diff) + " over"} target`,
  ]
    .filter(Boolean)
    .join("   |   ");
  put(summary, M, W - 2 * M, y + 5, 10, bold, diff >= 0 ? C.ok : C.warn);
  y += 17;

  // ---- Labor matrix
  const LW = 176,
    DW = 78,
    TW = 92;
  const bad = (a: number, b: number) => a > b + 0.005;
  const altName = rule.countPaid ? "shift length" : "paid, minus lunch";
  type MRow = {
    label: string;
    cells: string[];
    total: string;
    strong?: boolean;
    sub?: boolean;
    flag?: boolean[];
    totalFlag?: boolean;
  };
  const rows: MRow[] = (
    [
      {
        label: "Projected sales",
        cells: rep.days.map((d) => money(d.sales)),
        total: money(totals.sales),
      },
      {
        label: "Target payroll",
        cells: rep.days.map((d) => money(d.target)),
        total: money(totals.target),
      },
      {
        label: "Allowed hours",
        cells: rep.days.map((d) => r2(d.allowed)),
        total: r2(totals.allowed),
        strong: true,
      },
      {
        label: "Hours to fully staff",
        cells: rep.days.map((d) => r2(d.req)),
        total: r2(totals.req),
      },
      {
        label: altName,
        sub: true,
        cells: rep.days.map((d) => r2(d.reqAlt)),
        total: r2(totals.reqAlt),
      },
      {
        label: "Cost to fully staff",
        cells: rep.days.map((d) => money(d.req * rate)),
        total: money(totals.reqCost),
      },
      {
        label: altName,
        sub: true,
        cells: rep.days.map((d) => money(d.reqAlt * rate)),
        total: money(totals.reqCostAlt),
      },
      {
        label: "Hours scheduled",
        cells: rep.days.map((d) => r2(d.sched)),
        total: r2(totals.sched),
        strong: true,
      },
      {
        label: altName,
        sub: true,
        cells: rep.days.map((d) => r2(d.schedAlt)),
        total: r2(totals.schedAlt),
      },
      {
        label: "Scheduled payroll",
        cells: rep.days.map((d) => money(d.schedCost)),
        total: money(totals.schedCost),
      },
      {
        label: altName,
        sub: true,
        cells: rep.days.map((d) => money(d.schedCostAlt)),
        total: money(totals.schedCostAlt),
      },
      {
        label: "+/- hours",
        cells: rep.days.map((d) => r2(d.sched - d.allowed)),
        total: r2(totals.sched - totals.allowed),
        strong: true,
        flag: rep.days.map((d) => bad(d.sched, d.allowed)),
        totalFlag: bad(totals.sched, totals.allowed),
      },
    ] as MRow[]
  ).filter((r) => !r.sub || rep.showAlt);
  const RH = 15.5,
    SH = 12.5,
    HH = 17;
  rect(M, y, W - 2 * M, HH, C.head);
  put("Labor matrix", M + 6, LW - 8, y + HH / 2, 8.5, bold, C.white);
  DAYS.forEach((d, i) =>
    put(
      DAY[d],
      M + LW + i * DW,
      DW - 8,
      y + HH / 2,
      8.5,
      bold,
      C.white,
      "right",
    ),
  );
  put(
    "Total",
    M + LW + 6 * DW,
    TW - 8,
    y + HH / 2,
    8.5,
    bold,
    C.white,
    "right",
  );
  y += HH;
  rows.forEach((r, k) => {
    const h = r.sub ? SH : RH;
    const size = r.sub ? 7.5 : 8.5;
    const col = r.sub ? C.mute : C.ink;
    if (k % 2 === 1) rect(M, y, W - 2 * M, h, C.band);
    const f = r.strong ? bold : font;
    put(
      r.label,
      M + (r.sub ? 16 : 6),
      LW - (r.sub ? 18 : 8),
      y + h / 2,
      size,
      f,
      col,
    );
    r.cells.forEach((c, i) =>
      put(
        c,
        M + LW + i * DW,
        DW - 8,
        y + h / 2,
        size,
        f,
        r.flag?.[i] ? C.warn : col,
        "right",
      ),
    );
    put(
      r.total,
      M + LW + 6 * DW,
      TW - 8,
      y + h / 2,
      size,
      r.sub ? font : bold,
      r.totalFlag ? C.warn : col,
      "right",
    );
    y += h;
    hline(y);
  });
  y += 14;

  // ---- Schedule grid
  const EW = 108,
    SW = 82,
    PW = 42,
    BW = 52,
    CW = 44;
  const header = (label: string) => {
    put(label, M, 300, y + 6, 11, bold);
    y += 15;
    rect(M, y, W - 2 * M, 18, C.head);
    put("Employee", M + 6, EW - 8, y + 9, 8.5, bold, C.white);
    DAYS.forEach((d, i) =>
      put(DAY[d], M + EW + i * SW, SW, y + 9, 8.5, bold, C.white, "center"),
    );
    put(
      rule.countPaid ? "Paid hrs" : "Hours",
      M + EW + 6 * SW,
      PW,
      y + 9,
      8,
      bold,
      C.white,
      "center",
    );
    if (rep.showAlt)
      put(
        rule.countPaid ? "Shift hrs" : "Paid hrs",
        M + EW + 6 * SW + PW,
        BW,
        y + 9,
        8,
        bold,
        C.white,
        "center",
      );
    put(
      "Closes",
      M + EW + 6 * SW + PW + BW,
      CW,
      y + 9,
      8,
      bold,
      C.white,
      "center",
    );
    y += 18;
  };
  header("Schedule");

  if (!snap.schedule.length) {
    rect(M, y, W - 2 * M, 40, C.band);
    put(
      "No schedule has been generated yet.",
      M,
      W - 2 * M,
      y + 20,
      10,
      font,
      C.mute,
      "center",
    );
    y += 40;
  } else {
    const ERH = 26;
    for (const e of rep.employees) {
      if (y + ERH > H - BOTTOM) {
        page = doc.addPage([W, H]);
        y = M;
        header("Schedule (continued)");
      }
      put(e.emp.name, M + 6, EW - 10, y + 9, 8.5, bold);
      put(
        `${e.emp.type}${e.emp.position ? " | " + e.emp.position : ""}`,
        M + 6,
        EW - 10,
        y + 19,
        7,
        font,
        C.mute,
      );
      DAYS.forEach((d, i) => {
        const s = e.shifts.find((x) => x.day === d);
        if (!s) return;
        const x = M + EW + i * SW + 2;
        rect(x, y + 2, SW - 4, ERH - 4, shiftFill(s.name));
        put(s.name, x, SW - 4, y + 9.5, 7.2, bold, C.ink, "center");
        put(
          `${t12(s.start, true)} - ${t12(s.end, true)}${hasBreak(s.start, s.end, rule) ? "" : ""}`,
          x,
          SW - 4,
          y + 18.5,
          7.2,
          font,
          C.ink,
          "center",
        );
      });
      const off =
        e.hours < Number(e.emp.min_hours) - 0.005 ||
        e.hours > Number(e.emp.max_hours) + 0.005;
      put(
        r2(e.hours),
        M + EW + 6 * SW,
        PW,
        y + 9,
        8.5,
        bold,
        off ? C.warn : C.ink,
        "center",
      );
      put(
        `${r2(Number(e.emp.min_hours))}-${r2(Number(e.emp.max_hours))}`,
        M + EW + 6 * SW,
        PW,
        y + 19,
        6.5,
        font,
        C.mute,
        "center",
      );
      if (rep.showAlt)
        put(
          r2(e.alt),
          M + EW + 6 * SW + PW,
          BW,
          y + 13,
          8.5,
          font,
          C.mute,
          "center",
        );
      put(
        String(e.closes),
        M + EW + 6 * SW + PW + BW,
        CW,
        y + 13,
        8.5,
        font,
        C.ink,
        "center",
      );
      y += ERH;
      hline(y);
    }
  }

  // ---- Footers on every page
  const note = !rep.showAlt
    ? "Hours are scheduled shift length, start to end."
    : rule.countPaid
      ? `Hours are paid hours: the ${rule.minutes} minute unpaid lunch is deducted on shifts longer than ${r2(rule.after)} hours.`
      : `Hours are scheduled shift length. The grey paid figures deduct the ${rule.minutes} minute unpaid lunch on shifts longer than ${r2(rule.after)} hours.`;
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    page = p;
    hline(H - 30);
    put(note, M, 560, H - 20, 7, font, C.mute);
    put(
      `Page ${i + 1} of ${pages.length}`,
      W - M - 100,
      100,
      H - 20,
      7,
      font,
      C.mute,
      "right",
    );
  });

  return doc.save();
}
