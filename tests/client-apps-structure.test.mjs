import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = async (path) => readFile(new URL(path, root), "utf8");

test("ships a PKCE-protected client API and Chrome timer extension", async () => {
  const [
    schema,
    migration,
    sitesMigration,
    authorize,
    token,
    clockIn,
    runtimeConfig,
    worker,
    auth,
    manifest,
    popup,
  ] = await Promise.all([
    source("db/schema.ts"),
    source("migrations/0020_client_api_sessions.sql"),
    source("drizzle/0023_client_api_sessions.sql"),
    source("app/api/v1/auth/authorize/route.ts"),
    source("app/api/v1/auth/token/route.ts"),
    source("app/api/v1/time/clock-in/route.ts"),
    source("lib/runtime-config.ts"),
    source("worker/index.ts"),
    source("lib/auth.ts"),
    source("apps/chrome-extension/manifest.json"),
    source("apps/chrome-extension/popup.js"),
  ]);

  await access(new URL("apps/chrome-extension/background.js", root));
  assert.match(schema, /clientSessions/);
  assert.match(schema, /oauthAuthorizationCodes/);
  assert.match(migration, /CREATE TABLE `client_sessions`/);
  assert.match(migration, /CREATE TABLE `oauth_authorization_codes`/);
  assert.match(sitesMigration, /CREATE TABLE IF NOT EXISTS `client_sessions`/);
  assert.match(
    sitesMigration,
    /CREATE TABLE IF NOT EXISTS `oauth_authorization_codes`/,
  );
  assert.match(authorize, /code_challenge_method/);
  assert.match(authorize, /getGoogleSessionEmail/);
  assert.match(authorize, /createClientAuthorizationCode/);
  assert.match(token, /refresh_token/);
  assert.match(clockIn, /clientUser\.clientType/);
  assert.match(runtimeConfig, /CHROME_EXTENSION_ID/);
  assert.match(runtimeConfig, /candidate ===/);
  assert.match(runtimeConfig, /getClientAuthSecret/);
  assert.match(runtimeConfig, /getAppMode\(\) === "demo"/);
  assert.match(worker, /isChromeExtension/);
  assert.match(worker, /configuredExtensionOrigin/);
  assert.match(worker, /Cross-site request rejected/);
  assert.match(worker, /Too many authentication attempts/);
  assert.match(auth, /isClientPathAllowed/);
  assert.match(auth, /"\/api\/v1\/time\/status"/);
  assert.match(manifest, /"manifest_version": 3/);
  assert.match(manifest, /"key":/);
  assert.match(manifest, /"identity"/);
  assert.match(manifest, /icons\/icon-128\.png/);
  assert.match(
    await source("scripts/package-chrome-extension.sh"),
    /grep -Fxq "icons\/icon-16\.png"/,
  );
  assert.match(popup, /time\/clock-in/);
  assert.match(popup, /time\/clock-out/);
  assert.match(popup, /workedMinutesToday/);
});

test("ships a native mobile foundation without reusing the web bundle", async () => {
  const [
    mobilePackage,
    appConfig,
    sessionProvider,
    homeScreen,
    timeScreen,
    homeRoute,
    peopleRoute,
    leaveRoute,
    leaveReviewRoute,
    workModeRoute,
    expenseSubmitRoute,
    expenseReviewRoute,
    notificationsRoute,
    timeOverviewRoute,
    timeBreakRoute,
    timeManualRoute,
    personRoute,
    organizationRoute,
    knowledgeArticleRoute,
    fileRoute,
    preferencesRoute,
    adminOverviewRoute,
    adminUsersRoute,
    adminBugsRoute,
    adminAccessRoute,
    adminBalancesRoute,
    adminOrgRoute,
    adminReimbursementsRoute,
    adminLeaveTypesRoute,
    adminOrgCreateRoute,
    teamTimeRoute,
    correctionCreateRoute,
    correctionReviewRoute,
    timesheetPeriodRoute,
    bugRoute,
    operationsScreen,
    storage,
  ] = await Promise.all([
    source("apps/mobile/package.json"),
    source("apps/mobile/app.json"),
    source("apps/mobile/providers/session-provider.tsx"),
    source("apps/mobile/app/(tabs)/home.tsx"),
    source("apps/mobile/app/(tabs)/time.tsx"),
    source("app/api/v1/home/route.ts"),
    source("app/api/v1/people/route.ts"),
    source("app/api/v1/leave/route.ts"),
    source("app/api/v1/leave/[id]/route.ts"),
    source("app/api/v1/work-mode/route.ts"),
    source("app/api/v1/expenses/submit/route.ts"),
    source("app/api/v1/expenses/[id]/route.ts"),
    source("app/api/v1/notifications/route.ts"),
    source("app/api/v1/time/overview/route.ts"),
    source("app/api/v1/time/break/route.ts"),
    source("app/api/v1/time/manual/route.ts"),
    source("app/api/v1/people/[id]/route.ts"),
    source("app/api/v1/organization/route.ts"),
    source("app/api/v1/knowledge/[id]/route.ts"),
    source("app/api/v1/files/[id]/route.ts"),
    source("app/api/v1/preferences/route.ts"),
    source("app/api/v1/admin/overview/route.ts"),
    source("app/api/v1/admin/users/[id]/route.ts"),
    source("app/api/v1/admin/bugs/[id]/route.ts"),
    source("app/api/v1/admin/access/[id]/route.ts"),
    source("app/api/v1/admin/balances/[id]/route.ts"),
    source("app/api/v1/admin/org-units/[id]/route.ts"),
    source("app/api/v1/admin/reimbursements/[id]/route.ts"),
    source("app/api/v1/admin/leave-types/[id]/route.ts"),
    source("app/api/v1/admin/org-units/route.ts"),
    source("app/api/v1/time/team/route.ts"),
    source("app/api/v1/time/corrections/route.ts"),
    source("app/api/v1/time/corrections/[id]/route.ts"),
    source("app/api/v1/time/periods/[employeeId]/route.ts"),
    source("app/api/v1/bugs/route.ts"),
    source("apps/mobile/app/operations.tsx"),
    source("apps/mobile/lib/storage.ts"),
  ]);

  await access(new URL("apps/mobile/eas.json", root));
  assert.match(mobilePackage, /expo-router/);
  assert.match(appConfig, /"scheme": "incora-people"/);
  assert.match(sessionProvider, /expo-auth-session/);
  assert.match(sessionProvider, /usePKCE: true/);
  assert.match(sessionProvider, /exchangeAuthorizationCode/);
  assert.match(storage, /expo-secure-store/);
  assert.match(homeScreen, /updateTask/);
  assert.match(timeScreen, /clockIn\(/);
  assert.match(timeScreen, /clockOut\(/);
  assert.match(timeScreen, /requestTimeCorrection/);
  assert.match(timeScreen, /projectId/);
  assert.match(homeRoute, /getDashboardData/);
  assert.match(peopleRoute, /getEmployeeDirectory/);
  assert.match(leaveRoute, /getLeaveOverview/);
  assert.match(leaveReviewRoute, /reviewLeaveForClient/);
  assert.match(workModeRoute, /getApiClientUser/);
  assert.match(expenseSubmitRoute, /getApiClientUser/);
  assert.match(expenseSubmitRoute, /validatePrivateFile/);
  assert.match(expenseReviewRoute, /reviewExpenseForClient/);
  assert.match(notificationsRoute, /getApiClientUser/);
  assert.match(notificationsRoute, /updateNotificationsSchema/);
  assert.match(timeOverviewRoute, /getTimeOverview/);
  assert.match(timeBreakRoute, /changeBreak/);
  assert.match(timeManualRoute, /manualTimeEntrySchema/);
  assert.match(personRoute, /getEmployeeProfileRecords/);
  assert.match(organizationRoute, /getOrgUnits/);
  assert.match(knowledgeArticleRoute, /getKnowledgeArticle/);
  assert.match(fileRoute, /getAuthorizedStoredFile/);
  assert.match(preferencesRoute, /update\(users\)/);
  assert.match(adminOverviewRoute, /manageSettings/);
  assert.match(adminUsersRoute, /isProtectedSuperAdminEmail/);
  assert.match(adminBugsRoute, /bug_report\.resolved/);
  assert.match(adminAccessRoute, /access_policy_updated/);
  assert.match(adminBalancesRoute, /leave_balance_updated/);
  assert.match(adminOrgRoute, /organization\.unit_updated/);
  assert.match(adminReimbursementsRoute, /reimbursement_policy_updated/);
  assert.match(adminLeaveTypesRoute, /leave_policy_updated/);
  assert.match(adminOrgCreateRoute, /organization\.unit_created/);
  assert.match(teamTimeRoute, /getTeamTimesheets/);
  assert.match(correctionCreateRoute, /timeCorrectionSchema/);
  assert.match(correctionReviewRoute, /reviewTimeCorrectionSchema/);
  assert.match(timesheetPeriodRoute, /updateTimesheetPeriodSchema/);
  assert.match(bugRoute, /validatePrivateImage/);
  assert.match(operationsScreen, /submitBugReport/);
  assert.match(operationsScreen, /expo-image-picker/);
});

test("ships complete Mobile 1.0 employee modules and push infrastructure", async () => {
  const [
    calendar,
    tasks,
    announcements,
    documents,
    expenses,
    more,
    taskRoute,
    announcementRoute,
    pushRoute,
    pushService,
    worker,
    pushClient,
    schema,
    migration,
    sitesMigration,
    config,
  ] = await Promise.all([
    source("apps/mobile/app/calendar.tsx"),
    source("apps/mobile/app/tasks.tsx"),
    source("apps/mobile/app/announcements.tsx"),
    source("apps/mobile/app/documents.tsx"),
    source("apps/mobile/app/expenses.tsx"),
    source("apps/mobile/app/(tabs)/more.tsx"),
    source("app/api/v1/tasks/route.ts"),
    source("app/api/v1/announcements/route.ts"),
    source("app/api/v1/push-tokens/route.ts"),
    source("modules/notifications/push.ts"),
    source("worker/index.ts"),
    source("apps/mobile/lib/push.ts"),
    source("db/schema.ts"),
    source("migrations/0021_mobile_push_tokens.sql"),
    source("drizzle/0024_mobile_push_tokens.sql"),
    source("apps/mobile/app.json"),
  ]);

  assert.match(calendar, /getLeaveCalendar/);
  assert.match(calendar, /changeMonth/);
  assert.match(tasks, /getTasks/);
  assert.match(tasks, /createTask/);
  assert.match(tasks, /updateTask/);
  assert.match(announcements, /getAnnouncements/);
  assert.match(announcements, /createAnnouncement/);
  assert.match(documents, /downloadAndOpenFile/);
  assert.match(documents, /companyDocuments/);
  assert.match(expenses, /submitExpense/);
  assert.match(expenses, /reviewExpense/);
  assert.match(expenses, /openReceipt/);
  assert.match(more, /router\.push\("\/calendar"\)/);
  assert.match(more, /router\.push\("\/tasks"\)/);
  assert.match(more, /router\.push\("\/announcements"\)/);
  assert.match(more, /router\.push\("\/documents"\)/);
  assert.match(more, /router\.push\("\/expenses"\)/);
  assert.match(taskRoute, /getTaskWorkspaceData/);
  assert.match(taskRoute, /createTaskSchema/);
  assert.match(announcementRoute, /announcementSchema/);
  assert.match(pushRoute, /clientType !== "mobile"/);
  assert.match(pushService, /enqueuePushNotifications/);
  assert.match(worker, /exp\.host\/--\/api\/v2\/push\/send/);
  assert.match(pushClient, /getExpoPushTokenAsync/);
  assert.match(schema, /mobilePushTokens/);
  assert.match(migration, /CREATE TABLE `mobile_push_tokens`/);
  assert.match(
    sitesMigration,
    /CREATE TABLE IF NOT EXISTS `mobile_push_tokens`/,
  );
  assert.match(config, /expo-notifications/);
  assert.match(config, /"icon": "\.\/assets\/notification-icon\.png"/);
});

test("hardens client sessions, native branding and Android release output", async () => {
  const [
    extensionAuth,
    extensionPopup,
    serverAuth,
    mobilePackage,
    mobileConfig,
    mobileSession,
    mobileLayout,
    mobileCallback,
    mobileApi,
    androidBuild,
  ] = await Promise.all([
    source("apps/chrome-extension/auth.js"),
    source("apps/chrome-extension/popup.js"),
    source("lib/auth.ts"),
    source("apps/mobile/package.json"),
    source("apps/mobile/app.json"),
    source("apps/mobile/providers/session-provider.tsx"),
    source("apps/mobile/app/_layout.tsx"),
    source("apps/mobile/app/auth/callback.tsx"),
    source("apps/mobile/lib/api.ts"),
    source("apps/mobile/android/app/build.gradle"),
  ]);

  assert.match(extensionAuth, /storage\("session"/);
  assert.match(extensionAuth, /navigator\.locks\.request/);
  assert.match(extensionAuth, /api\/v1\/auth\/revoke/);
  assert.match(extensionPopup, /revokeAndClearSession/);
  assert.match(serverAuth, /"\/api\/v1\/auth\/revoke"/);
  assert.match(mobilePackage, /"expo-constants"/);
  assert.match(mobilePackage, /"expo-linking"/);
  assert.match(mobileConfig, /"icon": "\.\/assets\/icon\.png"/);
  assert.match(mobileConfig, /"blockedPermissions"/);
  assert.match(mobileSession, /refreshPromise/);
  assert.match(mobileSession, /revokeSession/);
  assert.match(mobileLayout, /SessionGate/);
  assert.match(mobileLayout, /Redirect href="\/sign-in"/);
  assert.match(mobileCallback, /Завершуємо вхід/);
  assert.match(mobileApi, /AbortController/);
  assert.match(mobileApi, /minimumClientVersion/);

  const releaseBlock = androidBuild.match(
    /release \{([\s\S]*?)\n        \}/,
  )?.[1];
  assert.ok(releaseBlock);
  assert.doesNotMatch(releaseBlock, /signingConfig signingConfigs\.debug/);

  await Promise.all([
    access(new URL("apps/mobile/assets/icon.png", root)),
    access(new URL("apps/mobile/assets/adaptive-icon.png", root)),
    access(new URL("apps/mobile/assets/notification-icon.png", root)),
    access(new URL("apps/mobile/assets/splash-icon.png", root)),
  ]);
});
