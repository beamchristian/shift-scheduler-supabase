"use client";
import { useEffect, useRef, useState } from "react";
import { AppHeader } from "../components/AppHeader";
import { MobileTabBar } from "../components/MobileTabBar";
import { AccessScreen } from "../components/screens/AccessScreen";
import { AvailabilityScreen } from "../components/screens/AvailabilityScreen";
import { ScheduleScreen } from "../components/screens/ScheduleScreen";
import { WeekBar } from "../components/screens/schedule/WeekBar";
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
  WeekListReply,
} from "../components/types";
import type { Snapshot, StoreHour, TableName } from "../lib/types";
import { callApi } from "../lib/ui/format";
import { isPastWeek, isWeekStart, todayInStore, upcomingWeekStart, weekLabel } from "../lib/weeks";
import type { StoreOverview } from "../lib/storeOverview";
import { visibleTabsFor } from "../components/types";

// The reply from the team endpoint: the access list, and whether the signed-in person may change it.
type TeamReply = { members: AccessMember[]; canManage: boolean };

// The reply from the store overview endpoint: the store's name, plus the combined figures.
type StoreOverviewReply = StoreOverview & { storeName: string; weekStart: string; storePayrollPercent: number | null };

// The reply from the swap-closers endpoint: the new data, whether the swap worked, and a message to show.
type SwapReply = Snapshot & { ok: boolean; message: string };

// The week to open first: the one in the address ("?week=YYYY-MM-DD") so a refresh stays put,
// otherwise the upcoming week.
function initialWeekStart(): string {
  if (typeof window === "undefined") return upcomingWeekStart();
  const weekInAddress = new URLSearchParams(window.location.search).get("week") ?? "";
  return isWeekStart(weekInAddress) ? weekInAddress : upcomingWeekStart();
}

// Puts the week in the address bar without reloading, so a refresh or a shared link opens the same week.
function rememberWeekInAddress(weekStart: string) {
  const address = new URL(window.location.href);
  address.searchParams.set("week", weekStart);
  window.history.replaceState(null, "", address);
}

// The main page. It loads the department's data, holds the state the screens share,
// and shows the screen the person picked.
export default function Page() {
  // The department's data for the week on screen, and the screen that is showing.
  const [data, setData] = useState<Snapshot | null>(null);
  // The week being looked at (its Monday), the saved weeks, and where today falls.
  const [weekStart, setWeekStart] = useState<string>(initialWeekStart);
  const [weekList, setWeekList] = useState<WeekListReply | null>(null);
  const [isWeekLoading, setIsWeekLoading] = useState(false);
  // True while the week on screen is being published or unpublished.
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  // Counts week loads, so a slow reply for a week the person has already moved past is ignored.
  const latestWeekLoad = useRef(0);
  // True once any week has loaded. After that, a failed load shows a message instead of the full-page error.
  const hasLoadedData = useRef(false);
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
  // Loads the list of saved weeks, and where today falls. Called on opening and after a schedule is saved.
  const loadWeekList = () =>
    callApi<WeekListReply>("/api/week")
      .then(setWeekList)
      .catch(() => undefined);
  // Loads the department's data for the week on screen, each time the week changes.
  useEffect(() => {
    const thisLoad = ++latestWeekLoad.current;
    setIsWeekLoading(true);
    rememberWeekInAddress(weekStart);
    callApi<Snapshot>(`/api/data?week=${weekStart}`)
      .then((weekData) => {
        if (thisLoad !== latestWeekLoad.current) return;
        hasLoadedData.current = true;
        setData(weekData);
      })
      .catch((thrownError: Error) => {
        if (hasLoadedData.current) alert(`Could not open that week: ${thrownError.message}`);
        else setLoadError(thrownError.message);
      })
      .finally(() => {
        if (thisLoad === latestWeekLoad.current) setIsWeekLoading(false);
      });
  }, [weekStart]);
  useEffect(() => {
    loadWeekList();
  }, []);
  // Runs the staffing check again whenever the data changes.
  useEffect(() => {
    if (data)
      callApi<StaffingCheck>("/api/preview", { week: data.week.week_start })
        .then(setStaffingCheck)
        .catch(() => setStaffingCheck(null));
  }, [data]);
  // Opens another week. Messages from the last week's actions are cleared.
  const changeWeek = (nextWeekStart: string) => {
    if (!isWeekStart(nextWeekStart) || nextWeekStart === weekStart) return;
    setScheduleWarnings([]);
    setSwapMessage(null);
    setWeekStart(nextWeekStart);
  };
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
  // Loads the store overview for the week on screen. Errors are shown on the screen instead of being thrown.
  const loadStoreOverview = () =>
    callApi<StoreOverviewReply>(`/api/store-overview?week=${weekStart}`)
      .then((overviewReply) => {
        setStoreOverview(overviewReply);
        setStoreOverviewError(null);
      })
      .catch((thrownError: Error) => setStoreOverviewError(thrownError.message));
  // Loads the store overview each time its screen opens, so the figures are current.
  useEffect(() => {
    if (currentTab === "Store overview") loadStoreOverview();
  }, [currentTab, weekStart]);
  // Shows the overview a save sent back, so the figures update without a page refresh.
  const showStoreOverview = (overviewReply: StoreOverviewReply) => {
    setStoreOverview(overviewReply);
    setStoreOverviewError(null);
  };
  // Saves one department's sales forecast for the week on screen. A failed save is thrown back to the screen.
  const saveDepartmentSales = (departmentId: number, weeklySales: number) =>
    callApi<StoreOverviewReply>("/api/store-overview/sales", { departmentId, weeklySales, week: weekStart }).then(
      showStoreOverview,
    );
  // Saves the store payroll target. Blank clears it.
  const saveStorePayroll = (payrollPercentText: string) =>
    callApi<StoreOverviewReply>("/api/store-overview/payroll", {
      payrollPercent: payrollPercentText,
      week: weekStart,
    }).then(showStoreOverview);

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

  // The week on screen. Every change is sent for this week, so it always lands on what the person sees.
  const shownWeek = data.week.week_start;
  // A published week can't be changed until it is unpublished. A past week can, after a warning.
  const isLocked = data.week.status === "published";
  const isPast = isPastWeek(shownWeek, weekList?.today ?? todayInStore());
  // The question asked before changing a week that is already over, or null when no question is needed.
  const pastWeekQuestion = isPast
    ? `${weekLabel(shownWeek)} is already over. Changing it changes the record of what was scheduled. Continue?`
    : null;
  // Asks before changing a past week. Returns true when the change may go ahead.
  const confirmPastWeekChange = () => !pastWeekQuestion || window.confirm(pastWeekQuestion);

  // Publishes the week on screen, making it the official schedule.
  const publishShownWeek = () => {
    setIsChangingStatus(true);
    callApi<Snapshot>("/api/week", { action: "publish", week: shownWeek })
      .then((weekData) => {
        setData(weekData);
        loadWeekList();
      })
      .catch((thrownError: Error) => alert(thrownError.message))
      .finally(() => setIsChangingStatus(false));
  };
  // Unpublishes the week on screen after the person confirms, so it can be changed again.
  const unpublishShownWeek = () => {
    if (
      !window.confirm(
        `Unpublish ${weekLabel(shownWeek)}? It goes back to a draft so it can be regenerated or edited. Remember to publish it again when it is ready.`,
      )
    )
      return;
    setIsChangingStatus(true);
    callApi<Snapshot>("/api/week", { action: "unpublish", week: shownWeek })
      .then((weekData) => {
        setData(weekData);
        loadWeekList();
      })
      .catch((thrownError: Error) => alert(thrownError.message))
      .finally(() => setIsChangingStatus(false));
  };

  // Generates a new schedule for the week on screen and keeps any warnings it returns.
  const generateSchedule = () => {
    if (!confirmPastWeekChange()) return;
    setIsGenerating(true);
    setSwapMessage(null);
    callApi<GenerateResult>("/api/generate", { week: shownWeek })
      .then((generatedResult) => {
        setScheduleWarnings(generatedResult.warnings ?? []);
        setData(generatedResult);
        loadWeekList();
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
        `Importing replaces ALL current employees, shifts and settings, and clears EVERY saved week. The file's schedule becomes a draft for ${weekLabel(shownWeek)}. Export first if you want a backup. Continue?`,
      )
    )
      return;
    setIsImporting(true);
    setBackupMessage({
      tone: "info",
      text: "Importing. This can take a little while on a slow connection, so please do not click again.",
    });
    try {
      const importedData = await callApi<Snapshot>(`/api/import?week=${shownWeek}`, parsedBackup);
      setData(importedData);
      loadWeekList();
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
  const swapClosersForDay = (dayNumber: number) => {
    if (!confirmPastWeekChange()) return;
    callApi<SwapReply>("/api/swap", { day: dayNumber, week: shownWeek })
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
  };

  // Saves the sales forecast for the week on screen. Nothing is saved when the box hasn't changed.
  // Returns false when the person cancels the past-week question, so the box can go back to the saved value.
  const saveForecast = (forecastText: string): boolean => {
    if (Number(forecastText) === Number(data.week.weekly_sales ?? data.settings.weekly_sales)) return true;
    if (!confirmPastWeekChange()) return false;
    callApi<Snapshot>("/api/week", {
      action: "forecast",
      week: shownWeek,
      weeklySales: forecastText,
    })
      .then((weekData) => {
        setData(weekData);
        loadWeekList();
      })
      .catch((thrownError: Error) => alert(thrownError.message));
    return true;
  };

  // Saves one day's weight, typed in the labor matrix on the Schedule screen.
  const saveDayWeight = (dayWeightRow: StoreHour, newWeightText: string) =>
    callApi<Snapshot>("/api/data", {
      action: "save",
      table: "store_hours",
      row: { ...dayWeightRow, sales_pct: newWeightText },
      week: shownWeek,
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
            weekBar={
              <WeekBar
                week={data.week}
                hasShifts={data.schedule.length > 0}
                savedWeeks={weekList?.weeks ?? []}
                today={weekList?.today ?? data.week.week_start}
                currentWeek={weekList?.currentWeek ?? ""}
                upcomingWeek={weekList?.upcomingWeek ?? upcomingWeekStart()}
                isLoading={isWeekLoading}
                isChangingStatus={isChangingStatus}
                onChangeWeek={changeWeek}
                onPublish={publishShownWeek}
                onUnpublish={unpublishShownWeek}
              />
            }
            isLocked={isLocked}
            pastWeekQuestion={pastWeekQuestion}
            staffingCheck={staffingCheck}
            warnings={scheduleWarnings}
            isGenerating={isGenerating}
            swapMessage={swapMessage}
            onGenerate={generateSchedule}
            onSaveForecast={saveForecast}
            onSwapClosers={swapClosersForDay}
            onShiftSaved={(savedData) => setData(savedData)}
            onSaveDayWeight={saveDayWeight}
          />
        )}

        {currentTab === "Team" && (
          <TeamScreen
            weekStart={shownWeek}
            employees={data.employees}
            shiftTemplates={data.shift_templates}
            onDataChange={setData}
            highlightedId={highlightedIdFor("employees")}
            onRowAdded={(newRowId) => markRowAsNew("employees", newRowId)}
          />
        )}

        {currentTab === "Availability" && (
          <AvailabilityScreen
            weekStart={shownWeek}
            employees={data.employees}
            onDataChange={setData}
          />
        )}

        {currentTab === "Shifts" && (
          <ShiftsScreen
            weekStart={shownWeek}
            shiftTemplates={data.shift_templates}
            employees={data.employees}
            onDataChange={setData}
            highlightedId={highlightedIdFor("shift_templates")}
            onRowAdded={(newRowId) => markRowAsNew("shift_templates", newRowId)}
          />
        )}

        {currentTab === "Settings" && (
          <SettingsScreen
            weekStart={shownWeek}
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
