import { NextResponse } from "next/server";
import { ACTIVE_DEPARTMENT_COOKIE, isCompanyAdmin, resolveCaller } from "../../../lib/access";
import { recordAuditEntry } from "../../../lib/audit";
import { ensureDepartmentSeeded, errMsg, runQuery, transaction } from "../../../lib/db";

export const dynamic = "force-dynamic";

// The longest store name allowed.
const MAX_NAME_LENGTH = 40;

// The departments every new store starts with. Each store gets its own copy.
const STANDARD_DEPARTMENT_NAMES = ["Deli", "Seafood", "Grocery", "Bakery", "Butcher", "Cafe", "Produce"];

// Creates a new store with the seven standard departments, and sets its store managers from the emails given.
// Only company admins may do this. Store managers can manage every department in the store.
// Company admins can already see every store, so the creator is not added as a manager unless they type their own email.
export async function POST(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;
  if (!(await isCompanyAdmin(caller.email)))
    return NextResponse.json(
      { error: "Only company admins can create stores." },
      { status: 403 },
    );

  const { name, managerEmails } = (await request.json().catch(() => ({}))) as {
    name?: string;
    managerEmails?: string;
  };
  const storeName = String(name ?? "").trim();
  if (!storeName)
    return NextResponse.json({ error: "Enter a name for the new store." }, { status: 400 });

  // Emails can be separated by commas, spaces, or new lines. Each one must look like an email address.
  const storeManagerEmails = [
    ...new Set(
      String(managerEmails ?? "")
        .split(/[\s,;]+/)
        .map((emailText) => emailText.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (!storeManagerEmails.length)
    return NextResponse.json(
      { error: "Enter the email of at least one store manager." },
      { status: 400 },
    );
  const badEmail = storeManagerEmails.find((emailText) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailText));
  if (badEmail)
    return NextResponse.json(
      { error: `"${badEmail}" does not look like an email address.` },
      { status: 400 },
    );
  if (storeName.length > MAX_NAME_LENGTH)
    return NextResponse.json(
      { error: `Keep the name to ${MAX_NAME_LENGTH} characters or fewer.` },
      { status: 400 },
    );

  try {
    // Store names must be unique, ignoring capitals.
    const [existingStore] = await runQuery(
      "select id from stores where lower(name) = lower($1)",
      [storeName],
    );
    if (existingStore)
      return NextResponse.json(
        { error: "A store with that name already exists." },
        { status: 400 },
      );

    // The store, its manager, and its departments are created together, so none is left on its own.
    const departmentIds = await transaction(async (transactionQuery) => {
      const [createdStore] = await transactionQuery<{ id: number }>(
        "insert into stores (name) values ($1) returning id",
        [storeName],
      );
      for (const managerEmail of storeManagerEmails)
        await transactionQuery(
          "insert into store_members (store_id, email) values ($1, $2) on conflict do nothing",
          [createdStore.id, managerEmail],
        );
      const createdIds: number[] = [];
      for (const departmentName of STANDARD_DEPARTMENT_NAMES) {
        const [createdDepartment] = await transactionQuery<{ id: number }>(
          "insert into departments (store_id, name) values ($1, $2) returning id",
          [createdStore.id, departmentName],
        );
        createdIds.push(createdDepartment.id);
      }
      return createdIds;
    });

    // Gives each new department its settings and day weights, so it opens with working defaults.
    for (const departmentId of departmentIds) await ensureDepartmentSeeded(departmentId);
    await recordAuditEntry(departmentIds[0], caller.email, "Created store", storeName);

    // Opens the store's first department, remembered for a year like the department switch.
    const response = NextResponse.json({ ok: true, departmentId: departmentIds[0] });
    response.cookies.set(ACTIVE_DEPARTMENT_COOKIE, String(departmentIds[0]), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 500 });
  }
}
