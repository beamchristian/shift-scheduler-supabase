import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { t12 } from "./hours";
import { buildReport } from "./report";
import type { Snapshot } from "./types";

// US Letter, landscape. All positions below are measured from the top of the page, in points.
const PAGE_WIDTH = 792;
const PAGE_HEIGHT = 612;
// Space left around the edge of the page.
const PAGE_MARGIN = 28;
// Space kept clear at the bottom of each page, above the footer.
const BOTTOM_RESERVED_SPACE = 40;

// Column widths shared by the labor matrix and the schedule grid, so each day lines up in both.
const EMPLOYEE_COLUMN_WIDTH = 108;
const SHIFT_COLUMN_WIDTH = 86;
const PAID_COLUMN_WIDTH = 52;
const SECOND_HOURS_COLUMN_WIDTH = 52;

// Colors used in the PDF.
const COLORS = {
  ink: rgb(0.06, 0.09, 0.16),
  mute: rgb(0.4, 0.45, 0.53),
  line: rgb(0.83, 0.86, 0.9),
  divider: rgb(0.6, 0.65, 0.73),
  band: rgb(0.965, 0.971, 0.98),
  head: rgb(0.31, 0.27, 0.9),
  white: rgb(1, 1, 1),
  warn: rgb(0.71, 0.33, 0.04),
  ok: rgb(0.02, 0.45, 0.32),
};
// Background colors for shift boxes, by kind of shift. Darker so they show up on a black-and-white printer.
const SHIFT_FILLS = {
  open: rgb(0.98, 0.82, 0.36),
  close: rgb(0.6, 0.72, 0.97),
  other: rgb(0.55, 0.86, 0.7),
};
// Short day names for the columns. Index 1 is Monday.
const DAY_LABELS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// The days of the week that the schedule covers (Monday to Saturday).
const WORK_DAYS = [1, 2, 3, 4, 5, 6];

// The built-in PDF fonts only cover Latin text, so anything else becomes a question mark.
const replaceUnsupportedCharacters = (text: string) =>
  text.replace(/[^\x20-\x7E -ÿ–—‘’“”•…]/g, "?");

// Formats a dollar amount with no cents, for example "$1,234".
const formatMoney = (amount: number) =>
  "$" + Math.round(amount).toLocaleString("en-US");
// Rounds to two decimals for hours, without trailing zeros, for example "7.5" or "8".
const formatHours = (hours: number) => String(+hours.toFixed(2));
// Picks the box color for a shift by its name: opening, closing, or anything else.
const shiftFillColor = (shiftName: string) => {
  const lowerCaseName = shiftName.toLowerCase();
  return lowerCaseName.includes("open")
    ? SHIFT_FILLS.open
    : lowerCaseName.includes("clos")
      ? SHIFT_FILLS.close
      : SHIFT_FILLS.other;
};

// Builds the printable schedule for one department: the labor matrix, the schedule grid, and footers.
// Returns the PDF file as bytes.
export async function buildPdf(snapshot: Snapshot): Promise<Uint8Array> {
  const report = buildReport(snapshot);
  const { rule: breakRuleInUse, rate: hourlyRate, totals } = report;
  const pdfDocument = await PDFDocument.create();
  const regularFont = await pdfDocument.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDocument.embedFont(StandardFonts.HelveticaBold);
  const scheduleTitle = replaceUnsupportedCharacters(
    snapshot.settings.schedule_title?.trim() || "Weekly Schedule",
  );

  let currentPage: PDFPage = pdfDocument.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  // Current height from the top of the page.
  let currentTop = PAGE_MARGIN;

  // Shortens text with "..." so it fits inside the given width.
  const fitTextToWidth = (
    text: string,
    font: PDFFont,
    fontSize: number,
    maxWidth: number,
  ) => {
    let shortenedText = replaceUnsupportedCharacters(text);
    if (font.widthOfTextAtSize(shortenedText, fontSize) <= maxWidth)
      return shortenedText;
    while (
      shortenedText.length > 1 &&
      font.widthOfTextAtSize(shortenedText + "...", fontSize) > maxWidth
    )
      shortenedText = shortenedText.slice(0, -1);
    return shortenedText + "...";
  };
  // Draws text vertically centered on `middleFromTop`, aligned inside the box from `boxLeft` to `boxLeft + boxWidth`.
  const drawText = (
    text: string,
    boxLeft: number,
    boxWidth: number,
    middleFromTop: number,
    fontSize: number,
    font: PDFFont,
    color = COLORS.ink,
    alignment: "left" | "center" | "right" = "left",
  ) => {
    const fittedText = fitTextToWidth(text, font, fontSize, boxWidth);
    const textWidth = font.widthOfTextAtSize(fittedText, fontSize);
    const textLeft =
      alignment === "left"
        ? boxLeft
        : alignment === "center"
          ? boxLeft + (boxWidth - textWidth) / 2
          : boxLeft + boxWidth - textWidth;
    currentPage.drawText(fittedText, {
      x: textLeft,
      y: PAGE_HEIGHT - middleFromTop - fontSize * 0.34,
      size: fontSize,
      font,
      color,
    });
  };
  // Draws a filled rectangle. `top` is measured from the top of the page.
  const drawFilledRectangle = (
    left: number,
    top: number,
    width: number,
    height: number,
    color: ReturnType<typeof rgb>,
  ) =>
    currentPage.drawRectangle({
      x: left,
      y: PAGE_HEIGHT - top - height,
      width,
      height,
      color,
    });
  // Draws a thin horizontal line across the page at a height from the top.
  const drawHorizontalLine = (
    top: number,
    fromX = PAGE_MARGIN,
    toX = PAGE_WIDTH - PAGE_MARGIN,
  ) =>
    currentPage.drawLine({
      start: { x: fromX, y: PAGE_HEIGHT - top },
      end: { x: toX, y: PAGE_HEIGHT - top },
      thickness: 0.5,
      color: COLORS.line,
    });
  // Draws a vertical line between the day columns, from `top` to `bottom`, for one row of the matrix or grid.
  // The lines sit on the same column edges in both tables, so each day lines up from top to bottom.
  const drawDayDividers = (top: number, bottom: number) => {
    for (let edgeIndex = 0; edgeIndex <= WORK_DAYS.length; edgeIndex++) {
      const x =
        PAGE_MARGIN + EMPLOYEE_COLUMN_WIDTH + edgeIndex * SHIFT_COLUMN_WIDTH;
      currentPage.drawLine({
        start: { x, y: PAGE_HEIGHT - top },
        end: { x, y: PAGE_HEIGHT - bottom },
        thickness: 0.5,
        color: COLORS.divider,
      });
    }
  };

  // ---- Title block
  drawText(scheduleTitle, PAGE_MARGIN, 520, currentTop + 11, 18, boldFont);
  drawText(
    "Generated " +
      new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    PAGE_WIDTH - PAGE_MARGIN - 200,
    200,
    currentTop + 9,
    8,
    regularFont,
    COLORS.mute,
    "right",
  );
  currentTop += 26;
  const weeklySalesForecast = Number(snapshot.settings.weekly_sales);
  const payrollPercent = Number(snapshot.settings.payroll_pct);
  const subtitleParts = [
    `Forecast sales ${formatMoney(weeklySalesForecast)}`,
    `Payroll target ${payrollPercent}% (${formatMoney(totals.target)})`,
    breakRuleInUse.minutes > 0
      ? `Lunch ${breakRuleInUse.minutes} min ${breakRuleInUse.unpaid ? "unpaid" : "paid"} on shifts over ${formatHours(breakRuleInUse.after)} hrs`
      : "No lunch breaks",
  ].join("   |   ");
  drawText(
    subtitleParts,
    PAGE_MARGIN,
    PAGE_WIDTH - 2 * PAGE_MARGIN,
    currentTop + 5,
    8.5,
    regularFont,
    COLORS.mute,
  );
  currentTop += 15;
  // Payroll as a share of sales, for display.
  const percentOfSales = (dollars: number) =>
    totals.sales ? ((dollars / totals.sales) * 100).toFixed(1) + "%" : "-";
  // Positive when scheduled payroll is under target.
  const dollarsUnderTarget = totals.target - totals.schedCost;
  const summaryParts = [
    `Scheduled payroll ${formatMoney(totals.schedCost)} (${percentOfSales(totals.schedCost)})`,
    report.showAlt
      ? `${breakRuleInUse.countPaid ? "Shift hours" : "Paid, minus lunch"} ${formatMoney(totals.schedCostAlt)} (${percentOfSales(totals.schedCostAlt)})`
      : "",
    `${dollarsUnderTarget >= 0 ? formatMoney(dollarsUnderTarget) + " under" : formatMoney(-dollarsUnderTarget) + " over"} target`,
  ]
    .filter(Boolean)
    .join("   |   ");
  drawText(
    summaryParts,
    PAGE_MARGIN,
    PAGE_WIDTH - 2 * PAGE_MARGIN,
    currentTop + 5,
    10,
    boldFont,
    dollarsUnderTarget >= 0 ? COLORS.ok : COLORS.warn,
  );
  currentTop += 17;

  // ---- Labor matrix
  // The label column matches the employee column, and each day matches its schedule column.
  // The total sits over the two hours columns at the right of the grid.
  const LABEL_COLUMN_WIDTH = EMPLOYEE_COLUMN_WIDTH;
  const DAY_COLUMN_WIDTH = SHIFT_COLUMN_WIDTH;
  const TOTAL_COLUMN_WIDTH = PAID_COLUMN_WIDTH + SECOND_HOURS_COLUMN_WIDTH;
  // True when a figure is over its allowance (with a small rounding margin).
  const isOverAllowance = (actual: number, allowed: number) =>
    actual > allowed + 0.005;
  const referenceRowLabel = breakRuleInUse.countPaid
    ? "shift length"
    : "paid, minus lunch";
  // One line of the labor matrix. `sub` lines are the smaller reference figures.
  type MatrixRow = {
    label: string;
    cells: string[];
    total: string;
    strong?: boolean;
    sub?: boolean;
    flag?: boolean[];
    totalFlag?: boolean;
  };
  const matrixRows: MatrixRow[] = (
    [
      {
        label: "Projected sales",
        cells: report.days.map((dayRow) => formatMoney(dayRow.sales)),
        total: formatMoney(totals.sales),
      },
      {
        label: "Target payroll",
        cells: report.days.map((dayRow) => formatMoney(dayRow.target)),
        total: formatMoney(totals.target),
      },
      {
        label: "Allowed hours",
        cells: report.days.map((dayRow) => formatHours(dayRow.allowed)),
        total: formatHours(totals.allowed),
        strong: true,
      },
      {
        label: "Hours to fully staff",
        cells: report.days.map((dayRow) => formatHours(dayRow.req)),
        total: formatHours(totals.req),
      },
      {
        label: referenceRowLabel,
        sub: true,
        cells: report.days.map((dayRow) => formatHours(dayRow.reqAlt)),
        total: formatHours(totals.reqAlt),
      },
      {
        label: "Cost to fully staff",
        cells: report.days.map((dayRow) =>
          formatMoney(dayRow.req * hourlyRate),
        ),
        total: formatMoney(totals.reqCost),
      },
      {
        label: referenceRowLabel,
        sub: true,
        cells: report.days.map((dayRow) =>
          formatMoney(dayRow.reqAlt * hourlyRate),
        ),
        total: formatMoney(totals.reqCostAlt),
      },
      {
        label: "Hours scheduled",
        cells: report.days.map((dayRow) => formatHours(dayRow.sched)),
        total: formatHours(totals.sched),
        strong: true,
      },
      {
        label: referenceRowLabel,
        sub: true,
        cells: report.days.map((dayRow) => formatHours(dayRow.schedAlt)),
        total: formatHours(totals.schedAlt),
      },
      {
        label: "Scheduled payroll",
        cells: report.days.map((dayRow) => formatMoney(dayRow.schedCost)),
        total: formatMoney(totals.schedCost),
      },
      {
        label: referenceRowLabel,
        sub: true,
        cells: report.days.map((dayRow) => formatMoney(dayRow.schedCostAlt)),
        total: formatMoney(totals.schedCostAlt),
      },
      {
        label: "+/- hours",
        cells: report.days.map((dayRow) =>
          formatHours(dayRow.sched - dayRow.allowed),
        ),
        total: formatHours(totals.sched - totals.allowed),
        strong: true,
        flag: report.days.map((dayRow) =>
          isOverAllowance(dayRow.sched, dayRow.allowed),
        ),
        totalFlag: isOverAllowance(totals.sched, totals.allowed),
      },
    ] as MatrixRow[]
  ).filter((matrixRow) => !matrixRow.sub || report.showAlt);
  const MAIN_ROW_HEIGHT = 15.5;
  const SUB_ROW_HEIGHT = 12.5;
  const HEADER_ROW_HEIGHT = 17;
  drawFilledRectangle(
    PAGE_MARGIN,
    currentTop,
    PAGE_WIDTH - 2 * PAGE_MARGIN,
    HEADER_ROW_HEIGHT,
    COLORS.head,
  );
  drawText(
    "Labor matrix",
    PAGE_MARGIN + 6,
    LABEL_COLUMN_WIDTH - 8,
    currentTop + HEADER_ROW_HEIGHT / 2,
    8.5,
    boldFont,
    COLORS.white,
  );
  WORK_DAYS.forEach((dayNumber, columnIndex) =>
    drawText(
      DAY_LABELS[dayNumber],
      PAGE_MARGIN + LABEL_COLUMN_WIDTH + columnIndex * DAY_COLUMN_WIDTH,
      DAY_COLUMN_WIDTH,
      currentTop + HEADER_ROW_HEIGHT / 2,
      8.5,
      boldFont,
      COLORS.white,
      "center",
    ),
  );
  drawText(
    "Total",
    PAGE_MARGIN + LABEL_COLUMN_WIDTH + 6 * DAY_COLUMN_WIDTH,
    TOTAL_COLUMN_WIDTH,
    currentTop + HEADER_ROW_HEIGHT / 2,
    8.5,
    boldFont,
    COLORS.white,
    "center",
  );
  currentTop += HEADER_ROW_HEIGHT;
  matrixRows.forEach((matrixRow, rowIndex) => {
    const rowHeight = matrixRow.sub ? SUB_ROW_HEIGHT : MAIN_ROW_HEIGHT;
    const fontSize = matrixRow.sub ? 7.5 : 8.5;
    const textColor = matrixRow.sub ? COLORS.mute : COLORS.ink;
    // Every other row gets a light background, to make the rows easier to follow.
    if (rowIndex % 2 === 1)
      drawFilledRectangle(
        PAGE_MARGIN,
        currentTop,
        PAGE_WIDTH - 2 * PAGE_MARGIN,
        rowHeight,
        COLORS.band,
      );
    const rowFont = matrixRow.strong ? boldFont : regularFont;
    drawText(
      matrixRow.label,
      PAGE_MARGIN + (matrixRow.sub ? 16 : 6),
      LABEL_COLUMN_WIDTH - (matrixRow.sub ? 18 : 8),
      currentTop + rowHeight / 2,
      fontSize,
      rowFont,
      textColor,
    );
    matrixRow.cells.forEach((cellText, columnIndex) =>
      drawText(
        cellText,
        PAGE_MARGIN + LABEL_COLUMN_WIDTH + columnIndex * DAY_COLUMN_WIDTH,
        DAY_COLUMN_WIDTH,
        currentTop + rowHeight / 2,
        fontSize,
        rowFont,
        matrixRow.flag?.[columnIndex] ? COLORS.warn : textColor,
        "center",
      ),
    );
    drawText(
      matrixRow.total,
      PAGE_MARGIN + LABEL_COLUMN_WIDTH + 6 * DAY_COLUMN_WIDTH,
      TOTAL_COLUMN_WIDTH,
      currentTop + rowHeight / 2,
      fontSize,
      matrixRow.sub ? regularFont : boldFont,
      matrixRow.totalFlag ? COLORS.warn : textColor,
      "center",
    );
    drawDayDividers(currentTop, currentTop + rowHeight);
    currentTop += rowHeight;
    drawHorizontalLine(currentTop);
  });
  currentTop += 14;

  // ---- Schedule grid
  // Draws the grid's title and column headings. Called at the top of every grid page.
  const drawGridHeader = (headerTitle: string) => {
    drawText(headerTitle, PAGE_MARGIN, 300, currentTop + 6, 11, boldFont);
    currentTop += 15;
    drawFilledRectangle(
      PAGE_MARGIN,
      currentTop,
      PAGE_WIDTH - 2 * PAGE_MARGIN,
      18,
      COLORS.head,
    );
    drawText(
      "Employee",
      PAGE_MARGIN + 6,
      EMPLOYEE_COLUMN_WIDTH - 8,
      currentTop + 9,
      8.5,
      boldFont,
      COLORS.white,
    );
    WORK_DAYS.forEach((dayNumber, columnIndex) =>
      drawText(
        DAY_LABELS[dayNumber],
        PAGE_MARGIN + EMPLOYEE_COLUMN_WIDTH + columnIndex * SHIFT_COLUMN_WIDTH,
        SHIFT_COLUMN_WIDTH,
        currentTop + 9,
        8.5,
        boldFont,
        COLORS.white,
        "center",
      ),
    );
    drawText(
      breakRuleInUse.countPaid ? "Paid hrs" : "Hours",
      PAGE_MARGIN + EMPLOYEE_COLUMN_WIDTH + 6 * SHIFT_COLUMN_WIDTH,
      PAID_COLUMN_WIDTH,
      currentTop + 9,
      8,
      boldFont,
      COLORS.white,
      "center",
    );
    if (report.showAlt)
      drawText(
        breakRuleInUse.countPaid ? "Shift hrs" : "Paid hrs",
        PAGE_MARGIN +
          EMPLOYEE_COLUMN_WIDTH +
          6 * SHIFT_COLUMN_WIDTH +
          PAID_COLUMN_WIDTH,
        SECOND_HOURS_COLUMN_WIDTH,
        currentTop + 9,
        8,
        boldFont,
        COLORS.white,
        "center",
      );
    currentTop += 18;
  };
  drawGridHeader("Schedule");

  if (!snapshot.schedule.length) {
    drawFilledRectangle(
      PAGE_MARGIN,
      currentTop,
      PAGE_WIDTH - 2 * PAGE_MARGIN,
      40,
      COLORS.band,
    );
    drawText(
      "No schedule has been generated yet.",
      PAGE_MARGIN,
      PAGE_WIDTH - 2 * PAGE_MARGIN,
      currentTop + 20,
      10,
      regularFont,
      COLORS.mute,
      "center",
    );
    currentTop += 40;
  } else {
    const EMPLOYEE_ROW_HEIGHT = 26;
    for (const employeeRow of report.employees) {
      // Start a new page when this row would run into the footer.
      if (
        currentTop + EMPLOYEE_ROW_HEIGHT >
        PAGE_HEIGHT - BOTTOM_RESERVED_SPACE
      ) {
        currentPage = pdfDocument.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        currentTop = PAGE_MARGIN;
        drawGridHeader("Schedule (continued)");
      }
      drawText(
        employeeRow.emp.name,
        PAGE_MARGIN + 6,
        EMPLOYEE_COLUMN_WIDTH - 10,
        currentTop + 9,
        8.5,
        boldFont,
      );
      drawText(
        `${employeeRow.emp.type}${employeeRow.emp.position ? " | " + employeeRow.emp.position : ""}`,
        PAGE_MARGIN + 6,
        EMPLOYEE_COLUMN_WIDTH - 10,
        currentTop + 19,
        7,
        regularFont,
        COLORS.mute,
      );
      // One colored box per day the person works.
      WORK_DAYS.forEach((dayNumber, columnIndex) => {
        const shiftForDay = employeeRow.shifts.find(
          (scheduleRow) => scheduleRow.day === dayNumber,
        );
        if (!shiftForDay) return;
        const boxLeft =
          PAGE_MARGIN +
          EMPLOYEE_COLUMN_WIDTH +
          columnIndex * SHIFT_COLUMN_WIDTH +
          2;
        drawFilledRectangle(
          boxLeft,
          currentTop + 2,
          SHIFT_COLUMN_WIDTH - 4,
          EMPLOYEE_ROW_HEIGHT - 4,
          shiftFillColor(shiftForDay.name),
        );
        drawText(
          shiftForDay.name,
          boxLeft,
          SHIFT_COLUMN_WIDTH - 4,
          currentTop + 9.5,
          7.2,
          boldFont,
          COLORS.ink,
          "center",
        );
        drawText(
          `${t12(shiftForDay.start, true)} - ${t12(shiftForDay.end, true)}`,
          boxLeft,
          SHIFT_COLUMN_WIDTH - 4,
          currentTop + 18.5,
          7.2,
          regularFont,
          COLORS.ink,
          "center",
        );
      });
      drawText(
        formatHours(employeeRow.hours),
        PAGE_MARGIN + EMPLOYEE_COLUMN_WIDTH + 6 * SHIFT_COLUMN_WIDTH,
        PAID_COLUMN_WIDTH,
        currentTop + 13,
        8.5,
        boldFont,
        COLORS.ink,
        "center",
      );
      if (report.showAlt)
        drawText(
          formatHours(employeeRow.alt),
          PAGE_MARGIN +
            EMPLOYEE_COLUMN_WIDTH +
            6 * SHIFT_COLUMN_WIDTH +
            PAID_COLUMN_WIDTH,
          SECOND_HOURS_COLUMN_WIDTH,
          currentTop + 13,
          8.5,
          regularFont,
          COLORS.mute,
          "center",
        );
      drawDayDividers(currentTop, currentTop + EMPLOYEE_ROW_HEIGHT);
      currentTop += EMPLOYEE_ROW_HEIGHT;
      drawHorizontalLine(currentTop);
    }
  }

  // ---- Footer on every page: a note about the hours, and the page number.
  const hoursNote = !report.showAlt
    ? "Hours are scheduled shift length, start to end."
    : breakRuleInUse.countPaid
      ? `Hours are paid hours: the ${breakRuleInUse.minutes} minute unpaid lunch is deducted on shifts longer than ${formatHours(breakRuleInUse.after)} hours.`
      : `Hours are scheduled shift length. The grey paid figures deduct the ${breakRuleInUse.minutes} minute unpaid lunch on shifts longer than ${formatHours(breakRuleInUse.after)} hours.`;
  const allPages = pdfDocument.getPages();
  allPages.forEach((page, pageIndex) => {
    currentPage = page;
    drawHorizontalLine(PAGE_HEIGHT - 30);
    drawText(
      hoursNote,
      PAGE_MARGIN,
      560,
      PAGE_HEIGHT - 20,
      7,
      regularFont,
      COLORS.mute,
    );
    drawText(
      `Page ${pageIndex + 1} of ${allPages.length}`,
      PAGE_WIDTH - PAGE_MARGIN - 100,
      100,
      PAGE_HEIGHT - 20,
      7,
      regularFont,
      COLORS.mute,
      "right",
    );
  });

  return pdfDocument.save();
}
