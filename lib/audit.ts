import { runQuery } from "./db";

// One line of the audit log, as the Settings screen shows it.
export interface AuditEntry {
  id: number;
  email: string | null;
  action: string;
  detail: string | null;
  created_at: string;
}

// Writes one line to the audit log for a department, so there is a record of who changed what and when.
// A failure here is logged on the server but does not undo the change that was just made.
export async function recordAuditEntry(
  departmentId: number,
  actorEmail: string,
  action: string,
  detail: string,
): Promise<void> {
  try {
    await runQuery(
      "insert into audit_log (department_id, email, action, detail) values ($1, $2, $3, $4)",
      [departmentId, actorEmail, action, detail],
    );
  } catch (thrownError) {
    console.error("Could not write to the audit log:", thrownError);
  }
}

// Returns the newest audit entries for a department, newest first.
export async function listAuditEntries(departmentId: number, entryLimit = 50): Promise<AuditEntry[]> {
  return runQuery<AuditEntry>(
    "select id, email, action, detail, created_at from audit_log where department_id = $1 order by created_at desc, id desc limit $2",
    [departmentId, entryLimit],
  );
}
