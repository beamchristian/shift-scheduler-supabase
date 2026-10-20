"use client";
import { useEffect, useState } from "react";
import { AppHeader } from "../components/AppHeader";
import { MobileTabBar } from "../components/MobileTabBar";
import { AccessScreen } from "../components/screens/AccessScreen";
import { AvailabilityScreen } from "../components/screens/AvailabilityScreen";
import { ScheduleScreen } from "../components/screens/ScheduleScreen";
import { SettingsScreen } from "../components/screens/SettingsScreen";
import { StoreOverviewScreen } from "../components/screens/StoreOverviewScreen";
import { ShiftsScreen } from "../components/screens/ShiftsScreen";
import { TeamScreen } from "../components/screens/TeamScreen";
import type {
  AccessMember,
  CurrentUser,
  GenerateResult,
  StaffingCheck,
  Tab,
} from "../components/types";
import type { Snapshot, TableName } from "../lib/types";
import { callApi } from "../lib/ui/format";
import type { StoreOverview } from "../lib/storeOverview";
import { visibleTabsFor } from "../components/types";

// The reply from the team endpoint: the access list, and whether the signed-in person may change it.
type TeamReply = { members: AccessMember[]; canManage: boolean };

// The reply from the store overview endpoint: the store's name, plus the combined figures.
type StoreOverviewReply = StoreOverview & { storeName: string; storePayrollPercent: number | null };

// The reply from the swap-closers endpoint: the new data, whether the swap worked, and a message to show.
type SwapReply = Snapshot & { ok: boolean; message: string };

// The main page. It loads the department's data, holds the state the screens share,
// and shows the screen the person picked.
export default function Page() {
  // The department's data, and the screen that is showing.
  const [data, setData] = useState<Snapshot | null>(null);
  const [currentTab, setCurrentTab] = useState<Tab>("Schedule");
  // Warnings from the last schedule generation, and the staffing check from the server.
  const [scheduleWarnings, setScheduleWarnings] = useState<string[]>([]);
  const [staffingCheck, setStaffingCheck] = useState<StaffingCheck | null>(
    null,
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [swapMessage, setSwapMessage] = useState<{
    tone: "ok" | "warn";
    text: string;
  } | null>(null);
  const [backupMessage, setBackupMessage] = useState<{
    tone: "ok" | "warn" | "info";
    text: string;
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  // Turns true when loading takes longer than eight seconds, so a note can be shown.
  const [isSlow, setIsSlow] = useState(false);
  // The row that was just added, so its table can highlight it.
  const [highlight, setHighlight] = useState<{
    table: TableName;
    id: number;
  } | null>(null);
  // Who is signed in, and the departments they can switch between.
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  // State for the store overview screen: the combined figures, or the error from loading them.
  const [storeOverview, setStoreOverview] = useState<StoreOverviewReply | null>(null);
  const [storeOverviewError, setStoreOverviewError] = useState<string | null>(null);

  // State for the Access screen.
  const [members, setMembers] = useState<AccessMember[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");

  // Marks a newly added row for six seconds, then clears the mark (unless another row was marked since).
  const markRowAsNew = (table: TableName, id: number) => {
    setHighlight({ table, id });
    setTimeout(
      () =>
        setHighlight((currentHighlight) =>
          currentHighlight &&
          currentHighlight.table === table &&
          currentHighlight.id === id
            ? null
            : currentHighlight,
        ),
      6000,
    );
  };
  // The highlighted row id for one table, or null if that table has no highlighted row.
  const highlightedIdFor = (table: TableName) =>
    highlight?.table === table ? highlight.id : null;

  // Shows the "taking longer than usual" note after eight seconds.
  useEffect(() => {
    const slowTimer = setTimeout(() => setIsSlow(true), 8000);
    return () => clearTimeout(slowTimer);
  }, []);
  // Loads the department's data when the page opens.
  useEffect(() => {
    callApi<Snapshot>("/api/data")
      .then(setData)
      .catch((thrownError: Error) => setLoadError(thrownError.message));
  }, []);
  // Runs the staffing check again whenever the data changes.
  useEffect(() => {
    if (data)
      callApi<StaffingCheck>("/api/preview", {})
        .then(setStaffingCheck)
        .catch(() => setStaffingCheck(null));
  }, [data]);
  // Loads who is signed in and their departments.
  useEffect(() => {
    callApi<CurrentUser>("/api/me")
      .then(setCurrentUser)
      .catch(() => setCurrentUser(null));
  }, []);

  // Calls the team endpoint. With no body it loads the access list; with a body it runs an action on it.
  // Either way the reply replaces the list on screen.
  const requestTeam = (requestBody?: Record<string, unknown>) =>
    callApi<TeamReply>("/api/team", requestBody)
      .then((teamReply) => {
        setMembers(teamReply.members);
        setCanManage(teamReply.canManage);
        setAccessError(null);
      })
      .catch((thrownError: Error) => setAccessError(thrownError.message));
  // Loads the access list each time the Access screen opens.
  useEffect(() => {
    if (currentTab === "Access") requestTeam();
  }, [currentTab]);
  // Loads the store overview. Errors are shown on the screen instead of being thrown.
  const loadStoreOverview = () =>
    callApi<StoreOverviewReply>("/api/store-overview")
      .then((overviewReply) => {
        setStoreOverview(overviewReply);
        setStoreOverviewError(null);
      })
      .catch((thrownError: Error) => setStoreOverviewError(thrownError.message));
  // Loads the store overview each time its screen opens, so the figures are current.
  useEffect(() => {
    if (currentTab === "Store overview") loadStoreOverview();
  }, [currentTab]);
  // Shows the overview a save sent back, so the figures update without a page refresh.
  const showStoreOverview = (overviewReply: StoreOverviewReply) => {
    setStoreOverview(overviewReply);
    setStoreOverviewError(null);
  };
  // Saves one department's weekly sales. A failed save is thrown back to the screen.
  const saveDepartmentSales = (departmentId: number, weeklySales: number) =>
    callApi<StoreOverviewReply>("/api/store-overview/sales", { departmentId, weeklySales }).then(showStoreOverview);
  // Saves the store payroll target. Blank clears it.
  const saveStorePayroll = (payrollPercentText: string) =>
    callApi<StoreOverviewReply>("/api/store-overview/payroll", { payrollPercent: payrollPercentText }).then(showStoreOverview);

  // Signs out and returns to the sign-in page.
  const signOut = () =>
    fetch("/api/logout", { method: "POST" }).finally(() => {
      window.location.href = "/login";
    });
  // Saves the chosen department, then reloads so every part of the page shows that department's data.
  const switchDepartment = (nextDepartmentId: number) =>
    callApi("/api/department", { departmentId: nextDepartmentId })
      .then(() => window.location.reload())
      .catch((thrownError: Error) => setLoadError(thrownError.message));

  if (!data)
    return loadError ? (
      <main className='mx-auto max-w-xl p-8'>
        <div className='rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900'>
          <b>Could not load data.</b>
          <div className='mt-1 break-words'>{loadError}</div>
          <div className='mt-2 text-amber-800'>
            If you should have access, ask an owner to add you on the Access
            tab.
          </div>
        </div>
      </main>
    ) : (
      <main className='p-8 text-sm text-slate-500'>
        Loading…
        {isSlow && (
          <div className='mt-2 max-w-md text-amber-700'>
            This is taking longer than usual. The database may be busy or waking
            up. If it never loads, check the terminal or the Vercel logs.
          </div>
        )}
      </main>
    );

  // Generates a new schedule for the department and keeps any warnings it returns.
  const generateSchedule = () => {
    setIsGenerating(true);
    setSwapMessage(null);
    callApi<GenerateResult>("/api/generate", {})
      .then((generatedResult) => {
        setScheduleWarnings(generatedResult.warnings ?? []);
        setData(generatedResult);
      })
      .catch((thrownError: Error) => alert(thrownError.message))
      .finally(() => setIsGenerating(false));
  };

  // Reads a backup file and replaces the department's data with it, after the person confirms.
  const importBackupFile = async (selectedFile: File | undefined) => {
    if (!selectedFile) return;
    let parsedBackup: unknown;
    try {
      parsedBackup = JSON.parse(await selectedFile.text());
    } catch {
      setBackupMessage({ tone: "warn", text: "That file is not valid JSON." });
      return;
    }
    if (
      !window.confirm(
        "Importing replaces ALL current employees, shifts, settings and the schedule with the contents of this file. Export first if you want a backup. Continue?",
      )
    )
      return;
    setIsImporting(true);
    setBackupMessage({
      tone: "info",
      text: "Importing. This can take a little while on a slow connection, so please do not click again.",
    });
    try {
      const importedData = await callApi<Snapshot>("/api/import", parsedBackup);
      setData(importedData);
      setScheduleWarnings([]);
      setBackupMessage({
        tone: "ok",
        text: `Imported ${importedData.employees.length} employees, ${importedData.shift_templates.length} shift templates and ${importedData.schedule.length} scheduled shifts.`,
      });
    } catch (thrownError) {
      setBackupMessage({ tone: "warn", text: (thrownError as Error).message });
    } finally {
      setIsImporting(false);
    }
  };

  // Swaps the closing shifts on one day, and shows the result message.
  const swapClosersForDay = (dayNumber: number) =>
    callApi<SwapReply>("/api/swap", { day: dayNumber })
      .then((swapResult) => {
        if (swapResult.ok) setData(swapResult);
        setSwapMessage({
          tone: swapResult.ok ? "ok" : "warn",
          text: swapResult.message,
        });
      })
      .catch((thrownError: Error) =>
        setSwapMessage({ tone: "warn", text: thrownError.message }),
      );

  // Saves the weekly sales forecast typed on the Schedule screen.
  const saveForecast = (forecastText: string) =>
    callApi<Snapshot>("/api/data", {
      action: "save",
      table: "settings",
      row: { ...data.settings, weekly_sales: forecastText },
    })
      .then(setData)
      .catch((thrownError: Error) => alert(thrownError.message));

  // Access screen actions: add a department manager or remove one.
  const addMember = () =>
    requestTeam({ action: "add", email: newEmail }).then(() => setNewEmail(""));
  const removeMember = (memberId: number) =>
    requestTeam({ action: "remove", id: memberId });
  const editMember = (memberId: number, editedEmail: string) =>
    requestTeam({ action: "update", id: memberId, email: editedEmail });

  return (
    <div className='min-h-screen pb-24 md:pb-10'>
      <AppHeader
        currentUser={currentUser}
        currentTab={currentTab}
        visibleTabs={visibleTabsFor(currentUser?.canSeeStoreOverview ?? false)}
        onSelectTab={setCurrentTab}
        onSwitchDepartment={switchDepartment}
        onSignOut={signOut}
      />

      <main className='mx-auto max-w-6xl px-4 py-6'>
        {currentTab === "Schedule" && (
          <ScheduleScreen
            data={data}
            staffingCheck={staffingCheck}
            warnings={scheduleWarnings}
            isGenerating={isGenerating}
            swapMessage={swapMessage}
            onGenerate={generateSchedule}
            onSaveForecast={saveForecast}
            onSwapClosers={swapClosersForDay}
            onShiftSaved={(savedData) => setData(savedData)}
          />
        )}

        {currentTab === "Team" && (
          <TeamScreen
            employees={data.employees}
            shiftTemplates={data.shift_templates}
            onDataChange={setData}
            highlightedId={highlightedIdFor("employees")}
            onRowAdded={(newRowId) => markRowAsNew("employees", newRowId)}
          />
        )}

        {currentTab === "Availability" && (
          <AvailabilityScreen
            employees={data.employees}
            onDataChange={setData}
          />
        )}

        {currentTab === "Shifts" && (
          <ShiftsScreen
            shiftTemplates={data.shift_templates}
            employees={data.employees}
            onDataChange={setData}
            highlightedId={highlightedIdFor("shift_templates")}
            onRowAdded={(newRowId) => markRowAsNew("shift_templates", newRowId)}
          />
        )}

        {currentTab === "Settings" && (
          <SettingsScreen
            data={data}
            onDataChange={setData}
            isImporting={isImporting}
            backupMessage={backupMessage}
            onImportFile={importBackupFile}
          />
        )}

        {currentTab === "Access" && (
          <AccessScreen
            departmentName={currentUser?.departmentName}
            storeName={currentUser?.storeName}
            isCompanyAdmin={currentUser?.isCompanyAdmin ?? false}
            currentEmail={currentUser?.email ?? ""}
            canSeeStoreManagers={currentUser?.canSeeStoreManagers ?? false}
            members={members}
            canManage={canManage}
            accessError={accessError}
            newEmail={newEmail}
            onNewEmailChange={setNewEmail}
            onRemoveMember={removeMember}
            onEditMember={editMember}
            onAddMember={addMember}
          />
        )}

        {currentTab === "Store overview" && (
          <StoreOverviewScreen
            overview={storeOverview}
            storeName={currentUser?.storeName}
            loadError={storeOverviewError}
            onSaveDepartmentSales={saveDepartmentSales}
            onSaveStorePayroll={saveStorePayroll}
          />
        )}
      </main>

      <MobileTabBar
        currentTab={currentTab}
        visibleTabs={visibleTabsFor(currentUser?.canSeeStoreOverview ?? false)}
        onSelectTab={setCurrentTab}
      />
    </div>
  );
}
