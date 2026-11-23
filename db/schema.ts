import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const employees = sqliteTable(
  "employees",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeCode: text("employee_code"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    ukrainianName: text("ukrainian_name"),
    email: text("email").notNull().unique(),
    personalEmail: text("personal_email"),
    phone: text("phone"),
    birthDate: text("birth_date"),
    gender: text("gender"),
    address: text("address"),
    jobTitle: text("job_title").notNull(),
    department: text("department").notNull(),
    division: text("division").notNull().default("Ukraine"),
    team: text("team"),
    level: text("level"),
    location: text("location").notNull().default("Lviv"),
    defaultWorkMode: text("default_work_mode").notNull().default("office"),
    managerName: text("manager_name"),
    managerId: integer("manager_id").references(
      (): AnySQLiteColumn => employees.id,
    ),
    employmentType: text("employment_type").notNull().default("Full-time"),
    status: text("status").notNull().default("active"),
    startDate: text("start_date").notNull(),
    probationEnd: text("probation_end"),
    divisionUnitId: integer("division_unit_id").references(
      (): AnySQLiteColumn => orgUnits.id,
    ),
    departmentUnitId: integer("department_unit_id").references(
      (): AnySQLiteColumn => orgUnits.id,
    ),
    teamUnitId: integer("team_unit_id").references(
      (): AnySQLiteColumn => orgUnits.id,
    ),
    positionValueId: integer("position_value_id").references(
      (): AnySQLiteColumn => referenceValues.id,
    ),
    levelValueId: integer("level_value_id").references(
      (): AnySQLiteColumn => referenceValues.id,
    ),
    employmentTypeId: integer("employment_type_id").references(
      (): AnySQLiteColumn => employmentTypes.id,
    ),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("employees_normalized_email_uq").on(
      sql`lower(trim(${table.email}))`,
    ),
  ],
);

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull().unique(),
    providerSubject: text("provider_subject"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    disabledAt: text("disabled_at"),
    disabledByEmail: text("disabled_by_email"),
    role: text("role").notNull().default("employee"),
    employeeId: integer("employee_id")
      .unique()
      .references(() => employees.id),
    createdAt: text("created_at"),
    lastLoginAt: text("last_login_at"),
    locale: text("locale").notNull().default("uk"),
    manageProjects: integer("manage_projects", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (table) => [
    uniqueIndex("users_normalized_email_uq").on(
      sql`lower(trim(${table.email}))`,
    ),
  ],
);

/** Append-only invitation attempts; provider state is updated in-place per attempt. */
export const employeeInvitationAttempts = sqliteTable(
  "employee_invitation_attempts",
  {
    id: text("id").primaryKey(),
    employeeId: integer("employee_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    accountUserId: integer("account_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    targetEmail: text("target_email").notNull(),
    provider: text("provider").notNull().default("resend"),
    status: text("status").notNull(),
    providerMessageId: text("provider_message_id"),
    payloadJson: text("payload_json").notNull(),
    requestedAt: text("requested_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    acceptedAt: text("accepted_at"),
    failedAt: text("failed_at"),
    uncertainAt: text("uncertain_at"),
    failureCode: text("failure_code"),
    actorUserId: integer("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorEmail: text("actor_email").notNull(),
  },
  (table) => [
    check(
      "employee_invitation_attempts_status_check",
      sql`${table.status} IN ('sending', 'sent', 'failed', 'uncertain')`,
    ),
    check(
      "employee_invitation_attempts_provider_check",
      sql`${table.provider} = 'resend'`,
    ),
    index("employee_invitation_attempts_employee_requested_idx").on(
      table.employeeId,
      table.requestedAt,
    ),
    index("employee_invitation_attempts_actor_requested_idx").on(
      table.actorUserId,
      table.requestedAt,
    ),
    uniqueIndex("employee_invitation_attempts_open_employee_uq")
      .on(table.employeeId)
      .where(
        sql`${table.employeeId} IS NOT NULL AND ${table.status} IN ('sending', 'uncertain')`,
      ),
  ],
);

/** Sensitive profile data is kept out of the general employee DTO. */
export const employeePrivateDetails = sqliteTable("employee_private_details", {
  employeeId: integer("employee_id")
    .primaryKey()
    .references(() => employees.id),
  taxCode: text("tax_code"),
  contractEndDate: text("contract_end_date"),
  passportNumber: text("passport_number"),
  passportDate: text("passport_date"),
  passportAuthority: text("passport_authority"),
  legalEntityValueId: integer("legal_entity_value_id").references(
    () => referenceValues.id,
  ),
  updatedByEmail: text("updated_by_email").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/** Append-only employment compensation history; amounts are revealed separately. */
export const employeeCompensations = sqliteTable(
  "employee_compensations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id),
    kind: text("kind").notNull(),
    label: text("label"),
    effectiveFrom: text("effective_from").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    period: text("period").notNull(),
    paymentSchedule: text("payment_schedule").notNull(),
    comment: text("comment").notNull().default(""),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check(
      "employee_compensations_kind_check",
      sql`${table.kind} IN ('base', 'additional')`,
    ),
    check(
      "employee_compensations_amount_check",
      sql`${table.amountCents} >= 0`,
    ),
    check(
      "employee_compensations_currency_check",
      sql`${table.currency} IN ('USD', 'EUR', 'UAH')`,
    ),
    check(
      "employee_compensations_period_check",
      sql`${table.period} IN ('year', 'month', 'week', 'day', 'hour')`,
    ),
    check(
      "employee_compensations_payment_schedule_check",
      sql`${table.paymentSchedule} IN ('weekly', 'monthly', 'quarterly')`,
    ),
    index("employee_compensations_employee_kind_date_idx").on(
      table.employeeId,
      table.kind,
      table.effectiveFrom,
    ),
    uniqueIndex("employee_compensations_base_effective_unique")
      .on(table.employeeId, table.effectiveFrom)
      .where(sql`${table.kind} = 'base'`),
  ],
);

/** Protected administrator grants are owned by immutable users.id. */
export const protectedAdminAccounts = sqliteTable("protected_admin_accounts", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  grantedByUserId: integer("granted_by_user_id").references(() => users.id),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/** Revocable browser sessions backed by the admitted user account. */
export const webSessions = sqliteTable(
  "web_sessions",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    providerSubject: text("provider_subject").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    lastUsedAt: text("last_used_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("web_sessions_user_active_idx").on(table.userId, table.expiresAt),
  ],
);

/** A short-lived, read-only employee perspective bound to one admin web session. */
export const employeeViewPreviews = sqliteTable(
  "employee_view_previews",
  {
    id: text("id").primaryKey(),
    actorUserId: integer("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    actorWebSessionId: text("actor_web_session_id")
      .notNull()
      .references(() => webSessions.id, { onDelete: "cascade" }),
    targetUserId: integer("target_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    targetEmployeeId: integer("target_employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("active"),
    startedAt: text("started_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    endedAt: text("ended_at"),
    returnPath: text("return_path").notNull(),
  },
  (table) => [
    check(
      "employee_view_previews_status_check",
      sql`${table.status} IN ('active', 'ended', 'expired')`,
    ),
    check(
      "employee_view_previews_lifecycle_check",
      sql`(${table.status} = 'active' AND ${table.endedAt} IS NULL) OR (${table.status} <> 'active' AND ${table.endedAt} IS NOT NULL)`,
    ),
    check(
      "employee_view_previews_expiry_check",
      sql`${table.expiresAt} > ${table.startedAt}`,
    ),
    uniqueIndex("employee_view_previews_session_active_uq")
      .on(table.actorWebSessionId)
      .where(sql`${table.status} = 'active'`),
    index("employee_view_previews_actor_idx").on(
      table.actorUserId,
      table.status,
      table.expiresAt,
    ),
  ],
);

/** Preview audits are append-only and contain no credentials or viewed content. */
export const employeeViewPreviewAudit = sqliteTable(
  "employee_view_preview_audit",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventKey: text("event_key").notNull().unique(),
    eventType: text("event_type").notNull(),
    previewId: text("preview_id"),
    actorUserId: integer("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    targetUserId: integer("target_user_id"),
    targetEmployeeId: integer("target_employee_id"),
    sessionReferenceHash: text("session_reference_hash").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    check(
      "employee_view_preview_audit_event_check",
      sql`${table.eventType} IN ('preview_started', 'preview_ended', 'preview_expired', 'unauthorized_preview_attempt')`,
    ),
    index("employee_view_preview_audit_actor_idx").on(
      table.actorUserId,
      table.createdAt,
    ),
    index("employee_view_preview_audit_target_idx").on(
      table.targetEmployeeId,
      table.createdAt,
    ),
  ],
);

export const clientSessions = sqliteTable(
  "client_sessions",
  {
    id: text("id").primaryKey(),
    userEmail: text("user_email").notNull(),
    userId: integer("user_id").references(() => users.id),
    clientType: text("client_type").notNull(),
    deviceId: text("device_id").notNull(),
    tokenFamilyId: text("token_family_id").notNull().default(""),
    refreshTokenHash: text("refresh_token_hash").notNull().unique(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    lastUsedAt: text("last_used_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check(
      "client_sessions_client_type_check",
      sql`${table.clientType} IN ('chrome_extension', 'mobile')`,
    ),
    index("client_sessions_user_active_idx").on(
      table.userEmail,
      table.expiresAt,
    ),
  ],
);

/**
 * Refresh-token ledger used to detect replay.  A token is single-use: once
 * marked as used, seeing it again revokes the whole token family/session.
 */
export const clientSessionRefreshTokens = sqliteTable(
  "client_session_refresh_tokens",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => clientSessions.id, { onDelete: "cascade" }),
    tokenFamilyId: text("token_family_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    issuedAt: text("issued_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    usedAt: text("used_at"),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    index("client_session_refresh_tokens_session_idx").on(table.sessionId),
    index("client_session_refresh_tokens_family_idx").on(table.tokenFamilyId),
  ],
);

/** D1-backed fixed-window limiter state; avoids per-isolate memory limits. */
export const authRateLimits = sqliteTable("auth_rate_limits", {
  bucketKey: text("bucket_key").primaryKey(),
  count: integer("count").notNull().default(0),
  resetAt: text("reset_at").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const oauthAuthorizationCodes = sqliteTable(
  "oauth_authorization_codes",
  {
    codeHash: text("code_hash").primaryKey(),
    userEmail: text("user_email").notNull(),
    userId: integer("user_id").references(() => users.id),
    clientType: text("client_type").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    codeChallenge: text("code_challenge").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check(
      "oauth_authorization_codes_client_type_check",
      sql`${table.clientType} IN ('chrome_extension', 'mobile')`,
    ),
    index("oauth_authorization_codes_expiry_idx").on(table.expiresAt),
  ],
);

export const workModeEntries = sqliteTable(
  "work_mode_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id),
    workDate: text("work_date").notNull(),
    mode: text("mode").notNull().default("office"),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("work_mode_entries_employee_date_unique").on(
      table.employeeId,
      table.workDate,
    ),
    index("work_mode_entries_date_mode_idx").on(table.workDate, table.mode),
  ],
);

export const gameScores = sqliteTable(
  "game_scores",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: integer("employee_id")
      .notNull()
      .unique()
      .references(() => employees.id),
    userEmail: text("user_email").notNull(),
    bestScore: integer("best_score").notNull().default(0),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("game_scores_best_idx").on(table.bestScore)],
);

export const accessPolicies = sqliteTable("access_policies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  role: text("role").notNull().unique(),
  label: text("label").notNull(),
  managePeople: integer("manage_people", { mode: "boolean" })
    .notNull()
    .default(false),
  viewSensitiveData: integer("view_sensitive_data", { mode: "boolean" })
    .notNull()
    .default(false),
  approveLeave: integer("approve_leave", { mode: "boolean" })
    .notNull()
    .default(false),
  approveTime: integer("approve_time", { mode: "boolean" })
    .notNull()
    .default(false),
  approveExpenses: integer("approve_expenses", { mode: "boolean" })
    .notNull()
    .default(false),
  viewAudit: integer("view_audit", { mode: "boolean" })
    .notNull()
    .default(false),
  manageSettings: integer("manage_settings", { mode: "boolean" })
    .notNull()
    .default(false),
  manageInventory: integer("manage_inventory", { mode: "boolean" })
    .notNull()
    .default(false),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const reimbursementPolicies = sqliteTable("reimbursement_policies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("UAH"),
  perRequestLimit: integer("per_request_limit").notNull().default(100000),
  annualLimit: integer("annual_limit").notNull().default(300000),
  maxRequestsPerYear: integer("max_requests_per_year").notNull().default(12),
  requiresReceipt: integer("requires_receipt", { mode: "boolean" })
    .notNull()
    .default(true),
  requiresApproval: integer("requires_approval", { mode: "boolean" })
    .notNull()
    .default(true),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const reimbursementRequests = sqliteTable("reimbursement_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employees.id),
  category: text("category").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("UAH"),
  expenseDate: text("expense_date").notNull(),
  description: text("description").notNull(),
  idempotencyKey: text("idempotency_key"),
  receiptUrl: text("receipt_url"),
  status: text("status").notNull().default("pending"),
  reviewerEmail: text("reviewer_email"),
  reviewerNote: text("reviewer_note").notNull().default(""),
  reviewedAt: text("reviewed_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const employeeDocumentFolders = sqliteTable(
  "employee_document_folders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id),
    name: text("name").notNull(),
    visibility: text("visibility").notNull().default("employee_hr"),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("employee_document_folders_employee_name_unique").on(
      table.employeeId,
      table.name,
    ),
  ],
);

export const storedFiles = sqliteTable(
  "stored_files",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    category: text("category").notNull().default("other"),
    ownerEmployeeId: integer("owner_employee_id")
      .notNull()
      .references(() => employees.id),
    objectKey: text("object_key").notNull().unique(),
    originalName: text("original_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    uploadedByEmail: text("uploaded_by_email").notNull(),
    folderId: integer("folder_id").references(() => employeeDocumentFolders.id),
    visibility: text("visibility").notNull().default("employee_hr"),
    relatedEntityType: text("related_entity_type"),
    relatedEntityId: text("related_entity_id"),
    /** Files remain unavailable until an optional production scanner marks them clean. */
    scanStatus: text("scan_status").notNull().default("unscanned"),
    scannedAt: text("scanned_at"),
    scanProvider: text("scan_provider"),
    scanError: text("scan_error").notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check(
      "stored_files_scan_status_check",
      sql`${table.scanStatus} IN ('unscanned', 'clean', 'quarantined', 'failed')`,
    ),
    index("stored_files_scan_status_idx").on(table.scanStatus, table.createdAt),
  ],
);

export const companyAssets = sqliteTable(
  "company_assets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    assetTag: text("asset_tag").notNull().unique(),
    category: text("category").notNull().default("equipment"),
    status: text("status").notNull().default("available"),
    assignedEmployeeId: integer("assigned_employee_id").references(
      () => employees.id,
    ),
    serialNumber: text("serial_number").notNull().default(""),
    note: text("note").notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("company_assets_status_idx").on(table.status, table.category),
    index("company_assets_assignee_idx").on(table.assignedEmployeeId),
  ],
);

export const assetEvents = sqliteTable(
  "asset_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    assetId: integer("asset_id")
      .notNull()
      .references(() => companyAssets.id),
    eventType: text("event_type").notNull(),
    previousEmployeeId: integer("previous_employee_id").references(
      () => employees.id,
    ),
    nextEmployeeId: integer("next_employee_id").references(() => employees.id),
    previousStatus: text("previous_status"),
    nextStatus: text("next_status").notNull(),
    note: text("note").notNull().default(""),
    actorEmail: text("actor_email").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("asset_events_asset_created_idx").on(table.assetId, table.createdAt),
  ],
);

export const officeInventoryItems = sqliteTable(
  "office_inventory_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    sku: text("sku").notNull().unique(),
    category: text("category").notNull().default("other"),
    quantity: integer("quantity").notNull().default(0),
    minimumQuantity: integer("minimum_quantity").notNull().default(0),
    serialNumber: text("serial_number").notNull().default(""),
    storageLocation: text("storage_location").notNull().default(""),
    note: text("note").notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check(
      "office_inventory_items_kind_check",
      sql`${table.kind} IN ('office_equipment', 'merchandise')`,
    ),
    check("office_inventory_items_quantity_check", sql`${table.quantity} >= 0`),
    check(
      "office_inventory_items_minimum_quantity_check",
      sql`${table.minimumQuantity} >= 0`,
    ),
    index("office_inventory_items_kind_name_idx").on(table.kind, table.name),
  ],
);

export const officeInventoryMovements = sqliteTable(
  "office_inventory_movements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => officeInventoryItems.id),
    quantityBefore: integer("quantity_before").notNull(),
    quantityAfter: integer("quantity_after").notNull(),
    reason: text("reason").notNull().default("manual_adjustment"),
    note: text("note").notNull().default(""),
    actorEmail: text("actor_email").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("office_inventory_movements_item_created_idx").on(
      table.itemId,
      table.createdAt,
    ),
  ],
);

export const inventoryCategories = sqliteTable("inventory_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdByEmail: text("created_by_email").notNull(),
  updatedByEmail: text("updated_by_email").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const inventoryStorageLocations = sqliteTable(
  "inventory_storage_locations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull().unique(),
    description: text("description").notNull().default(""),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    inventoryVersion: integer("inventory_version").notNull().default(0),
    createdByEmail: text("created_by_email").notNull(),
    updatedByEmail: text("updated_by_email").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
);

export const inventoryGroups = sqliteTable(
  "inventory_groups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => inventoryCategories.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    accountingMode: text("accounting_mode").notNull().default("quantity"),
    defaultLocationId: integer("default_location_id").references(
      () => inventoryStorageLocations.id,
      { onDelete: "restrict" },
    ),
    notes: text("notes").notNull().default(""),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdByEmail: text("created_by_email").notNull(),
    updatedByEmail: text("updated_by_email").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("inventory_groups_category_name_uq").on(
      table.categoryId,
      table.name,
    ),
  ],
);

export const inventoryItems = sqliteTable(
  "inventory_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    groupId: integer("group_id")
      .notNull()
      .references(() => inventoryGroups.id, { onDelete: "restrict" }),
    legacyItemId: integer("legacy_item_id")
      .unique()
      .references(() => officeInventoryItems.id, { onDelete: "restrict" }),
    sku: text("sku").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    unit: text("unit").notNull().default("шт."),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    nextInventoryDate: text("next_inventory_date"),
    createdByEmail: text("created_by_email").notNull(),
    updatedByEmail: text("updated_by_email").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("inventory_items_group_active_idx").on(
      table.groupId,
      table.active,
      table.name,
    ),
  ],
);

export const inventoryItemStocks = sqliteTable(
  "inventory_item_stocks",
  {
    itemId: integer("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "restrict" }),
    locationId: integer("location_id")
      .notNull()
      .references(() => inventoryStorageLocations.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull().default(0),
    minimumQuantity: integer("minimum_quantity").notNull().default(0),
    version: integer("version").notNull().default(0),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("inventory_item_stocks_item_location_uq").on(
      table.itemId,
      table.locationId,
    ),
    index("inventory_stocks_location_idx").on(table.locationId, table.itemId),
    check("inventory_item_stocks_quantity_check", sql`${table.quantity} >= 0`),
    check(
      "inventory_item_stocks_minimum_check",
      sql`${table.minimumQuantity} >= 0`,
    ),
  ],
);

export const inventoryCounts = sqliteTable(
  "inventory_counts",
  {
    id: text("id").primaryKey(),
    locationId: integer("location_id")
      .notNull()
      .references(() => inventoryStorageLocations.id, { onDelete: "restrict" }),
    countDate: text("count_date").notNull(),
    locationVersionSnapshot: integer("location_version_snapshot").notNull(),
    scopeType: text("scope_type").notNull().default("location"),
    scopeId: integer("scope_id"),
    status: text("status").notNull().default("draft"),
    notes: text("notes").notNull().default(""),
    createdByEmail: text("created_by_email").notNull(),
    finalizedByEmail: text("finalized_by_email"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    finalizedAt: text("finalized_at"),
  },
  (table) => [
    index("inventory_counts_location_date_idx").on(
      table.locationId,
      table.countDate,
      table.id,
    ),
    index("inventory_counts_scope_idx").on(
      table.scopeType,
      table.scopeId,
      table.locationId,
      table.countDate,
      table.id,
    ),
  ],
);

export const inventoryCountLines = sqliteTable(
  "inventory_count_lines",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    countId: text("count_id")
      .notNull()
      .references(() => inventoryCounts.id, { onDelete: "restrict" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "restrict" }),
    expectedQuantity: integer("expected_quantity").notNull(),
    expectedStockVersion: integer("expected_stock_version").notNull(),
    countedQuantity: integer("counted_quantity"),
    included: integer("included", { mode: "boolean" }).notNull().default(true),
  },
  (table) => [
    uniqueIndex("inventory_count_lines_count_item_uq").on(
      table.countId,
      table.itemId,
    ),
    index("inventory_count_lines_count_idx").on(table.countId, table.itemId),
    check(
      "inventory_count_lines_expected_check",
      sql`${table.expectedQuantity} >= 0`,
    ),
    check(
      "inventory_count_lines_counted_check",
      sql`${table.countedQuantity} IS NULL OR ${table.countedQuantity} >= 0`,
    ),
    check(
      "inventory_count_lines_included_check",
      sql`${table.included} IN (0, 1)`,
    ),
  ],
);

export const inventoryCorrections = sqliteTable("inventory_corrections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  requestId: text("request_id").notNull().unique(),
  movementId: integer("movement_id").references(
    (): AnySQLiteColumn => inventoryStockMovements.id,
    { onDelete: "restrict" },
  ),
  countLineId: integer("count_line_id").references(
    () => inventoryCountLines.id,
    { onDelete: "restrict" },
  ),
  previousValue: integer("previous_value").notNull(),
  correctedValue: integer("corrected_value").notNull(),
  reason: text("reason").notNull(),
  actorEmail: text("actor_email").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const inventoryOperations = sqliteTable("inventory_operations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  requestId: text("request_id").notNull().unique(),
  operationType: text("operation_type").notNull(),
  itemId: integer("item_id")
    .notNull()
    .references(() => inventoryItems.id, { onDelete: "restrict" }),
  sourceLocationId: integer("source_location_id")
    .notNull()
    .references(() => inventoryStorageLocations.id, { onDelete: "restrict" }),
  destinationLocationId: integer("destination_location_id").references(
    () => inventoryStorageLocations.id,
    { onDelete: "restrict" },
  ),
  quantityDelta: integer("quantity_delta").notNull(),
  expectedSourceVersion: integer("expected_source_version").notNull(),
  expectedDestinationVersion: integer("expected_destination_version"),
  correctionId: integer("correction_id").references(
    (): AnySQLiteColumn => inventoryCorrections.id,
    { onDelete: "restrict" },
  ),
  reason: text("reason").notNull(),
  actorEmail: text("actor_email").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const inventoryStockMovements = sqliteTable(
  "inventory_stock_movements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    operationId: integer("operation_id").references(
      (): AnySQLiteColumn => inventoryOperations.id,
      { onDelete: "restrict" },
    ),
    legacyMovementId: integer("legacy_movement_id")
      .unique()
      .references(() => officeInventoryMovements.id, { onDelete: "restrict" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "restrict" }),
    locationId: integer("location_id")
      .notNull()
      .references(() => inventoryStorageLocations.id, { onDelete: "restrict" }),
    quantityBefore: integer("quantity_before").notNull(),
    quantityAfter: integer("quantity_after").notNull(),
    quantityDelta: integer("quantity_delta").notNull(),
    operationType: text("operation_type").notNull(),
    reason: text("reason").notNull().default(""),
    actorEmail: text("actor_email").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("inventory_stock_movements_operation_item_location_uq").on(
      table.operationId,
      table.itemId,
      table.locationId,
    ),
    index("inventory_movements_item_created_idx").on(
      table.itemId,
      table.createdAt,
    ),
    index("inventory_movements_location_created_idx").on(
      table.locationId,
      table.createdAt,
    ),
    check(
      "inventory_stock_movements_balance_check",
      sql`${table.quantityAfter} = ${table.quantityBefore} + ${table.quantityDelta}`,
    ),
  ],
);

export const inventoryCatalogEvents = sqliteTable(
  "inventory_catalog_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id").notNull(),
    action: text("action").notNull(),
    details: text("details").notNull().default(""),
    actorEmail: text("actor_email").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("inventory_catalog_events_entity_idx").on(
      table.entityType,
      table.entityId,
      table.createdAt,
    ),
  ],
);

export const inventoryCountEvents = sqliteTable(
  "inventory_count_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    countId: text("count_id")
      .notNull()
      .references(() => inventoryCounts.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    details: text("details").notNull().default(""),
    actorEmail: text("actor_email").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("inventory_count_events_count_idx").on(
      table.countId,
      table.createdAt,
    ),
  ],
);

export const oneOnOneRules = sqliteTable("one_on_one_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  audience: text("audience").notNull().unique(),
  cadenceDays: integer("cadence_days").notNull().default(30),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  updatedByEmail: text("updated_by_email").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const oneOnOnePlans = sqliteTable(
  "one_on_one_plans",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id),
    facilitatorEmail: text("facilitator_email").notNull(),
    facilitatorKind: text("facilitator_kind").notNull(),
    cadenceDays: integer("cadence_days").notNull().default(30),
    nextDueDate: text("next_due_date"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("one_on_one_plans_employee_facilitator_idx").on(
      table.employeeId,
      table.facilitatorEmail,
    ),
    check(
      "one_on_one_plans_kind_check",
      sql`${table.facilitatorKind} IN ('hr', 'manager')`,
    ),
  ],
);

export const oneOnOneMeetings = sqliteTable(
  "one_on_one_meetings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    planId: integer("plan_id")
      .notNull()
      .references(() => oneOnOnePlans.id),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id),
    facilitatorEmail: text("facilitator_email").notNull(),
    creatorUserId: integer("creator_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    heldAt: text("held_at").notNull(),
    riskStatus: text("risk_status"),
    reason: text("reason").notNull().default(""),
    feedback: text("feedback").notNull().default(""),
    waysToSolve: text("ways_to_solve").notNull().default(""),
    notes: text("notes").notNull().default(""),
    sharedWithEmployee: integer("shared_with_employee", { mode: "boolean" })
      .notNull()
      .default(false),
    sharedWithManager: integer("shared_with_manager", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
    requestId: text("request_id"),
  },
  (table) => [
    index("one_on_one_meetings_plan_held_idx").on(table.planId, table.heldAt),
    index("one_on_one_meetings_employee_held_idx").on(
      table.employeeId,
      table.heldAt,
    ),
    index("one_on_one_meetings_employee_created_idx").on(
      table.employeeId,
      table.createdAt,
      table.id,
    ),
    index("one_on_one_meetings_plan_deleted_idx").on(
      table.planId,
      table.deletedAt,
      table.heldAt,
    ),
    uniqueIndex("one_on_one_meetings_request_id_uq")
      .on(table.requestId)
      .where(sql`${table.requestId} IS NOT NULL`),
  ],
);

export const oneOnOneConversationNotes = sqliteTable(
  "one_on_one_conversation_notes",
  {
    id: text("id").primaryKey(),
    meetingId: integer("meeting_id")
      .notNull()
      .references(() => oneOnOneMeetings.id, { onDelete: "restrict" }),
    authorUserId: integer("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    noteType: text("note_type").notNull(),
    body: text("body").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("one_on_one_conversation_notes_meeting_idx").on(
      table.meetingId,
      table.createdAt,
      table.id,
    ),
    index("one_on_one_conversation_notes_author_idx").on(
      table.authorUserId,
      table.updatedAt,
      table.id,
    ),
  ],
);

export const oneOnOneNoteRecipients = sqliteTable(
  "one_on_one_note_recipients",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    noteId: text("note_id")
      .notNull()
      .references(() => oneOnOneConversationNotes.id, { onDelete: "restrict" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    grantedByUserId: integer("granted_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    grantSource: text("grant_source").notNull(),
    sourceId: text("source_id"),
    grantedAt: text("granted_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    uniqueIndex("one_on_one_note_recipient_active_uq")
      .on(table.noteId, table.userId)
      .where(sql`${table.revokedAt} IS NULL`),
    index("one_on_one_note_recipients_user_idx").on(
      table.userId,
      table.revokedAt,
      table.noteId,
    ),
  ],
);

export const knowledgeSections = sqliteTable(
  "knowledge_sections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    parentId: integer("parent_id"),
    title: text("title").notNull().unique(),
    description: text("description").notNull().default(""),
    minimumRole: text("minimum_role").notNull().default("employee"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check(
      "knowledge_sections_minimum_role_check",
      sql`${table.minimumRole} IN ('employee', 'manager', 'hr_admin', 'super_admin')`,
    ),
    index("knowledge_sections_sort_idx").on(table.sortOrder, table.title),
  ],
);

export const knowledgeArticles = sqliteTable(
  "knowledge_articles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sectionId: integer("section_id").references(() => knowledgeSections.id),
    title: text("title").notNull(),
    category: text("category").notNull().default("General"),
    body: text("body").notNull(),
    minimumRole: text("minimum_role").notNull().default("employee"),
    published: integer("published", { mode: "boolean" })
      .notNull()
      .default(true),
    authorEmail: text("author_email").notNull(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check(
      "knowledge_articles_minimum_role_check",
      sql`${table.minimumRole} IN ('employee', 'manager', 'hr_admin', 'super_admin')`,
    ),
    index("knowledge_articles_published_idx").on(
      table.published,
      table.category,
    ),
  ],
);

/**
 * Optional per-person audience for a published knowledge article.
 *
 * Article role access remains the default. When recipients are added, they
 * are an additional explicit audience (useful for mixed role + person
 * sharing); the IDs are never exposed to non-admin clients.
 */
export const knowledgeArticleAccess = sqliteTable(
  "knowledge_article_access",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    articleId: integer("article_id")
      .notNull()
      .references(() => knowledgeArticles.id, { onDelete: "cascade" }),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    grantedByEmail: text("granted_by_email").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("knowledge_article_access_article_employee_unique").on(
      table.articleId,
      table.employeeId,
    ),
    index("knowledge_article_access_article_idx").on(table.articleId),
    index("knowledge_article_access_employee_idx").on(table.employeeId),
  ],
);

export const documentFolders = sqliteTable("document_folders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const companyDocuments = sqliteTable(
  "company_documents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    folderId: integer("folder_id")
      .notNull()
      .references(() => documentFolders.id),
    fileId: text("file_id")
      .notNull()
      .unique()
      .references(() => storedFiles.id),
    title: text("title").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("company_documents_folder_idx").on(table.folderId)],
);

export const orgUnits = sqliteTable("org_units", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(),
  name: text("name").notNull(),
  parentId: integer("parent_id").references((): AnySQLiteColumn => orgUnits.id),
  leadEmployeeId: integer("lead_employee_id").references(
    (): AnySQLiteColumn => employees.id,
  ),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const referenceValues = sqliteTable(
  "reference_values",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind").notNull(),
    value: text("value").notNull(),
    label: text("label").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check(
      "reference_values_kind_check",
      sql`${table.kind} IN ('technology', 'level', 'position', 'legal_entity')`,
    ),
    uniqueIndex("reference_values_kind_value_unique").on(
      table.kind,
      table.value,
    ),
    index("reference_values_kind_active_idx").on(
      table.kind,
      table.active,
      table.sortOrder,
    ),
  ],
);

export const systemSettings = sqliteTable("system_settings", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedByEmail: text("updated_by_email").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const employmentTypes = sqliteTable("employment_types", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  value: text("value").notNull().unique(),
  label: text("label").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const timeProjects = sqliteTable(
  "time_projects",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    code: text("code").notNull().unique(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("time_projects_active_name_idx").on(table.active, table.name),
  ],
);

export const timeEntries = sqliteTable(
  "time_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id),
    projectId: integer("project_id").references(() => timeProjects.id),
    timeCode: text("time_code").notNull().default("project"),
    clockIn: text("clock_in").notNull(),
    clockOut: text("clock_out"),
    workMode: text("work_mode", { enum: ["office", "remote"] })
      .notNull()
      .default("office"),
    source: text("source").notNull().default("web"),
    note: text("note").notNull().default(""),
    idempotencyKey: text("idempotency_key"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("time_entries_one_open_per_employee")
      .on(table.employeeId)
      .where(sql`${table.clockOut} IS NULL`),
  ],
);

export const workSchedules = sqliteTable("work_schedules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id")
    .notNull()
    .unique()
    .references(() => employees.id),
  workDays: text("work_days").notNull().default("1,2,3,4,5"),
  startTime: text("start_time").notNull().default("09:00"),
  endTime: text("end_time").notNull().default("18:00"),
  breakMinutes: integer("break_minutes").notNull().default(60),
  timezone: text("timezone").notNull().default("Europe/Kyiv"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const breakEntries = sqliteTable(
  "break_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    timeEntryId: integer("time_entry_id")
      .notNull()
      .references(() => timeEntries.id),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("break_entries_one_open_per_entry")
      .on(table.timeEntryId)
      .where(sql`${table.endedAt} IS NULL`),
  ],
);

export const timeCorrections = sqliteTable("time_corrections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employees.id),
  timeEntryId: integer("time_entry_id").references(() => timeEntries.id),
  requestedClockIn: text("requested_clock_in").notNull(),
  requestedClockOut: text("requested_clock_out").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  reviewerEmail: text("reviewer_email"),
  reviewerNote: text("reviewer_note").notNull().default(""),
  reviewedAt: text("reviewed_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const timesheetPeriods = sqliteTable(
  "timesheet_periods",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id),
    month: text("month").notNull(),
    status: text("status").notNull().default("open"),
    note: text("note").notNull().default(""),
    lockedByEmail: text("locked_by_email"),
    lockedAt: text("locked_at"),
    lockToken: text("lock_token"),
    snapshotWorkedMinutes: integer("snapshot_worked_minutes"),
    snapshotExpectedMinutes: integer("snapshot_expected_minutes"),
    snapshotOvertimeMinutes: integer("snapshot_overtime_minutes"),
    snapshotCapturedAt: text("snapshot_captured_at"),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("timesheet_periods_employee_month_unique").on(
      table.employeeId,
      table.month,
    ),
  ],
);

export const employmentHistory = sqliteTable("employment_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employees.id),
  effectiveDate: text("effective_date").notNull(),
  jobTitle: text("job_title").notNull(),
  department: text("department").notNull(),
  division: text("division").notNull().default("Ukraine"),
  team: text("team"),
  level: text("level"),
  location: text("location").notNull(),
  managerId: integer("manager_id").references(() => employees.id),
  employmentType: text("employment_type").notNull(),
  status: text("status").notNull(),
  changeReason: text("change_reason").notNull().default("Profile update"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const terminationReasonCatalog = sqliteTable(
  "termination_reason_catalog",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull().unique(),
    label: text("label").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
);

export const employeeTerminations = sqliteTable(
  "employee_terminations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: integer("employee_id")
      .notNull()
      .unique()
      .references(() => employees.id),
    lastWorkingDay: text("last_working_day").notNull(),
    terminationType: text("termination_type").notNull(),
    reasonCodesJson: text("reason_codes_json").notNull().default("[]"),
    description: text("description").notNull().default(""),
    rehireEligible: integer("rehire_eligible", { mode: "boolean" })
      .notNull()
      .default(false),
    taskTransferEmployeeId: integer("task_transfer_employee_id").references(
      () => employees.id,
    ),
    terminatedByEmail: text("terminated_by_email").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check(
      "employee_terminations_type_check",
      sql`${table.terminationType} IN ('resignation','mutual_agreement','involuntary','project_completion')`,
    ),
    index("employee_terminations_last_day_idx").on(table.lastWorkingDay),
  ],
);

export const employeeProfileRecords = sqliteTable(
  "employee_profile_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id),
    kind: text("kind").notNull(),
    referenceValueId: integer("reference_value_id").references(
      () => referenceValues.id,
    ),
    title: text("title").notNull(),
    subtitle: text("subtitle").notNull().default(""),
    startedOn: text("started_on"),
    endedOn: text("ended_on"),
    notes: text("notes").notNull().default(""),
    amountCents: integer("amount_cents"),
    currency: text("currency"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("employee_profile_records_employee_kind_idx").on(
      table.employeeId,
      table.kind,
    ),
    uniqueIndex("employee_profile_records_employee_technology_unique")
      .on(table.employeeId, table.referenceValueId)
      .where(
        sql`${table.kind} = 'skill' AND ${table.referenceValueId} IS NOT NULL`,
      ),
  ],
);

export const leaveTypes = sqliteTable("leave_types", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  defaultAllowance: integer("default_allowance").notNull().default(0),
  requiresApproval: integer("requires_approval", { mode: "boolean" })
    .notNull()
    .default(true),
});

export const companyHolidays = sqliteTable("company_holidays", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull().unique(),
  name: text("name").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const leaveBalances = sqliteTable(
  "leave_balances",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id),
    leaveTypeId: integer("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id),
    year: integer("year").notNull(),
    allowance: real("allowance").notNull().default(0),
    used: real("used").notNull().default(0),
    adjustment: real("adjustment").notNull().default(0),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("leave_balances_employee_type_year_unique").on(
      table.employeeId,
      table.leaveTypeId,
      table.year,
    ),
  ],
);

export const leaveLedger = sqliteTable(
  "leave_ledger",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id),
    leaveTypeId: integer("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id),
    year: integer("year").notNull(),
    delta: real("delta").notNull(),
    eventType: text("event_type").notNull(),
    sourceRequestId: integer("source_request_id").references(
      () => leaveRequests.id,
    ),
    note: text("note").notNull().default(""),
    actorEmail: text("actor_email").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("leave_ledger_request_event_unique").on(
      table.sourceRequestId,
      table.eventType,
    ),
    index("leave_ledger_employee_type_year_idx").on(
      table.employeeId,
      table.leaveTypeId,
      table.year,
    ),
  ],
);

export const leaveRequests = sqliteTable("leave_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employees.id),
  leaveTypeId: integer("leave_type_id")
    .notNull()
    .references(() => leaveTypes.id),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  days: real("days").notNull(),
  reason: text("reason").notNull().default(""),
  idempotencyKey: text("idempotency_key"),
  status: text("status").notNull().default("pending"),
  reviewerEmail: text("reviewer_email"),
  reviewerNote: text("reviewer_note").notNull().default(""),
  reviewedAt: text("reviewed_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const leaveRequestDays = sqliteTable(
  "leave_request_days",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    requestId: integer("request_id")
      .notNull()
      .references(() => leaveRequests.id, { onDelete: "cascade" }),
    leaveDate: text("leave_date").notNull(),
    amount: real("amount").notNull(),
  },
  (table) => [
    uniqueIndex("leave_request_days_request_date_unique").on(
      table.requestId,
      table.leaveDate,
    ),
    check(
      "leave_request_days_amount_check",
      sql`${table.amount} IN (0, 0.5, 1)`,
    ),
    index("leave_request_days_date_idx").on(table.leaveDate),
  ],
);

export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userEmail: text("user_email").notNull(),
  /** Immutable owner link; userEmail is retained as a display/delivery field. */
  userId: integer("user_id").references(() => users.id),
  title: text("title").notNull(),
  message: text("message").notNull(),
  href: text("href").notNull().default("/"),
  readAt: text("read_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/** Durable push delivery intents. In-app notifications remain immediate in
 * `notifications`; this outbox is retried independently by the Worker. */
export const notificationOutbox = sqliteTable(
  "notification_outbox",
  {
    id: text("id").primaryKey(),
    channel: text("channel").notNull().default("push"),
    userEmail: text("user_email").notNull(),
    userId: integer("user_id").references(() => users.id),
    title: text("title").notNull(),
    message: text("message").notNull(),
    href: text("href").notNull().default("/"),
    dedupeKey: text("dedupe_key").notNull().unique(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: text("available_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    lastError: text("last_error").notNull().default(""),
    sentAt: text("sent_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check(
      "notification_outbox_channel_check",
      sql`${table.channel} IN ('push')`,
    ),
    check(
      "notification_outbox_status_check",
      sql`${table.status} IN ('pending', 'processing', 'sent', 'failed')`,
    ),
    index("notification_outbox_due_idx").on(table.status, table.availableAt),
    index("notification_outbox_recipient_idx").on(table.userEmail),
  ],
);

export const mobilePushTokens = sqliteTable(
  "mobile_push_tokens",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userEmail: text("user_email").notNull(),
    userId: integer("user_id").references(() => users.id),
    token: text("token").notNull(),
    platform: text("platform").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("mobile_push_tokens_token_idx").on(table.token),
    index("mobile_push_tokens_user_active_idx").on(
      table.userEmail,
      table.active,
    ),
  ],
);

export const bugReports = sqliteTable(
  "bug_reports",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    reporterEmail: text("reporter_email").notNull(),
    reporterUserId: integer("reporter_user_id").references(() => users.id),
    employeeId: integer("employee_id").references(() => employees.id),
    description: text("description").notNull(),
    screenshotFileId: text("screenshot_file_id").references(
      () => storedFiles.id,
    ),
    status: text("status").notNull().default("open"),
    resolvedByEmail: text("resolved_by_email"),
    resolvedAt: text("resolved_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("bug_reports_status_created_idx").on(table.status, table.createdAt),
    index("bug_reports_reporter_idx").on(table.reporterEmail),
  ],
);

export const peopleTasks = sqliteTable("people_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull().default("general"),
  assigneeEmployeeId: integer("assignee_employee_id")
    .notNull()
    .references(() => employees.id),
  dueDate: text("due_date"),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("todo"),
  createdByEmail: text("created_by_email").notNull(),
  completedAt: text("completed_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const companyEvents = sqliteTable(
  "company_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at"),
    location: text("location").notNull().default(""),
    url: text("url"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("company_events_active_starts_idx").on(table.active, table.startsAt),
  ],
);

export const announcements = sqliteTable(
  "announcements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    imageFileId: text("image_file_id").references(() => storedFiles.id),
    publishedAt: text("published_at").notNull(),
    expiresAt: text("expires_at"),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("announcements_active_published_idx").on(
      table.active,
      table.publishedAt,
    ),
  ],
);

export const announcementDismissals = sqliteTable(
  "announcement_dismissals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    announcementId: integer("announcement_id")
      .notNull()
      .references(() => announcements.id, { onDelete: "cascade" }),
    userEmail: text("user_email").notNull(),
    userId: integer("user_id").references(() => users.id),
    dismissedAt: text("dismissed_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("announcement_dismissals_user_announcement_unique").on(
      table.userEmail,
      table.announcementId,
    ),
    index("announcement_dismissals_user_idx").on(table.userEmail),
  ],
);

export const announcementComments = sqliteTable(
  "announcement_comments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    announcementId: integer("announcement_id")
      .notNull()
      .references(() => announcements.id, { onDelete: "cascade" }),
    userEmail: text("user_email").notNull(),
    userId: integer("user_id").references(() => users.id),
    body: text("body").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("announcement_comments_announcement_created_idx").on(
      table.announcementId,
      table.createdAt,
    ),
  ],
);

export const announcementReactions = sqliteTable(
  "announcement_reactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    announcementId: integer("announcement_id")
      .notNull()
      .references(() => announcements.id, { onDelete: "cascade" }),
    userEmail: text("user_email").notNull(),
    userId: integer("user_id").references(() => users.id),
    emoji: text("emoji").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("announcement_reactions_user_emoji_unique").on(
      table.announcementId,
      table.userEmail,
      table.emoji,
    ),
    index("announcement_reactions_announcement_idx").on(table.announcementId),
    check(
      "announcement_reactions_emoji_check",
      sql`${table.emoji} IN ('👍', '❤️', '🎉', '👏', '😄', '🤔')`,
    ),
  ],
);

export const announcementPolls = sqliteTable("announcement_polls", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  announcementId: integer("announcement_id")
    .notNull()
    .unique()
    .references(() => announcements.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  optionsJson: text("options_json").notNull(),
  description: text("description").notNull().default(""),
  questionsJson: text("questions_json").notNull().default("[]"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const announcementPollResponses = sqliteTable(
  "announcement_poll_responses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    pollId: integer("poll_id")
      .notNull()
      .references(() => announcementPolls.id, { onDelete: "cascade" }),
    userEmail: text("user_email").notNull(),
    userId: integer("user_id").references(() => users.id),
    optionIndex: integer("option_index").notNull(),
    answersJson: text("answers_json").notNull().default("{}"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("announcement_poll_response_unique").on(
      table.pollId,
      table.userEmail,
    ),
  ],
);

export const announcementDeliveries = sqliteTable(
  "announcement_deliveries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    announcementId: integer("announcement_id")
      .notNull()
      .references(() => announcements.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    scheduledFor: text("scheduled_for").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error").notNull().default(""),
    sentAt: text("sent_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("announcement_deliveries_announcement_channel_unique").on(
      table.announcementId,
      table.channel,
    ),
    index("announcement_deliveries_status_schedule_idx").on(
      table.status,
      table.scheduledFor,
    ),
    check(
      "announcement_deliveries_channel_check",
      sql`${table.channel} IN ('google_chat', 'email')`,
    ),
  ],
);

export const companyLinks = sqliteTable(
  "company_links",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    label: text("label").notNull(),
    url: text("url").notNull(),
    description: text("description").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("company_links_active_sort_idx").on(table.active, table.sortOrder),
  ],
);

export const auditEvents = sqliteTable("audit_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  details: text("details").notNull().default(""),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
