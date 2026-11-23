import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("ships the INCORA branded application shell", async () => {
  const [layout, shell, css, tokens] = await Promise.all([
    source("app/layout.tsx"),
    source("components/AppShell.tsx"),
    source("app/globals.css"),
    source("app/styles/tokens.css"),
  ]);

  assert.match(layout, /INCORA People/);
  assert.match(layout, /favicon\.svg/);
  assert.match(layout, /og\.png/);
  assert.match(shell, /incora-logo\.png/);
  assert.match(shell, /Home/);
  assert.match(shell, /People/);
  assert.match(shell, /Time/);
  assert.match(css, /styles\/tokens\.css/);
  assert.match(tokens, /--incora-yellow:\s*#fec506/i);
  assert.match(tokens, /--black:\s*var\(--ink-deep\)/i);
});

test("profile emergency contacts are labeled and localized in Ukrainian", async () => {
  const [records, translations] = await Promise.all([
    source("components/EmployeeProfileRecords.tsx"),
    source("lib/i18n.ts"),
  ]);
  assert.match(records, /Contact name/);
  assert.match(records, /record\.title/);
  assert.match(records, /Relationship/);
  assert.match(records, /record\.subtitle/);
  assert.match(records, /Phone number/);
  assert.match(records, /record\.notes/);
  assert.match(translations, /"Edit profile record": "Редагувати запис"/);
  assert.match(translations, /"Add profile record": "Додати запис"/);
  assert.match(translations, /"Contact name": "Ім’я контактної особи"/);
  assert.match(translations, /Relationship: "Стосунок"/);
  assert.match(translations, /"Phone number": "Номер для екстреного зв’язку"/);
});

test("profile cards share headings, Personal cards use one column, and Work keeps one timeline", async () => {
  const [profile, records, heading, css] = await Promise.all([
    source("app/employees/[id]/page.tsx"),
    source("components/EmployeeProfileRecords.tsx"),
    source("components/ProfileCardHeading.tsx"),
    source("app/globals.css"),
  ]);
  assert.match(profile, /EmployeeProfileEditButton/);
  assert.match(profile, /personalLayout/);
  assert.match(profile, /emoji="💼"/);
  assert.match(profile, /emoji="🔄"/);
  assert.match(profile, /label=\{t\("Lifecycle stage"\)\}/);
  assert.doesNotMatch(profile, /title=\{t\("Employment status"\)\}/);
  assert.match(profile, /emoji="🕘"/);
  assert.match(profile, /latestEmploymentStateChangeDate/);
  assert.match(profile, /Effective since/);
  assert.doesNotMatch(profile, /Employment dates|Experience and exit/);
  assert.match(profile, /items={visibleRelationships\.teammates}/);
  assert.doesNotMatch(profile, /profile-team-name/);
  assert.match(records, /profile-record-grid-personal/);
  assert.match(heading, /aria-hidden="true"/);
  assert.match(
    css,
    /\.profile-record-grid-personal\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
  );
  assert.match(
    css,
    /\.profile-relationship-person\s*\{[\s\S]*?grid-template-columns:\s*40px minmax\(0, 1fr\)/,
  );
});

test("position add goes through canonical employee update with effective date and reason", async () => {
  const [profile, actions, update, contract] = await Promise.all([
    source("app/employees/[id]/page.tsx"),
    source("components/EmployeeProfileActions.tsx"),
    source("app/api/employees/[id]/route.ts"),
    source("modules/people/contracts.ts"),
  ]);
  assert.match(profile, /mode="employment-change"/);
  assert.match(
    actions,
    /mode\?: "profile" \| "employment-change" \| "employment-edit"/,
  );
  assert.match(actions, /effectiveDate: values\.effectiveDate/);
  assert.match(actions, /employmentChange: true/);
  assert.match(update, /employmentChangeEmployeeSchema/);
  assert.match(update, /latestEmploymentStateChangeDate/);
  assert.match(update, /conflict === "backdated"/);
  assert.match(update, /Change at least one employment field before saving/);
  assert.match(contract, /effectiveDate:/);
  assert.match(contract, /employmentChange:/);
});

test("employment forms are scoped, avoid sensitive payloads, and are blocked for inactive staff", async () => {
  const [profile, actions, route, contracts, privacy] = await Promise.all([
    source("app/employees/[id]/page.tsx"),
    source("components/EmployeeProfileActions.tsx"),
    source("app/api/employees/[id]/route.ts"),
    source("modules/people/contracts.ts"),
    source("modules/people/privacy.ts"),
  ]);
  assert.match(profile, /employee\.status !== "inactive"/);
  assert.match(profile, /mode="employment-edit"/);
  assert.match(actions, /employmentEdit: true/);
  assert.match(actions, /const employmentFields =/);
  assert.doesNotMatch(actions, /personalEmail: employee\.personalEmail/);
  assert.doesNotMatch(actions, /passportNumber: employee/);
  assert.match(contracts, /employmentCorrectionEmployeeSchema/);
  assert.match(route, /current\.status === "inactive"/);
  assert.match(route, /cannot be reactivated through generic profile updates/);
  assert.match(route, /sensitiveEmployeeMutationResponse/);
  assert.doesNotMatch(route, /content-length[\s\S]*256_000/);
  assert.match(route, /current\.personalEmail/);
  assert.match(privacy, /Object\.keys\(payload\)/);
  assert.match(privacy, /toEmployeeEditDto/);
});

test("includes Leave workflows and a company calendar", async () => {
  const [schema, createRoute, createCommand, reviewRoute, workspace, calendar] =
    await Promise.all([
      source("db/schema.ts"),
      source("app/api/leave/requests/route.ts"),
      source("modules/leave/commands.ts"),
      source("app/api/leave/requests/[id]/route.ts"),
      source("components/LeaveWorkspace.tsx"),
      source("components/CalendarWorkspace.tsx"),
    ]);

  assert.match(schema, /leaveBalances/);
  assert.match(schema, /leaveRequests/);
  assert.match(createRoute, /createLeaveRequestSchema/);
  assert.match(createCommand, /leave\.requested/);
  assert.match(reviewRoute, /Managers may review direct reports only/);
  assert.match(workspace, /Request leave/);
  assert.match(workspace, /workDays/);
  assert.match(workspace, /scheduledDays/);
  assert.match(workspace, /Leave request approved\./);
  assert.match(workspace, /aria-label=\{`\$\{t\("Approve leave request"\)/);
  assert.match(workspace, /role="alert"/);
  assert.match(calendar, /Company leave and availability/);
});

test("keeps leave approval scoped to another person and avoids orphaned requests", async () => {
  const [overview, recipients, command, webReview, clientReview] =
    await Promise.all([
      source("modules/leave/queries.ts"),
      source("modules/approvals/recipients.ts"),
      source("modules/leave/commands.ts"),
      source("app/api/leave/requests/[id]/route.ts"),
      source("modules/approvals/client-reviews.ts"),
    ]);

  assert.match(overview, /ne\(leaveRequests\.employeeId, user\.employeeId/);
  assert.match(recipients, /eq\(users\.enabled, true\)/);
  assert.match(recipients, /filter\(\(email\) => email !== requesterEmail\)/);
  assert.match(
    command,
    /const requiresApproval = type\.requiresApproval && recipientEmails\.length > 0/,
  );
  assert.match(webReview, /You cannot review your own leave request/);
  assert.match(clientReview, /You cannot review your own leave request/);
});

test("includes compact navigation, global search and manual time", async () => {
  const [shell, search, tracker, dialogs, manualRoute, css] = await Promise.all(
    [
      source("components/AppShell.tsx"),
      source("app/api/search/route.ts"),
      source("components/TimeTracker.tsx"),
      source("components/time/TimeEntryDialogs.tsx"),
      source("app/api/time/entries/route.ts"),
      source("app/globals.css"),
    ],
  );

  assert.match(shell, /Request leave/);
  assert.match(shell, /Notifications/);
  assert.match(search, /like\(employees\.jobTitle/);
  assert.match(tracker, /Monthly summary/);
  assert.match(tracker, /ManualEntryDialog/);
  assert.match(dialogs, /Add time manually/);
  assert.match(manualRoute, /time\.manual_entry_created/);
  assert.match(css, /Compact, familiar HR workspace scale/);
});

test("includes Core HR, Time and audit server surfaces", async () => {
  const [
    schema,
    employeeRoute,
    employeeCommand,
    timeRoute,
    timeCommands,
    migration,
  ] = await Promise.all([
    source("db/schema.ts"),
    source("app/api/employees/route.ts"),
    source("modules/people/commands.ts"),
    source("app/api/time/toggle/route.ts"),
    source("modules/time/client-commands.ts"),
    source("migrations/0000_production_baseline.sql"),
  ]);

  assert.match(schema, /employees/);
  assert.match(schema, /timeEntries/);
  assert.match(schema, /auditEvents/);
  assert.match(employeeRoute, /getAccessPolicy/);
  assert.match(employeeRoute, /createEmployee/);
  assert.match(employeeCommand, /employee\.created/);
  assert.match(timeRoute, /clientClockIn/);
  assert.match(timeRoute, /clientClockOut/);
  assert.match(timeCommands, /time\.clock_in/);
  assert.match(timeCommands, /time\.clock_out/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS employees/);
});

test("includes a global timer available from every page", async () => {
  const [shell, control, statusRoute] = await Promise.all([
    source("components/AppShell.tsx"),
    source("components/GlobalTimeControl.tsx"),
    source("app/api/time/status/route.ts"),
  ]);
  assert.match(shell, /GlobalTimeControl/);
  assert.match(control, /Start timer/);
  assert.match(control, /Start break/);
  assert.match(control, /api\/time\/clock-in/);
  assert.match(control, /api\/time\/clock-out/);
  assert.match(control, /selectedMode/);
  assert.match(control, /Where are you working/);
  assert.match(control, /api\/time\/break\/toggle/);
  assert.match(control, /content-type.*application\/json/);
  assert.match(control, /action: "start"/);
  assert.match(control, /breakId: openBreak\.id/);
  assert.match(statusRoute, /openBreak/);
});

test("includes editable admin policies, balances and access groups", async () => {
  const [schema, settings, accessRoute, balanceRoute, roleRoute] =
    await Promise.all([
      source("db/schema.ts"),
      source("components/AdminSettings.tsx"),
      source("app/api/admin/access-policies/[id]/route.ts"),
      source("app/api/admin/leave-balances/[id]/route.ts"),
      source("app/api/admin/users/[id]/route.ts"),
    ]);
  assert.match(schema, /accessPolicies/);
  assert.match(settings, /Access matrix/);
  assert.match(settings, /Employee balances/);
  assert.match(accessRoute, /settings\.access_policy_updated/);
  assert.match(balanceRoute, /settings\.leave_balance_updated/);
  assert.match(roleRoute, /settings\.user_role_updated/);
});

test("includes reimbursement policy, requests and scoped approvals", async () => {
  const [
    schema,
    workspace,
    createRoute,
    createCommand,
    contract,
    reviewRoute,
    policyRoute,
    domain,
  ] = await Promise.all([
    source("db/schema.ts"),
    source("components/ExpenseWorkspace.tsx"),
    source("app/api/reimbursements/route.ts"),
    source("modules/reimbursements/commands.ts"),
    source("modules/reimbursements/contracts.ts"),
    source("app/api/reimbursements/[id]/route.ts"),
    source("app/api/admin/reimbursement-policies/[id]/route.ts"),
    source("modules/reimbursements/domain.ts"),
  ]);
  assert.match(schema, /reimbursementPolicies/);
  assert.match(schema, /reimbursementRequests/);
  assert.match(workspace, /New expense/);
  assert.match(workspace, /Receipt file/);
  assert.match(workspace, /Stored privately/);
  assert.match(workspace, /<option value="Sport">/);
  assert.match(workspace, /<option value="Health">/);
  assert.doesNotMatch(workspace, /<option value="Software">/);
  assert.match(createRoute, /createReimbursementSchema/);
  assert.match(createCommand, /maxRequestsPerYear/);
  assert.match(contract, /reimbursementCategories/);
  assert.match(domain, /"Sport"/);
  assert.match(reviewRoute, /canReviewExpense/);
  assert.match(workspace, /Quarterly reimbursement overview/);
  assert.match(createRoute, /export async function GET/);
  assert.match(createRoute, /cache-control.*no-store/);
  assert.match(workspace, /fetch\("\/api\/reimbursements"/);
  assert.match(policyRoute, /reimbursement_policy_updated/);
});

test("stores employee documents and receipts in private R2 storage", async () => {
  const [
    schema,
    migration,
    hosting,
    storage,
    authorization,
    fileRoute,
    fileDownloadHandler,
    documentRoute,
    documentWorkspace,
    profile,
    reimbursementRoute,
    folderMigration,
  ] = await Promise.all([
    source("db/schema.ts"),
    source("migrations/0003_private_files.sql"),
    source(".openai/hosting.json"),
    source("modules/files/storage.ts"),
    source("modules/files/authorization.ts"),
    source("app/api/files/[id]/route.ts"),
    source("modules/files/download-handler.ts"),
    source("app/api/employees/[id]/documents/route.ts"),
    source("components/EmployeeDocuments.tsx"),
    source("app/employees/[id]/page.tsx"),
    source("app/api/reimbursements/route.ts"),
    source("migrations/0026_employee_document_folders.sql"),
  ]);

  assert.match(schema, /storedFiles/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS stored_files/);
  assert.match(hosting, /"r2": "FILES"/);
  assert.match(storage, /MAX_FILE_SIZE/);
  assert.match(
    storage,
    /openxmlformats-officedocument\.wordprocessingml\.document/,
  );
  assert.match(storage, /getFilesBucket/);
  assert.match(authorization, /getAuthorizedStoredFile/);
  assert.match(fileRoute, /createFileDownloadHandler/);
  assert.match(fileDownloadHandler, /content-disposition/);
  assert.match(fileDownloadHandler, /File access denied/);
  assert.match(documentRoute, /employee\.document_uploaded/);
  assert.match(documentRoute, /employee\.document_folder_created/);
  assert.match(documentRoute, /employee\.document_moved/);
  assert.match(documentWorkspace, /title=\{t\("Documents"\)\}/);
  assert.match(documentWorkspace, /Employee and HR/);
  assert.match(documentWorkspace, /HR only/);
  assert.match(authorization, /visibility === "hr_only"/);
  assert.match(folderMigration, /employee_document_folders/);
  assert.match(profile, /EmployeeDocuments/);
  assert.match(reimbursementRoute, /reimbursement_receipt/);
});

test("keeps R2 files quarantinable until an authenticated scanner decision", async () => {
  const [schema, migration, scanning, callback, authorization, worker] =
    await Promise.all([
      source("db/schema.ts"),
      source("migrations/0062_file_scan_status.sql"),
      source("modules/files/scanning.ts"),
      source("app/api/internal/file-scan/route.ts"),
      source("modules/files/authorization.ts"),
      source("worker/index.ts"),
    ]);
  assert.match(schema, /scanStatus: text\("scan_status"\)/);
  assert.match(migration, /scan_status.*unscanned/s);
  assert.match(scanning, /fileScanResultSchema/);
  assert.match(scanning, /timingSafeEqual/);
  assert.match(scanning, /recordFileScanResult/);
  assert.match(callback, /parseJsonRequest/);
  assert.match(callback, /File scanner callback is not configured/);
  assert.match(authorization, /isFileScanAvailable\(record\.scanStatus\)/);
  assert.match(worker, /api\/internal\/file-scan/);
});

test("supports announcement images, inline knowledge media and file previews", async () => {
  const schema = await source("db/schema.ts");
  const announcementImage = await source(
    "app/api/admin/home/announcements/[id]/image/route.ts",
  );
  const announcementCreate = await source(
    "app/api/admin/home/announcements/route.ts",
  );
  const fileRoute = await source("app/api/files/[id]/route.ts");
  const fileDownloadHandler = await source("modules/files/download-handler.ts");
  const richEditor = await source("components/admin/RichTextEditor.tsx");
  const homeSettings = await source("components/admin/HomeContentSettings.tsx");
  const knowledge = await source(
    "components/knowledge/KnowledgeArticleView.tsx",
  );
  const preview = await source("components/ui/FilePreviewDialog.tsx");
  const fileKindsMigration = await source(
    "migrations/0047_stored_file_kinds.sql",
  );
  assert.match(schema, /imageFileId: text\("image_file_id"\)/);
  assert.match(announcementImage, /validatePrivateImage/);
  assert.match(announcementImage, /announcement_image/);
  assert.match(announcementImage, /applicationErrorResponse/);
  assert.match(announcementCreate, /isMultipart/);
  assert.match(announcementCreate, /active: image \? false : true/);
  assert.match(announcementCreate, /attachStoredFile/);
  assert.match(announcementCreate, /ApplicationError/);
  assert.match(homeSettings, /Choose announcement image/);
  assert.match(homeSettings, /Selected announcement image/);
  assert.match(fileRoute, /createFileDownloadHandler/);
  assert.match(fileDownloadHandler, /preview.*=== "1"/s);
  assert.match(richEditor, /onUploadImage/);
  assert.match(knowledge, /uploadInlineImage/);
  assert.match(preview, /application\/pdf/);
  assert.match(preview, /Preview is unavailable for this file type/);
  assert.match(fileKindsMigration, /knowledge_attachment/);
  assert.match(
    fileKindsMigration,
    /ALTER TABLE stored_files_expanded RENAME TO stored_files/,
  );
});

test("ships a role-aware card-based knowledge guide with sections and article pages", async () => {
  const [
    directory,
    sectionView,
    sectionRoute,
    sectionPage,
    articlePage,
    articleView,
    queries,
    authorization,
    migration,
  ] = await Promise.all([
    source("components/knowledge/KnowledgeWorkspace.tsx"),
    source("components/knowledge/KnowledgeSectionView.tsx"),
    source("app/api/knowledge/sections/route.ts"),
    source("app/knowledge/sections/[id]/page.tsx"),
    source("app/knowledge/[id]/page.tsx"),
    source("components/knowledge/KnowledgeArticleView.tsx"),
    source("modules/knowledge/queries.ts"),
    source("modules/files/authorization.ts"),
    source("migrations/0027_knowledge_sections.sql"),
  ]);

  assert.match(directory, /knowledge-section-card/);
  assert.match(directory, /\/knowledge\/sections\/\${section\.id}/);
  assert.match(sectionView, /Articles and instructions/);
  assert.match(sectionRoute, /knowledge\.section_created/);
  assert.match(articlePage, /getKnowledgeArticle/);
  assert.match(articlePage, /key=\{`knowledge-article-\$\{article\.id\}`\}/);
  assert.match(sectionPage, /key=\{`knowledge-section-\$\{section\.id\}`\}/);
  assert.match(
    directory,
    /href=\{`\/knowledge\/sections\/\$\{section\.id\}`\}/,
  );
  assert.match(sectionView, /href=\{`\/knowledge\/\$\{article\.id\}`\}/);
  assert.match(articleView, /Back to section/);
  assert.match(articleView, /Screenshots and examples/);
  assert.match(queries, /getKnowledgeSections/);
  assert.match(queries, /canReadKnowledgeRole/);
  assert.match(authorization, /record\.kind === "knowledge_attachment"/);
  assert.match(authorization, /canReadKnowledgeArticle/);
  assert.match(migration, /knowledge_sections/);
});

test("supports person-level knowledge access and poll option image uploads", async () => {
  const [
    schema,
    access,
    queries,
    contracts,
    articleRoute,
    pollBuilder,
    pollImageRoute,
    pollRoute,
    authorization,
    backup,
    runtimeMigration,
    sitesMigration,
  ] = await Promise.all([
    source("db/schema.ts"),
    source("modules/knowledge/access.ts"),
    source("modules/knowledge/queries.ts"),
    source("modules/knowledge/contracts.ts"),
    source("app/api/knowledge/articles/route.ts"),
    source("components/admin/PollBuilder.tsx"),
    source("app/api/admin/home/announcements/[id]/poll-option-image/route.ts"),
    source("app/api/admin/home/announcements/[id]/poll/route.ts"),
    source("modules/files/authorization.ts"),
    source("app/api/admin/backup/route.ts"),
    source("migrations/0048_knowledge_article_access.sql"),
    source("drizzle/0051_knowledge_article_access.sql"),
  ]);
  assert.match(schema, /knowledgeArticleAccess/);
  assert.match(access, /replaceKnowledgeArticleAccess/);
  assert.match(queries, /canReadKnowledgeArticle/);
  assert.match(contracts, /sharedEmployeeIds/);
  assert.match(articleRoute, /validateKnowledgeRecipients/);
  assert.match(pollBuilder, /pollOptionImage:/);
  assert.match(pollImageRoute, /announcement_poll_option_image/);
  assert.match(pollRoute, /validatePollQuestions/);
  assert.match(authorization, /announcement_poll_option_image/);
  assert.match(backup, /knowledgeArticleAccess/);
  assert.match(runtimeMigration, /knowledge_article_access/);
  assert.match(sitesMigration, /knowledge_article_access/);
});

test("includes editable organization units and cycle-safe reporting lines", async () => {
  const [
    schema,
    settings,
    editors,
    unitRoute,
    reportingRoute,
    orgPage,
    orgChart,
    css,
  ] = await Promise.all([
    source("db/schema.ts"),
    source("components/AdminSettings.tsx"),
    source("components/admin/AdminSettingsEditors.tsx"),
    source("app/api/admin/org-units/[id]/route.ts"),
    source("app/api/admin/reporting/[id]/route.ts"),
    source("app/org/page.tsx"),
    source("components/OrgChart.tsx"),
    source("app/globals.css"),
  ]);
  assert.match(schema, /orgUnits/);
  assert.match(settings, /OrganizationSettings/);
  assert.match(editors, /Organization units/);
  assert.match(unitRoute, /organization cycle/);
  assert.match(reportingRoute, /reporting line would create a cycle/);
  assert.match(orgPage, /OrgChart/);
  assert.match(orgChart, /OrgBranch/);
  assert.match(orgChart, /photoFileId/);
  assert.match(css, /\.org-reports > \.org-branch::before/);
});

test("includes employee editing and manager hierarchy", async () => {
  const [editRoute, profileActions, orgPage, orgChart] = await Promise.all([
    source("app/api/employees/[id]/route.ts"),
    source("components/EmployeeProfileActions.tsx"),
    source("app/org/page.tsx"),
    source("components/OrgChart.tsx"),
  ]);

  assert.match(editRoute, /employee\.updated/);
  assert.match(editRoute, /managerId/);
  assert.match(profileActions, /Edit employee profile/);
  assert.match(orgPage, /Org chart/);
  assert.match(orgPage, /OrgChart/);
  assert.match(orgChart, /OrgBranch/);
});

test("includes durable extended employee profile records", async () => {
  const [
    schema,
    profile,
    records,
    route,
    compensation,
    compensationRoute,
    compensationQueries,
    compensationHandlers,
    compensationApiHandlers,
    employeeUpdate,
    relationships,
    privacy,
    fileAuthorization,
    fileStorage,
    compensationCommands,
    mutationHandlers,
    fileAudit,
    css,
    translations,
  ] = await Promise.all([
    source("db/schema.ts"),
    source("app/employees/[id]/page.tsx"),
    source("components/EmployeeProfileRecords.tsx"),
    source("app/api/employees/[id]/profile-records/route.ts"),
    source("components/EmployeeCompensation.tsx"),
    source("app/api/employees/[id]/compensations/route.ts"),
    source("modules/compensation/queries.ts"),
    source("modules/compensation/handlers.ts"),
    source("modules/compensation/api-handlers.ts"),
    source("app/api/employees/[id]/route.ts"),
    source("modules/people/queries.ts"),
    source("modules/people/privacy.ts"),
    source("modules/files/authorization.ts"),
    source("modules/files/storage.ts"),
    source("modules/compensation/commands.ts"),
    source("modules/compensation/management-handlers.ts"),
    source("modules/files/audit.ts"),
    source("app/globals.css"),
    source("lib/i18n.ts"),
  ]);
  assert.match(schema, /employeeProfileRecords/);
  assert.match(schema, /employeePrivateDetails/);
  assert.match(schema, /employeeCompensations/);
  assert.match(profile, /EmployeeProfileRecords/);
  assert.match(profile, /canReadEmployeeSensitiveData/);
  assert.match(profile, /EmployeeCompensation/);
  assert.match(profile, /Positions/);
  const positionsGrid = profile.match(
    /<dl className="detail-list profile-work-facts">([\s\S]*?)<\/dl>/,
  )?.[1];
  assert.ok(positionsGrid);
  const positionLabels = [
    ...positionsGrid.matchAll(/label=\{t\("([^"]+)"\)\}/g),
  ].map(([, label]) => label);
  assert.deepEqual(positionLabels, [
    "Position",
    "Level",
    "Manager",
    "Location",
    "Division",
    "Department",
  ]);
  assert.match(records, /Emergency contacts/);
  assert.doesNotMatch(records, /amountCents|Salary/);
  assert.match(route, /managePeople/);
  assert.match(route, /Legacy compensation records are read-only/);
  assert.match(route, /priorAttachments/);
  assert.match(route, /if \(replacement\)/);
  assert.match(route, /deleteStoredFile\(oldFile\.id, user\)/);
  assert.match(compensation, /Reveal amount/);
  assert.match(compensationRoute, /compensationSchema/);
  assert.match(compensationHandlers, /canReadSensitiveData/);
  assert.match(compensationApiHandlers, /employee\.compensation_revealed/);
  assert.match(compensationHandlers, /toCompensationListDto/);
  assert.doesNotMatch(compensationApiHandlers, /amountCents.*details/s);
  assert.match(compensation, /compensation-table/);
  assert.match(compensation, /item\.attachments\.map/);
  assert.match(compensationQueries, /Amounts are intentionally not selected/);
  assert.match(compensationQueries, /getCompensationForReveal/);
  assert.match(employeeUpdate, /d1\.batch\(statements\)/);
  assert.match(employeeUpdate, /employee\.private_details_updated/);
  assert.match(relationships, /getEmployeeProfileRelationships/);
  assert.match(
    privacy,
    /viewerEmployeeId === employeeId \|\| viewSensitiveData/,
  );
  assert.match(fileAuthorization, /employee_compensation/);
  assert.match(fileAuthorization, /canReadCompensationAttachment/);
  assert.match(fileAuthorization, /compensation_attachment/);
  assert.match(fileStorage, /"compensation_attachment"/);
  assert.match(compensationRoute, /kind: "compensation_attachment"/);
  assert.match(compensationRoute, /compensationMutationAccessResponse/);
  assert.match(mutationHandlers, /compensationMutationAccessResponse/);
  assert.match(compensationCommands, /deleteCoreBeforeAttachmentCleanup/);
  assert.match(compensationCommands, /relatedEntityId: String\(current\.id\)/);
  assert.match(
    compensationCommands,
    /employee\.compensation_attachment_cleanup_failed/,
  );
  assert.match(fileStorage, /storedFileDeletionAuditDetails/);
  assert.match(fileAudit, /Compensation attachment deleted/);
  assert.match(compensation, /opensUp/);
  assert.match(
    css,
    /\.compensation-table\.editable\s*\{[^}]*overflow:\s*visible/s,
  );
  assert.match(css, /\.compensation-row:has\(\.compensation-row-menu-list\)/);
  assert.match(css, /\.compensation-row-menu-list\.opens-up/);
  assert.match(route, /employee\.profile_record_created/);
  assert.match(route, /employee\.profile_record_updated/);
  assert.match(route, /employee\.profile_record_deleted/);
  assert.match(route, /changes\(\) > 0/);
  assert.match(
    css,
    /\.profile-personal-layout,\s*\.profile-work-layout\s*\{[\s\S]*?display:\s*grid/,
  );
  assert.match(css, /\.profile-personal-right[\s\S]*?\.profile-work-right/);
  assert.match(
    css,
    /@media\s*\(max-width:\s*1100px\)\s*\{\s*\.profile-personal-layout,\s*\.profile-work-layout\s*\{\s*grid-template-columns:/,
  );
  assert.match(translations, /"Personal information":\s*"Особиста інформація"/);
  assert.match(translations, /"No direct reports\.":\s*"Підлеглих немає\."/);
  const listQuery = compensationQueries.split(
    "export async function getCompensationForReveal",
  )[0];
  assert.doesNotMatch(listQuery, /amountCents/);
});

test("profile history renders only the normalized employment timeline", async () => {
  const page = await source("app/employees/[id]/page.tsx");
  const start = page.indexOf('<div className="history-timeline">');
  assert.notEqual(start, -1);
  const end = page.indexOf("</div>", start);
  assert.ok(end > start);
  const timelineMarkup = page.slice(start, end);
  assert.match(timelineMarkup, /employmentTimeline\.map\(/);
  assert.equal([...timelineMarkup.matchAll(/t\("Hired"\)/g)].length, 1);
  assert.doesNotMatch(
    timelineMarkup,
    /<TimelineItem\s+date=\{employee\.startDate\}/,
  );
  assert.doesNotMatch(timelineMarkup, /employee\.probationEnd/);
  assert.match(page, /probationEnd:\s*employee\.probationEnd/);
});

test("compensation form groups Amount, Currency and Period and cards before desktop narrows", async () => {
  const [component, css] = await Promise.all([
    source("components/EmployeeCompensation.tsx"),
    source("app/globals.css"),
  ]);
  assert.match(component, /compensation-amount-fields span-two/);
  assert.match(
    component,
    /<label className="span-two">[\s\S]*?\{t\("Payment schedule"\)\}/,
  );
  assert.match(
    css,
    /\.compensation-amount-fields\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s,
  );
  assert.match(
    css,
    /\.compensation-amount-fields\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
  );
  assert.match(
    css,
    /@media\s*\(max-width:\s*1100px\)\s*\{\s*\.compensation-table/s,
  );
});

test("uses configurable calendar-month probation defaults and accessible date fields", async () => {
  const [
    defaults,
    systemSettings,
    adminSettings,
    createEmployee,
    directory,
    editActions,
    compensation,
    dateField,
    dateDomain,
  ] = await Promise.all([
    source("modules/settings/contracts.ts"),
    source("app/api/admin/system-settings/route.ts"),
    source("components/AdminSettings.tsx"),
    source("modules/people/commands.ts"),
    source("components/EmployeeDirectory.tsx"),
    source("components/EmployeeProfileActions.tsx"),
    source("components/EmployeeCompensation.tsx"),
    source("components/ui/DateField.tsx"),
    source("modules/people/dates.ts"),
  ]);
  assert.match(
    defaults,
    /probationMonths: z\.number\(\)\.int\(\)\.min\(0\)\.max\(24\)\.default\(3\)/,
  );
  assert.match(systemSettings, /employeeDefaultsSchema/);
  assert.match(adminSettings, /Probation period \(months\)/);
  assert.match(createEmployee, /resolveProbationEnd/);
  assert.match(directory, /addCalendarMonths\(value, probationMonths\)/);
  assert.match(directory, /probationManuallySet/);
  assert.match(editActions, /DateField\s+name="birthDate"/);
  assert.match(editActions, /DateField\s+name="contractEndDate"/);
  assert.match(editActions, /DateField\s+name="passportDate"/);
  assert.match(directory, /DateField\s+name="startDate"/);
  assert.match(directory, /DateField\s+name="probationEnd"/);
  assert.match(compensation, /DateField\s+name="effectiveFrom"/);
  assert.match(dateField, /placeholder="ДД\.ММ\.РРРР"/);
  assert.match(dateField, /onFocus=\{\(\) => \{/);
  assert.match(dateField, /onClick=\{openCalendar\}/);
  assert.match(dateField, /role="grid"/);
  assert.match(dateField, /onCalendarDayKeyDown/);
  assert.doesNotMatch(dateField, /type="date"/);
  assert.match(
    dateDomain,
    /targetMonthStart\.setUTCDate\(Math\.min\(day, lastDay\)\)/,
  );
});

test("makes settings overview destinations keyboard-operable", async () => {
  const settings = await source("components/AdminSettings.tsx");
  assert.match(settings, /onClick=\{\(\) => openSection\("leave"\)\}/);
  assert.match(settings, /onClick=\{\(\) => openSection\("expenses"\)\}/);
  assert.match(settings, /onClick=\{\(\) => openSection\("organization"\)\}/);
  assert.match(
    settings,
    /onClick=\{isSuperAdmin \? \(\) => openSection\("access"\) : undefined\}/,
  );
  assert.match(settings, /href="\/api\/admin\/backup"/);
  assert.match(
    settings,
    /type="button"[\s\S]*aria-label=\{`\$\{label\}: \$\{value\}/,
  );
});

test("includes schedules, breaks, direct editing, team timesheets and period locking", async () => {
  const [
    scheduleRoute,
    breakRoute,
    requestRoute,
    reviewRoute,
    tracker,
    teamPage,
    teamWorkspace,
    periodRoute,
    periodRules,
    timeQueries,
    migration,
    atomicMigration,
    lockingStatusMigration,
    breakCommands,
    clientCommands,
    scheduleContract,
  ] = await Promise.all([
    source("app/api/schedules/me/route.ts"),
    source("app/api/time/break/toggle/route.ts"),
    source("app/api/time/corrections/route.ts"),
    source("app/api/time/corrections/[id]/route.ts"),
    source("components/TimeTracker.tsx"),
    source("app/time/team/page.tsx"),
    source("components/time/TeamTimesheets.tsx"),
    source("app/api/time/periods/[employeeId]/route.ts"),
    source("modules/time/periods.ts"),
    source("modules/time/queries.ts"),
    source("migrations/0002_timesheet_periods.sql"),
    source("migrations/0063_atomic_timesheet_lock_finalize.sql"),
    source("migrations/0064_timesheet_locking_status.sql"),
    source("modules/time/break-commands.ts"),
    source("modules/time/client-commands.ts"),
    source("modules/time/contracts.ts"),
  ]);

  assert.match(scheduleRoute, /schedule\.updated/);
  assert.match(scheduleContract, /isValidTimeZone/);
  assert.match(scheduleContract, /End time must be later than start time/);
  assert.match(breakRoute, /changeBreak/);
  assert.match(breakCommands, /time\.break_start/);
  assert.match(breakCommands, /time\.break_end/);
  assert.match(breakCommands, /openTime\.id,\s*now,\s*openTime\.id/);
  assert.ok(
    clientCommands.indexOf("UPDATE break_entries") <
      clientCommands.indexOf("UPDATE time_entries"),
  );
  assert.match(requestRoute, /time\.correction_requested/);
  assert.match(reviewRoute, /decision === "approved"/);
  assert.match(reviewRoute, /getD1\(\)\.batch/);
  assert.match(reviewRoute, /This correction would overlap another time entry/);
  assert.match(reviewRoute, /time_entry_break_outside_interval/);
  assert.match(reviewRoute, /exclude an existing break/);
  assert.match(reviewRoute, /Managers may review direct reports only/);
  assert.match(tracker, /DayEntriesDialog/);
  assert.doesNotMatch(tracker, /Pending approvals/);
  assert.match(tracker, /This month is locked/);
  assert.match(teamPage, /getTeamTimesheets/);
  assert.match(teamWorkspace, /Team timesheets/);
  assert.match(periodRoute, /Managers may close direct reports only/);
  assert.match(periodRoute, /getEmployeeMonthRange/);
  assert.match(periodRoute, /monthRange\.utcStart/);
  assert.match(periodRoute, /getTimePeriodSnapshot/);
  assert.match(periodRoute, /beginTimesheetPeriodLock/);
  assert.match(periodRoute, /finalizeTimesheetPeriodLock/);
  assert.match(periodRoute, /lockToken/);
  assert.match(periodRoute, /snapshotWorkedMinutes/);
  assert.doesNotMatch(periodRoute, /like\(timeEntries\.clockIn/);
  assert.match(timeQueries, /getTimePeriodSnapshot/);
  assert.match(timeQueries, /snapshotOvertimeMinutes/);
  assert.match(periodRules, /timesheet_period_locked/);
  assert.match(periodRules, /locking/);
  assert.match(periodRules, /TIMESHEET_LOCK_LEASE_MS/);
  assert.match(periodRules, /lockLeaseCutoff/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS timesheet_periods/);
  assert.match(atomicMigration, /lock_token/);
  assert.match(lockingStatusMigration, /locking/);
  assert.match(lockingStatusMigration, /timesheet_periods_rebuild/);
});

test("includes generated migrations and supplied logo", async () => {
  await Promise.all([
    access(new URL("migrations/0000_production_baseline.sql", root)),
    access(new URL("db/demo-seed.sql", root)),
    access(new URL("drizzle/0000_luxuriant_invaders.sql", root)),
    access(new URL("drizzle/0001_fearless_felicia_hardy.sql", root)),
    access(new URL("drizzle/0002_abnormal_nightmare.sql", root)),
    access(new URL("drizzle/0003_chemical_natasha_romanoff.sql", root)),
    access(new URL("drizzle/0004_ambiguous_maverick.sql", root)),
    access(new URL("drizzle/0005_tiny_darkstar.sql", root)),
    access(new URL("public/incora-logo.png", root)),
  ]);
});

test("keeps the desktop sidebar pinned while page content scrolls", async () => {
  const css = await source("app/globals.css");

  assert.match(css, /\.sidebar\s*\{[^}]*position:\s*sticky/s);
  assert.match(css, /\.sidebar\s*\{[^}]*height:\s*100dvh/s);
  assert.match(css, /\.sidebar\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /overflow-x:\s*clip/);
});

test("keeps the product roadmap out of the footer while retaining its super-admin page", async () => {
  const [shell, mobileMenu, roadmap] = await Promise.all([
    source("components/AppShell.tsx"),
    source("components/MobileAppMenu.tsx"),
    source("app/roadmap/page.tsx"),
  ]);

  assert.doesNotMatch(shell, /href="\/roadmap"/);
  assert.match(mobileMenu, /href="\/roadmap"/);
  assert.match(mobileMenu, /session\?\.user\.role === "super_admin"/);
  assert.match(roadmap, /MVP completion/);
  assert.match(roadmap, /Complete product scope/);
  assert.match(roadmap, /FULL_PRODUCT_PROGRESS/);
  assert.match(roadmap, /Completed, active and planned/);
  assert.match(roadmap, /Foundation completion/);
  assert.match(roadmap, /Operational Core HR/);
  assert.match(roadmap, /Hire, Grow, Voice and Help/);
  assert.match(roadmap, /Ukrainian HR records/);
});

test("keeps quarterly reimbursement statistics behind the management action", async () => {
  const [workspace, overview, access] = await Promise.all([
    source("components/ExpenseWorkspace.tsx"),
    source("modules/reimbursements/queries.ts"),
    source("modules/reimbursements/access.ts"),
  ]);

  assert.match(workspace, /Statistics/);
  assert.match(workspace, /quarterly-stats-dialog/);
  assert.match(workspace, /canViewQuarterly/);
  assert.doesNotMatch(workspace, /reimbursement-quarter-panel/);
  assert.match(overview, /canViewOrganization \|\| canViewDirectReports/);
  assert.match(access, /approveExpenses/);
});

test("includes a unified Leave workspace and the MVP completion workflows", async () => {
  const [
    leave,
    css,
    notificationRoute,
    importRoute,
    holidayRoute,
    taskPage,
    taskRoute,
    taskCommand,
    backupRoute,
    completionMigration,
    taskPriorityMigration,
    employeeSearch,
  ] = await Promise.all([
    source("components/LeaveWorkspace.tsx"),
    source("app/globals.css"),
    source("app/api/notifications/route.ts"),
    source("app/api/employees/import/route.ts"),
    source("app/api/admin/holidays/route.ts"),
    source("components/tasks/TaskWorkspace.tsx"),
    source("app/api/tasks/route.ts"),
    source("modules/tasks/commands.ts"),
    source("app/api/admin/backup/route.ts"),
    source("migrations/0001_mvp_completion.sql"),
    source("migrations/0045_task_priorities.sql"),
    source("components/ui/SearchableEmployeeSelect.tsx"),
  ]);

  assert.doesNotMatch(leave, /role="tablist"/);
  assert.match(leave, /id="balances"/);
  assert.match(leave, /id="requests"/);
  assert.match(leave, /dailyAllocations/);
  assert.match(leave, /value=\{0\.5\}/);
  assert.match(css, /\.leave-day-editor/);
  assert.match(css, /\.leave-balance-card > \.leave-type-icon/);
  assert.match(notificationRoute, /export async function PATCH/);
  assert.match(importRoute, /CSV must contain between 1 and 250/);
  assert.match(holidayRoute, /companyHolidays/);
  assert.match(taskPage, /onboarding and offboarding checklists/i);
  assert.match(taskPage, /task-mini-calendar/);
  assert.match(taskPage, /SearchableEmployeeSelect/);
  assert.match(taskRoute, /createTask/);
  assert.match(taskCommand, /task\.created/);
  assert.match(backupRoute, /incora-people-backup/);
  assert.match(completionMigration, /CREATE TABLE IF NOT EXISTS people_tasks/);
  assert.match(
    taskPriorityMigration,
    /priority TEXT NOT NULL DEFAULT 'medium'/,
  );
  assert.match(employeeSearch, /role="listbox"/);
});

test("is prepared for a Cloudflare Workers and D1 deployment", async () => {
  const [viteConfig, packageJson, envExample] = await Promise.all([
    source("vite.config.ts"),
    source("package.json"),
    source(".env.example"),
  ]);

  assert.match(viteConfig, /CLOUDFLARE_D1_DATABASE_ID/);
  assert.match(viteConfig, /database_name:\s*"incora-people"/);
  assert.match(packageJson, /deploy:cloudflare/);
  assert.match(envExample, /CLOUDFLARE_D1_DATABASE_ID=/);
  assert.match(viteConfig, /PUBLIC_APP_URL/);
});

test("keeps the CTO review package free of signing credentials", async () => {
  const packaging = await source("scripts/package-cto-review.sh");
  assert.match(packaging, /--exclude='\*\.keystore'/);
  assert.match(packaging, /--exclude='\*\.jks'/);
  assert.match(packaging, /\\\.\(keystore\|jks\)/);
});

test("publishes announcements immediately unless scheduling is selected", async () => {
  const [editor, createRoute, updateRoute, worker] = await Promise.all([
    source("components/admin/HomeContentSettings.tsx"),
    source("app/api/admin/home/announcements/route.ts"),
    source("app/api/admin/home/announcements/[id]/route.ts"),
    source("worker/index.ts"),
  ]);

  assert.match(editor, /announcementScheduleMode/);
  assert.match(editor, /Publish now/);
  assert.match(editor, /Scheduled publication/);
  assert.match(editor, /router\.refresh\(\)/);
  assert.match(createRoute, /normalizeDateTime/);
  assert.match(updateRoute, /publicationChanged/);
  assert.match(worker, /PUBLIC_APP_URL/);
  assert.doesNotMatch(
    worker,
    /https:\/\/incora-people\.internal\/api\/internal\/announcement-delivery/,
  );
});

test("uses explicit demo mode and fail-closed Cloudflare Access auth", async () => {
  const [auth, runtimeConfig, viteConfig] = await Promise.all([
    source("lib/auth.ts"),
    source("lib/runtime-config.ts"),
    source("vite.config.ts"),
  ]);

  assert.match(auth, /cf-access-jwt-assertion/);
  assert.match(auth, /jwtVerify/);
  assert.doesNotMatch(
    auth,
    /headers\(\)[\s\S]*\?\?\s*"admin@incora\.software"/,
  );
  assert.match(runtimeConfig, /"protected"/);
  assert.match(viteConfig, /APP_MODE/);
});

test("supports direct Google OAuth with PKCE and signed sessions", async () => {
  const [googleAuth, startRoute, callbackRoute, worker, login] =
    await Promise.all([
      source("lib/google-auth.ts"),
      source("app/api/auth/google/route.ts"),
      source("app/api/auth/callback/google/route.ts"),
      source("worker/index.ts"),
      source("app/login/page.tsx"),
    ]);

  assert.match(startRoute, /code_challenge_method:\s*"S256"/);
  assert.match(startRoute, /prompt:/);
  assert.match(startRoute, /select_account/);
  assert.match(startRoute, /reauth/);
  assert.match(callbackRoute, /oauth2\.googleapis\.com\/token/);
  assert.match(googleAuth, /email_verified/);
  assert.match(googleAuth, /HttpOnly/);
  assert.match(googleAuth, /SameSite=Lax/);
  assert.match(googleAuth, /8 \* 60 \* 60/);
  assert.match(worker, /incora_google_session/);
  assert.match(login, /Continue with Google/);
});

test("verifies Google session signatures before protected pages reach data queries", async () => {
  const [worker, viteConfig] = await Promise.all([
    source("worker/index.ts"),
    source("vite.config.ts"),
  ]);
  assert.match(worker, /getValidGoogleSession\(request, env\)/);
  assert.match(worker, /jwtVerify\(token, signingKey/);
  assert.match(worker, /audience: "incora-session"/);
  assert.match(worker, /payload\.iat \+ GOOGLE_SESSION_MAX_AGE_SECONDS/);
  assert.match(worker, /typeof payload\.email === "string"/);
  assert.doesNotMatch(viteConfig, /GOOGLE_CLIENT_SECRET:/);
  assert.doesNotMatch(viteConfig, /AUTH_SECRET:/);
});

test("does not serialize private employee fields into directory clients", async () => {
  const [data, types, directory, exportRoute] = await Promise.all([
    source("modules/people/queries.ts"),
    source("modules/people/types.ts"),
    source("components/EmployeeDirectory.tsx"),
    source("app/api/employees/export/route.ts"),
  ]);
  const publicQuery = data.slice(
    data.indexOf("export async function getEmployeeDirectory"),
    data.indexOf("export async function getEmployeeManagerOptions"),
  );

  assert.doesNotMatch(
    publicQuery,
    /personalEmail|phone|birthDate|gender|address/,
  );
  assert.match(types, /EmployeeDirectoryItem/);
  assert.doesNotMatch(directory, /EmployeeRecord/);
  assert.doesNotMatch(
    exportRoute,
    /taxCode|contractEndDate|passportNumber|passportDate|passportAuthority|legalEntityValueId/,
  );
});

test("ships migrations from the generated Wrangler config path", async () => {
  const viteConfig = await source("vite.config.ts");
  assert.match(viteConfig, /migrations_dir:\s*"\.\.\/\.\.\/migrations"/);
});

test("includes private bug reports, admin resolution and user locale preferences", async () => {
  const [
    schema,
    bugRoute,
    adminBugRoute,
    bugDialog,
    personalSettings,
    adminSettings,
    shell,
    locale,
    migration,
  ] = await Promise.all([
    source("db/schema.ts"),
    source("app/api/bug-reports/route.ts"),
    source("app/api/admin/bug-reports/route.ts"),
    source("components/BugReportDialog.tsx"),
    source("components/PersonalSettings.tsx"),
    source("components/AdminSettings.tsx"),
    source("components/AppShell.tsx"),
    source("lib/i18n.ts"),
    source("drizzle/0011_bug_reports_and_preferences.sql"),
  ]);

  assert.match(schema, /bugReports/);
  assert.match(schema, /locale: text\("locale"\)/);
  assert.match(bugRoute, /validatePrivateImage/);
  assert.match(bugRoute, /bug_report\.created/);
  assert.match(adminBugRoute, /bug_report\.resolved/);
  assert.match(adminBugRoute, /notifications/);
  assert.match(bugDialog, /name|screenshot/);
  assert.doesNotMatch(personalSettings, /href="\/expenses"/);
  assert.match(adminSettings, /BugTicketSettings/);
  assert.match(shell, /href: "\/expenses"/);
  assert.match(locale, /DEFAULT_LOCALE: Locale = "uk"/);
  assert.match(migration, /bug_screenshot/);
});

test("requires a work location for each timer session and hides audit inside superadmin settings", async () => {
  const [
    schema,
    shell,
    workModeRoute,
    workModeService,
    switcher,
    settings,
    auditPage,
  ] = await Promise.all([
    source("db/schema.ts"),
    source("components/AppShell.tsx"),
    source("app/api/work-mode/route.ts"),
    source("modules/work-mode/service.ts"),
    source("components/WorkModeSwitch.tsx"),
    source("components/AdminSettings.tsx"),
    source("app/audit/page.tsx"),
  ]);
  assert.match(schema, /workModeEntries/);
  assert.match(schema, /defaultWorkMode/);
  assert.doesNotMatch(shell, /WorkModeSwitch/);
  assert.match(shell, /GlobalTimeControl/);
  assert.doesNotMatch(shell, /href:\s*"\/audit"/);
  assert.match(workModeRoute, /updateEmployeeWorkMode/);
  assert.match(workModeService, /work_mode\.updated/);
  assert.match(switcher, /role="switch"/);
  assert.match(settings, /AuditSettings/);
  assert.match(auditPage, /settings\?tab=audit/);
});

test("includes the ten-click road game and persistent company leaderboard", async () => {
  const [schema, shell, game, scores] = await Promise.all([
    source("db/schema.ts"),
    source("components/AppShell.tsx"),
    source("components/IncoraRoadGame.tsx"),
    source("app/api/game-scores/route.ts"),
  ]);
  assert.match(schema, /gameScores/);
  assert.match(shell, /next >= 10/);
  assert.match(shell, /IncoraRoadGame/);
  assert.match(game, /Lanos is racing to the team sync/);
  assert.match(game, /unoptimized/);
  assert.match(game, /CAR_WIDTH = 104/);
  assert.match(game, /velocity = -14\.5/);
  assert.match(game, /Space/);
  assert.match(game, /drawCamera/);
  assert.match(scores, /onConflictDoUpdate/);
  assert.match(scores, /bestScore/);
});

test("stores authorized profile photos and covers in R2", async () => {
  const [
    storage,
    authorization,
    route,
    profile,
    editor,
    crop,
    directory,
    migration,
  ] = await Promise.all([
    source("modules/files/storage.ts"),
    source("modules/files/authorization.ts"),
    source("app/api/employees/[id]/media/route.ts"),
    source("components/EmployeeProfileMedia.tsx"),
    source("components/profile/ProfilePhotoEditor.tsx"),
    source("modules/files/image-crop.ts"),
    source("components/EmployeeDirectory.tsx"),
    source("migrations/0010_profile_media.sql"),
  ]);

  assert.match(storage, /profile_photo/);
  assert.match(storage, /profile_cover/);
  assert.match(storage, /getEmployeeProfileMedia/);
  assert.match(authorization, /record\.kind === "profile_photo"/);
  assert.match(route, /validatePrivateImage/);
  assert.match(route, /validateSquareProfileImage/);
  assert.match(route, /access\.managePeople \|\| user\.employeeId/);
  assert.match(profile, /api\/employees/);
  assert.match(profile, /employeeId.*media/s);
  assert.match(profile, /Open profile photo/);
  assert.match(profile, /ProfilePhotoEditor/);
  assert.match(editor, /canvas\.toBlob/);
  assert.match(editor, /image\/jpeg/);
  assert.match(crop, /calculateSquareCrop/);
  assert.match(storage, /readImageDimensions/);
  assert.match(directory, /photoFileId/);
  assert.match(migration, /'profile_photo'/);
  assert.match(migration, /'profile_cover'/);
});

test("ships admin-managed home communications for MVP 2", async () => {
  const [schema, dashboard, settings, contracts, migration] = await Promise.all(
    [
      source("db/schema.ts"),
      source("modules/dashboard/queries.ts"),
      source("components/admin/HomeContentSettings.tsx"),
      source("modules/admin/contracts.ts"),
      source("migrations/0011_home_communications.sql"),
    ],
  );
  for (const table of ["companyEvents", "announcements", "companyLinks"]) {
    assert.match(schema, new RegExp(table));
    assert.match(dashboard, new RegExp(table));
  }
  assert.match(settings, /api\/admin\/home\/\$\{kind\}/);
  assert.match(settings, /"events" \| "announcements" \| "links"/);
  assert.match(contracts, /companyEventSchema/);
  assert.match(contracts, /announcementSchema/);
  assert.match(contracts, /companyLinkSchema/);
  assert.match(migration, /CREATE TABLE `company_events`/);
});

test("adds weekly review and direct day-by-day time editing", async () => {
  const [tracker, dialogs, entriesRoute] = await Promise.all([
    source("components/TimeTracker.tsx"),
    source("components/time/TimeEntryDialogs.tsx"),
    source("app/api/time/entries/route.ts"),
  ]);
  assert.match(tracker, /WeekOverview/);
  assert.match(tracker, /setView\("week"\)/);
  assert.match(tracker, /This entry may be missing a clock-out/);
  assert.match(tracker, /DayEntriesDialog/);
  assert.match(tracker, /onSelectDate={setSelectedDate}/);
  assert.match(tracker, /entryOverlapsLocalDay/);
  assert.doesNotMatch(tracker, /CorrectionDialog/);
  assert.match(dialogs, /method: "PATCH"/);
  assert.match(dialogs, /clockInDate/);
  assert.match(dialogs, /clockOutDate/);
  assert.match(dialogs, /formatEntryRange/);
  assert.match(entriesRoute, /export async function PATCH/);
  assert.match(entriesRoute, /time\.entry_updated/);
});

test("adds advanced people filters, tenure and HR-only CSV export", async () => {
  const [directory, advancedFilters, queries, exportRoute, profile] =
    await Promise.all([
      source("components/EmployeeDirectory.tsx"),
      source("components/AdvancedEmployeeFilters.tsx"),
      source("modules/people/queries.ts"),
      source("app/api/employees/export/route.ts"),
      source("app/employees/[id]/page.tsx"),
    ]);
  assert.match(directory, /includeTechnologies/);
  assert.match(directory, /excludeTechnologies/);
  assert.match(directory, /technologyMode/);
  assert.match(directory, /tenureRanges/);
  assert.match(directory, /lifecycleStatus/);
  assert.match(directory, /probation/);
  assert.match(directory, /terminated/);
  assert.match(advancedFilters, /ALL conditions/);
  assert.match(advancedFilters, /exclude_any/);
  assert.match(advancedFilters, /DialogBackdrop/);
  assert.match(queries, /group_concat/);
  assert.match(queries, /lifecycle_status/);
  assert.match(exportRoute, /hasOrganizationScope/);
  assert.doesNotMatch(exportRoute, /personalEmail|birthDate|address/);
  assert.match(profile, /formatEmployeeTenure/);
  assert.doesNotMatch(profile, /Recent timesheet/);
});

test("supports projects in time tracking with admin management", async () => {
  const [schema, toggle, manual, settings, migration] = await Promise.all([
    source("db/schema.ts"),
    source("app/api/time/toggle/route.ts"),
    source("app/api/time/entries/route.ts"),
    source("components/admin/TimeProjectSettings.tsx"),
    source("migrations/0012_time_projects.sql"),
  ]);
  assert.match(schema, /timeProjects/);
  assert.match(schema, /projectId/);
  assert.match(toggle, /timeToggleSchema/);
  assert.match(manual, /projectId/);
  assert.match(settings, /api\/admin\/time-projects/);
  assert.match(migration, /time_projects/);
});

test("uses explicit idempotent web clock commands instead of toggle semantics", async () => {
  const [globalControl, tracker, clockIn, clockOut, commands] =
    await Promise.all([
      source("components/GlobalTimeControl.tsx"),
      source("components/TimeTracker.tsx"),
      source("app/api/time/clock-in/route.ts"),
      source("app/api/time/clock-out/route.ts"),
      source("modules/time/client-commands.ts"),
    ]);
  assert.match(globalControl, /\/api\/time\/clock-in/);
  assert.match(globalControl, /\/api\/time\/clock-out/);
  assert.doesNotMatch(globalControl, /\/api\/time\/toggle/);
  assert.match(tracker, /\/api\/time\/clock-in/);
  assert.match(tracker, /\/api\/time\/clock-out/);
  assert.doesNotMatch(tracker, /\/api\/time\/toggle/);
  assert.match(clockIn, /clientClockIn/);
  assert.match(clockOut, /clientClockOut/);
  assert.match(commands, /already_running/);
  assert.match(commands, /already_stopped/);
  assert.match(clockIn, /workMode/);
  assert.match(commands, /work_mode_entries/);
  assert.match(commands, /getEmployeeTimezone/);
  assert.match(commands, /getDayDateRange/);
  assert.doesNotMatch(commands, /localMidnightAsUtc/);
});

test("keeps assets scoped and state transitions internally consistent", async () => {
  const [assetPage, assetQuery, assetRoute] = await Promise.all([
    source("app/assets/page.tsx"),
    source("modules/assets/queries.ts"),
    source("app/api/assets/route.ts"),
  ]);
  assert.match(assetPage, /getAssetsWorkspaceData\(user, access\)/);
  assert.match(assetQuery, /assignedEmployeeId/);
  assert.match(assetQuery, /employees\.managerId/);
  assert.match(assetQuery, /serialNumber: canManage/);
  assert.match(assetRoute, /An assigned asset must have an assignee/);
  assert.match(assetRoute, /d1\.batch/);
});

test("shows assigned assets in employee profiles and tracks office inventory separately", async () => {
  const [
    profile,
    employeeAssets,
    assetQuery,
    inventoryUi,
    inventoryPage,
    inventoryRoute,
    schema,
    legacyMigration,
    inventoryMigration,
  ] = await Promise.all([
    source("app/employees/[id]/page.tsx"),
    source("components/assets/EmployeeAssets.tsx"),
    source("modules/assets/queries.ts"),
    source("components/inventory/InventoryWorkspace.tsx"),
    source("app/inventory/page.tsx"),
    source("app/api/inventory/route.ts"),
    source("db/schema.ts"),
    source("migrations/0028_office_inventory.sql"),
    source("migrations/0068_inventory_management.sql"),
  ]);
  assert.match(profile, /EmployeeAssets/);
  assert.match(employeeAssets, /Equipment assigned to this employee/);
  assert.match(assetQuery, /getEmployeeAssets/);
  assert.match(inventoryUi, /InventoryWorkspace/);
  assert.match(inventoryPage, /manageInventory/);
  assert.match(inventoryRoute, /canManageInventory/);
  assert.match(inventoryRoute, /inventory_operations/);
  assert.match(inventoryRoute, /history\.correct/);
  assert.match(inventoryUi, /Stock by location/);
  assert.match(inventoryUi, /Start inventory count/);
  assert.match(inventoryUi, /action: "count\.save-lines"/);
  const finalizeCountStart = inventoryUi.indexOf(
    "async function finalizeCount()",
  );
  const finalizeCountEnd = inventoryUi.indexOf(
    "const modalTitle",
    finalizeCountStart,
  );
  const finalizeCountHandler = inventoryUi.slice(
    finalizeCountStart,
    finalizeCountEnd,
  );
  assert.match(
    finalizeCountHandler,
    /lines\.some\(\(line\) => line\.countedQuantity === null\)/,
  );
  assert.match(finalizeCountHandler, /persistCountLines\(count, lines\)/);
  assert.match(finalizeCountHandler, /action: "count\.finalize"/);
  assert.match(schema, /inventoryItemStocks/);
  assert.match(schema, /officeInventoryMovements/);
  assert.match(legacyMigration, /office_inventory_items/);
  assert.match(inventoryMigration, /inventory_item_stocks/);
});

test("ships scoped HR and manager one-on-one planning with private notes", async () => {
  const [page, workspace, route, queries, migration] = await Promise.all([
    source("app/one-on-one/page.tsx"),
    source("components/one-on-one/OneOnOneWorkspace.tsx"),
    source("app/api/one-on-one/route.ts"),
    source("modules/one-on-one/queries.ts"),
    source("migrations/0029_one_on_ones.sql"),
  ]);
  assert.match(page, /getOneOnOneWorkspace/);
  assert.match(workspace, /HR cadence rules/);
  assert.match(route, /one_on_one\.recorded/);
  assert.match(queries, /canReadConversationNote/);
  assert.match(queries, /notes,/);
  assert.match(migration, /one_on_one_meetings/);
});

test("queues scheduled announcement delivery to Google Chat and email webhooks", async () => {
  const [delivery, cron, createRoute, runtime, worker, vite] =
    await Promise.all([
      source("modules/announcements/delivery.ts"),
      source("app/api/internal/announcement-delivery/route.ts"),
      source("app/api/admin/home/announcements/route.ts"),
      source("lib/runtime-config.ts"),
      source("worker/index.ts"),
      source("vite.config.ts"),
    ]);
  assert.match(delivery, /google_chat/);
  assert.match(delivery, /recipients/);
  assert.match(delivery, /secret: config\.webhookSecret/);
  assert.match(delivery, /assertEmailWebhookAccepted/);
  assert.match(delivery, /result\.ok !== true/);
  assert.match(cron, /ANNOUNCEMENT_CRON_SECRET|cronSecret/);
  assert.match(createRoute, /enqueueAnnouncementDelivery/);
  assert.match(runtime, /GOOGLE_CHAT_WEBHOOK_URL/);
  assert.match(runtime, /INCORA_WEBHOOK_SECRET/);
  assert.match(worker, /async scheduled/);
  assert.match(vite, /\*\/5 \* \* \* \*/);
});

test("backs up every current D1 module and records R2 recovery keys", async () => {
  const backup = await source("app/api/admin/backup/route.ts");
  for (const table of [
    "companyAssets",
    "assetEvents",
    "companyDocuments",
    "knowledgeArticles",
    "knowledgeSections",
    "officeInventoryItems",
    "officeInventoryMovements",
    "oneOnOneRules",
    "oneOnOnePlans",
    "oneOnOneMeetings",
    "announcementDeliveries",
    "companyEvents",
    "announcements",
    "announcementDismissals",
    "announcementComments",
    "announcementReactions",
    "companyLinks",
    "timeProjects",
    "employeeProfileRecords",
    "employeePrivateDetails",
    "employeeCompensations",
    "referenceValues",
    "employmentTypes",
    "systemSettings",
    "leaveLedger",
  ]) {
    assert.match(backup, new RegExp(table));
  }
  assert.match(backup, /r2Recovery/);
  assert.match(backup, /objectKeys/);
});

test("supports durable announcement discussions and catalog-backed employee technologies", async () => {
  const [
    schema,
    engagementRoute,
    engagementUi,
    profileRecords,
    profileRoute,
    dashboardQueries,
  ] = await Promise.all([
    source("db/schema.ts"),
    source("app/api/announcements/[id]/engagement/route.ts"),
    source("components/home/AnnouncementEngagement.tsx"),
    source("components/EmployeeProfileRecords.tsx"),
    source("app/api/employees/[id]/profile-records/route.ts"),
    source("modules/dashboard/queries.ts"),
  ]);

  assert.match(schema, /announcementComments/);
  assert.match(schema, /announcementReactions/);
  assert.match(engagementRoute, /action: z\.literal\("comment"\)/);
  assert.match(engagementRoute, /action: z\.literal\("reaction"\)/);
  assert.match(engagementUi, /engagement\.reactions\.map/);
  assert.match(profileRecords, /Select a technology/);
  assert.match(profileRecords, /Attachment \(optional\)/);
  assert.match(profileRecords, /Replace attachment \(optional\)/);
  assert.match(profileRecords, /method: record \? "PATCH" : "POST"/);
  assert.match(profileRoute, /attachmentFileId/);
  assert.match(profileRoute, /certificate_attachment/);
  assert.match(dashboardQueries, /comment_employee\.email/);
  assert.match(dashboardQueries, /announcement_comments\.user_email/);
});

test("centers announcements on the home page with durable dismissals and safely autofills time", async () => {
  const [shell, mobile, home, detail, dismiss, schema, autofill, timeQueries] =
    await Promise.all([
      source("components/AppShell.tsx"),
      source("components/MobileAppMenu.tsx"),
      source("app/page.tsx"),
      source("app/announcements/[id]/page.tsx"),
      source("app/api/announcements/[id]/dismiss/route.ts"),
      source("db/schema.ts"),
      source("app/api/time/autofill/route.ts"),
      source("modules/time/queries.ts"),
    ]);
  assert.doesNotMatch(shell, /href: "\/announcements"/);
  assert.doesNotMatch(mobile, /href: "\/announcements"/);
  assert.match(home, /home-announcement-feed/);
  assert.match(home, /AnnouncementPopup/);
  assert.match(detail, /getPublishedAnnouncement/);
  assert.match(dismiss, /onConflictDoUpdate/);
  assert.match(schema, /announcementDismissals/);
  assert.match(autofill, /workSchedules/);
  assert.match(autofill, /companyHolidays/);
  assert.match(autofill, /leaveRequests/);
  assert.match(autofill, /breakEntries/);
  assert.match(autofill, /breakMinutes/);
  assert.match(autofill, /Standard workday added with scheduled break/);
  assert.match(autofill, /time\.autofill/);
  assert.match(timeQueries, /isValidTimeZone/);
  assert.match(timeQueries, /const timeZone =/);
  assert.match(
    timeQueries,
    /schedule: schedule \? \{ \.\.\.schedule, timezone: timeZone \}/,
  );
});

test("hardens the stabilization sprint access and admin workflows", async () => {
  const [
    schema,
    projectPage,
    projectRoute,
    userRoute,
    reimbursementQueries,
    employeeExport,
    settings,
    deliveryRoute,
    oneOnOneContract,
  ] = await Promise.all([
    source("db/schema.ts"),
    source("app/projects/page.tsx"),
    source("app/api/admin/time-projects/route.ts"),
    source("app/api/admin/users/[id]/route.ts"),
    source("modules/reimbursements/queries.ts"),
    source("app/api/employees/export/route.ts"),
    source("components/AdminSettings.tsx"),
    source("app/api/admin/home/announcements/[id]/deliveries/route.ts"),
    source("modules/one-on-one/contracts.ts"),
  ]);
  assert.match(schema, /manageProjects/);
  assert.match(projectRoute, /canManageProjects/);
  assert.doesNotMatch(projectPage, /onMessage=\{\(\)/);
  assert.match(userRoute, /account\.manageProjects/);
  assert.match(reimbursementQueries, /user\.role === "manager"/);
  assert.match(employeeExport, /import \{ csvCell \} from "@\/lib\/csv"/);
  assert.match(settings, /settings-section-index/);
  assert.match(
    await source("app/globals.css"),
    /\.main-content\s*\{\s*overflow-x:\s*clip/s,
  );
  assert.match(deliveryRoute, /processAnnouncementDeliveries/);
  assert.match(oneOnOneContract, /meeting_access/);
});

test("dismisses every popup consistently without losing edited form data", async () => {
  const modalFiles = [
    "components/BugReportDialog.tsx",
    "components/EmployeeDirectory.tsx",
    "components/EmployeeProfileRecords.tsx",
    "components/ExpenseWorkspace.tsx",
    "components/admin/AdminSettingsEditors.tsx",
    "components/assets/AssetWorkspace.tsx",
    "components/documents/DocumentWorkspace.tsx",
    "components/inventory/InventoryWorkspace.tsx",
    "components/knowledge/KnowledgeArticleView.tsx",
    "components/knowledge/KnowledgeSectionView.tsx",
    "components/knowledge/KnowledgeWorkspace.tsx",
    "components/one-on-one/OneOnOneWorkspace.tsx",
    "components/tasks/TaskWorkspace.tsx",
    "components/time/ScheduleCard.tsx",
  ];
  const [backdrop, shell, timer, ...modals] = await Promise.all([
    source("components/ui/DialogBackdrop.tsx"),
    source("components/AppShell.tsx"),
    source("components/GlobalTimeControl.tsx"),
    ...modalFiles.map(source),
  ]);

  assert.match(backdrop, /Discard unsaved changes/);
  assert.match(backdrop, /event\.target === event\.currentTarget/);
  assert.match(backdrop, /closeOnEscape/);
  assert.match(shell, /useDismissibleLayer\(quickOpen/);
  assert.match(shell, /useDismissibleLayer\(notificationsOpen/);
  assert.match(timer, /useDismissibleLayer\(menuOpen/);
  for (const modal of modals) {
    assert.match(modal, /<DialogBackdrop/);
    assert.doesNotMatch(modal, /className="dialog-backdrop"/);
  }
});

test("keeps the reviewed UI surfaces keyboard-safe and responsive", async () => {
  const [backdrop, menu, settings, calendar, expenses, termination, styles] =
    await Promise.all([
      source("components/ui/DialogBackdrop.tsx"),
      source("components/MobileAppMenu.tsx"),
      source("components/AdminSettings.tsx"),
      source("components/CalendarWorkspace.tsx"),
      source("components/ExpenseWorkspace.tsx"),
      source("components/EmployeeProfileActions.tsx"),
      source("app/globals.css"),
    ]);
  assert.match(backdrop, /createPortal/);
  assert.match(backdrop, /aria-modal/);
  assert.match(backdrop, /focusableSelector/);
  assert.match(backdrop, /aria-hidden/);
  assert.match(menu, /aria-current/);
  assert.match(menu, /useSyncExternalStore/);
  assert.match(settings, /showSection\("overview"\)/);
  assert.match(settings, /isSuperAdmin/);
  assert.match(settings, /settings-toast-error/);
  assert.match(settings, /data-label=\{t\("Employee"\)\}/);
  assert.match(calendar, /calendar-agenda/);
  assert.match(calendar, /role="group"/);
  assert.match(expenses, /Reason for rejection/);
  assert.match(expenses, /aria-label=\{`\$\{t\("Approve reimbursement"\)/);
  assert.match(termination, /Confirm employment end/);
  assert.match(termination, /Choose a valid last working day/);
  assert.match(termination, /reviewHeadingRef/);
  assert.doesNotMatch(
    termination,
    /className="termination-review"\s+role="alertdialog"/,
  );
  assert.match(styles, /\.calendar-agenda/);
  assert.match(styles, /grid-template-areas:/);
  assert.match(styles, /\.profile-hero\.panel\s*\{\s*overflow: visible/s);
  assert.match(styles, /\.approval-actions button[\s\S]*min-height: 44px/);
  assert.match(styles, /@media \(max-width: 1100px\) and \(min-width: 761px\)/);
});

test("keeps one-on-one task categories compatible with the task contract", async () => {
  const [route, contract, workspace, styles] = await Promise.all([
    source("app/api/one-on-one/route.ts"),
    source("modules/tasks/contracts.ts"),
    source("components/one-on-one/OneOnOneWorkspace.tsx"),
    source("app/globals.css"),
  ]);
  assert.doesNotMatch(route, /category:\s*["']one_on_one["']/);
  assert.match(route, /category:\s*["']general["']/);
  assert.match(contract, /["']general["']/);
  assert.doesNotMatch(workspace, /checkbox-label/);
  assert.match(workspace, /role="alert"/);
  assert.match(styles, /\.form-grid input\[type="checkbox"\]/);
});

test("keeps the next UI iteration localized, touch-friendly and semantically selected", async () => {
  const [i18n, directory, filters, tasks, schedule, announcements, styles] =
    await Promise.all([
      source("lib/i18n.ts"),
      source("components/EmployeeDirectory.tsx"),
      source("components/AdvancedEmployeeFilters.tsx"),
      source("components/tasks/TaskWorkspace.tsx"),
      source("components/time/ScheduleCard.tsx"),
      source("modules/announcements/content.ts"),
      source("app/globals.css"),
    ]);
  assert.match(i18n, /export function formatCount/);
  assert.match(i18n, /new Intl\.PluralRules/);
  assert.match(
    i18n,
    /PDF, DOCX, JPEG, PNG or WebP · maximum 10 MB\. Stored privately\./,
  );
  assert.match(directory, /employee-mobile-context/);
  assert.match(styles, /@media \(max-width: 1500px\) and \(min-width: 761px\)/);
  assert.match(directory, /formatCount/);
  assert.match(filters, /aria-pressed=\{mode === "all"\}/);
  assert.match(tasks, /aria-pressed=\{filter === value\}/);
  assert.match(schedule, /formatCount/);
  assert.match(announcements, /withBlockSpacing/);
  assert.match(styles, /\.employee-mobile-context/);
  assert.match(
    styles,
    /\.employee-person-cell \.employee-mobile-context\s*\{\s*display: none/s,
  );
  assert.match(
    styles,
    /@media \(max-width: 1100px\)[\s\S]*\.calendar-agenda\s*\{\s*display: block/s,
  );
  assert.match(styles, /min-height: 44px/);
});

test("keeps employee profile surfaces on a shared localized UI scale", async () => {
  const [i18n, profile, documents, assets, compensation, expenses, styles] =
    await Promise.all([
      source("lib/i18n.ts"),
      source("app/employees/[id]/page.tsx"),
      source("components/EmployeeDocuments.tsx"),
      source("components/assets/EmployeeAssets.tsx"),
      source("components/EmployeeCompensation.tsx"),
      source("components/ExpenseWorkspace.tsx"),
      source("app/globals.css"),
    ]);

  assert.match(i18n, /More: "Ще"/);
  assert.match(i18n, /"Employee documents": "Документи працівника"/);
  assert.match(i18n, /"HR private": "Приватні HR-документи"/);
  assert.match(documents, /folder\.createdByEmail !== "system@incora\.local"/);
  assert.match(documents, /className="document-row-actions"/);
  assert.match(documents, /<ProfileCardHeading/);
  assert.match(assets, /<ProfileCardHeading/);
  assert.match(profile, /ProfileCardHeading title=\{t\("Timeline"\)\}/);
  assert.match(compensation, /profile-empty-state/);
  assert.match(expenses, /className="expense-workspace"/);
  assert.match(styles, /--profile-card-title-size:\s*18px/);
  assert.match(styles, /\.employee-profile-workspace \.profile-work-facts/);
  assert.match(styles, /\.employee-profile-workspace \.document-row-actions/);
  assert.match(styles, /\.expense-workspace \.expense-section/);
});

test("People directory provides lifecycle and sorting controls without exposing unrelated HR fields", async () => {
  const [
    page,
    queries,
    types,
    directory,
    directoryLogic,
    advancedFilters,
    actions,
    profile,
    styles,
    i18n,
  ] = await Promise.all([
    source("app/employees/page.tsx"),
    source("modules/people/queries.ts"),
    source("modules/people/types.ts"),
    source("components/EmployeeDirectory.tsx"),
    source("modules/people/directory.ts"),
    source("components/AdvancedEmployeeFilters.tsx"),
    source("components/EmployeeProfileActions.tsx"),
    source("app/employees/[id]/page.tsx"),
    source("app/globals.css"),
    source("lib/i18n.ts"),
  ]);

  assert.match(page, /canViewInactiveEmployees\(user\.role\)/);
  assert.doesNotMatch(page, /rehireEligible:/);
  assert.doesNotMatch(
    page,
    /terminationReasons:\s*employee\.terminationReasons/,
  );
  assert.match(queries, /terminationReasons:\s*sql/);
  assert.match(queries, /terminationType:\s*sql/);
  assert.match(queries, /lifecycleStatus:\s*sql/);
  assert.doesNotMatch(queries, /employmentCycleCount|employment_periods/);
  assert.doesNotMatch(types, /rehireEligible/);
  assert.doesNotMatch(types, /employmentCycleCount|employmentTenureDays/);

  assert.match(directory, /name-asc/);
  assert.match(directory, /name-desc/);
  assert.match(directory, /tenure-desc/);
  assert.match(directory, /tenure-asc/);
  assert.match(directory, /lifecycleStatus !== "terminated"/);
  assert.match(directory, /aria-pressed=\{lifecycleFilter === value\}/);
  assert.match(directory, /setAdvancedIds\(null\)/);
  assert.match(directory, /employmentCycleFilter/);
  assert.match(directory, /employmentCycle:\s*employmentCycleFilter/);
  assert.match(
    directoryLogic,
    /employee\.lifecycleStatus !== options\.employmentCycle/,
  );
  assert.match(directory, /value="working"/);
  assert.match(directory, /value="probation"/);
  assert.match(directory, /value="terminated"/);
  assert.match(directory, /"All stages"/);
  assert.doesNotMatch(directory, /rehireEligible/);
  assert.match(
    profile,
    /ProfileCardHeading\s+title=\{t\("Employment cycle"\)\}/,
  );
  assert.match(profile, /getEmployeeLifecycleStage/);
  assert.match(profile, /label=\{t\("Lifecycle stage"\)\}/);
  assert.doesNotMatch(profile, /Employment periods|employment-period-list/);
  assert.match(profile, /label=\{t\("Eligible for rehire"\)\}/);
  assert.match(advancedFilters, /Search filter types/);
  for (const field of ["location", "employmentType", "email", "manager"]) {
    assert.match(advancedFilters, new RegExp(`${field}:`));
  }

  assert.match(styles, /.directory-discovery-controls/);
  assert.match(styles, /.directory-toolbar-actions/);
  assert.match(styles, /.directory-filter-type-search input/);
  assert.match(
    styles,
    /.filter-dropdown[\s\S]*max-height:[^;]+;[\s\S]*overflow-y:\s*auto/,
  );
  assert.match(styles, /\.status-badge\.probation/);
  assert.match(i18n, /"Name: A–Z": "Ім’я: А–Я"/);
  assert.match(i18n, /"Terminated employees": "Звільнені"/);

  assert.match(actions, /No invitation delivery is configured\./);
  assert.match(actions, /canManageInvitations/);
  assert.match(actions, /Resend invitation/);
  assert.match(actions, /invitationSummaryState\.eligible/);
  assert.doesNotMatch(
    actions,
    /aria-describedby="invitation-unavailable-explanation"/,
  );
  assert.match(actions, /Disable system access/);
  assert.match(actions, /Enable system access/);
  assert.doesNotMatch(actions, /Reset password|Log in as employee|Impersonate/);
  assert.match(actions, /canDeleteEmployee = false/);
  assert.match(actions, /t\("Delete employee"\)/);
  assert.doesNotMatch(actions, /Archive employee/);
  assert.match(actions, /name="lastWorkingDay"/);
  assert.doesNotMatch(actions, /lastOfficeDay|Last office day/i);
  assert.match(
    profile,
    /schedule\.source === "default"[\s\S]*t\("By default"\)/,
  );
  assert.match(i18n, /"By default": "За замовчуванням"/);
});

test("employment cycle is a canonical lifecycle stage, not numbered periods", async () => {
  const [migration, schema, create, lifecycle, profile, actions, directory] =
    await Promise.all([
      source("migrations/0068_inventory_management.sql"),
      source("db/schema.ts"),
      source("modules/people/commands.ts"),
      source("modules/people/lifecycle.ts"),
      source("app/employees/[id]/page.tsx"),
      source("components/EmployeeProfileActions.tsx"),
      source("modules/people/directory.ts"),
    ]);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS inventory_categories/);
  assert.doesNotMatch(
    migration,
    /employment_periods|employee_termination_events/,
  );
  assert.doesNotMatch(schema, /employmentPeriods|employeeTerminationEvents/);
  assert.doesNotMatch(create, /employment_periods/);
  assert.doesNotMatch(
    lifecycle,
    /employment_periods|employee_termination_events/,
  );
  assert.match(schema, /export const employmentHistory = sqliteTable/);
  assert.match(schema, /export const employeeTerminations = sqliteTable/);
  assert.match(directory, /getEmployeeLifecycleStage/);
  assert.match(
    directory,
    /employee\.lifecycleStatus !== options\.employmentCycle/,
  );
  assert.match(profile, /label=\{t\("Lifecycle stage"\)\}/);
  assert.doesNotMatch(
    profile,
    /employmentPeriods|Employment periods|employment-period-list/,
  );
  assert.doesNotMatch(
    actions,
    /canRehire|\/api\/employees\/\$\{employee\.id\}\/rehire/,
  );
});
