import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { buildInventoryCorrectionHistoryQuery } from "../modules/inventory/domain.ts";
import {
  createEmployeePreview,
  endEmployeePreview,
  PreviewCommandError,
} from "../modules/view-as/commands.ts";
import { resolvePreviewSession } from "../modules/view-as/session.ts";

const root = new URL("../", import.meta.url);

test("production migration and explicit demo seed build a constrained database", async () => {
  const [
    migration,
    completionMigration,
    periodsMigration,
    filesMigration,
    identityMigration,
    nadiiaMigration,
    repairMigration,
    feedbackMigration,
    workModeMigration,
    profileRecordsMigration,
    profileMediaMigration,
    homeCommunicationsMigration,
    timeProjectsMigration,
    assetsMigration,
    documentsMigration,
    timeCodesMigration,
    assetHistoryMigration,
    knowledgeGuideMigration,
    knowledgeGuideV2Migration,
    knowledgeRoleConstraintMigration,
    clientSessionsMigration,
    mobilePushTokensMigration,
    bohdanSuperadminMigration,
    repairSuperadminProfilesMigration,
    announcementDismissalsMigration,
    timeEntryWorkModeMigration,
    employeeDocumentFoldersMigration,
    knowledgeSectionsMigration,
    officeInventoryMigration,
    oneOnOnesMigration,
    announcementPollsMigration,
    announcementDeliveryMigration,
    userProjectAccessMigration,
    productExperienceMigration,
    knowledgeGuideHierarchyMigration,
    knowledgeGuideHierarchyRepairMigration,
    storedFileKindsMigration,
    identityAdmissionMigration,
    transactionalInvariantsMigration,
    refreshTokenMigration,
    notificationOutboxMigration,
    idempotencyMigration,
    queryBoundsMigration,
    immutableProtectedAdminsMigration,
    timeBreakConsistencyMigration,
    timePeriodSnapshotsMigration,
    adminSettingsSeparationMigration,
    immutableUserOwnershipMigration,
    timeEntrySourceContractMigration,
    fileScanMigration,
    atomicTimesheetLockMigration,
    timesheetLockingStatusMigration,
    profileCompensationMigration,
    compensationAttachmentMigration,
    normalizedLoginEmailMigration,
    seed,
  ] = await Promise.all([
    readFile(new URL("migrations/0000_production_baseline.sql", root), "utf8"),
    readFile(new URL("migrations/0001_mvp_completion.sql", root), "utf8"),
    readFile(new URL("migrations/0002_timesheet_periods.sql", root), "utf8"),
    readFile(new URL("migrations/0003_private_files.sql", root), "utf8"),
    readFile(
      new URL("migrations/0004_google_sso_superadmins.sql", root),
      "utf8",
    ),
    readFile(
      new URL("migrations/0005_add_nadiia_superadmin.sql", root),
      "utf8",
    ),
    readFile(
      new URL("migrations/0006_repair_superadmin_accounts.sql", root),
      "utf8",
    ),
    readFile(
      new URL("migrations/0007_bug_reports_and_preferences.sql", root),
      "utf8",
    ),
    readFile(new URL("migrations/0008_work_mode_and_game.sql", root), "utf8"),
    readFile(
      new URL("migrations/0009_employee_profile_records.sql", root),
      "utf8",
    ),
    readFile(new URL("migrations/0010_profile_media.sql", root), "utf8"),
    readFile(new URL("migrations/0011_home_communications.sql", root), "utf8"),
    readFile(new URL("migrations/0012_time_projects.sql", root), "utf8"),
    readFile(new URL("migrations/0013_assets_and_knowledge.sql", root), "utf8"),
    readFile(new URL("migrations/0014_company_documents.sql", root), "utf8"),
    readFile(new URL("migrations/0015_time_entry_codes.sql", root), "utf8"),
    readFile(new URL("migrations/0016_asset_history.sql", root), "utf8"),
    readFile(
      new URL("migrations/0017_knowledge_guide_and_access.sql", root),
      "utf8",
    ),
    readFile(new URL("migrations/0018_knowledge_guide_v2.sql", root), "utf8"),
    readFile(
      new URL("migrations/0019_knowledge_role_constraint.sql", root),
      "utf8",
    ),
    readFile(new URL("migrations/0020_client_api_sessions.sql", root), "utf8"),
    readFile(new URL("migrations/0021_mobile_push_tokens.sql", root), "utf8"),
    readFile(
      new URL("migrations/0022_add_bohdan_superadmin.sql", root),
      "utf8",
    ),
    readFile(
      new URL("migrations/0023_repair_superadmin_profiles.sql", root),
      "utf8",
    ),
    readFile(
      new URL("migrations/0024_announcement_dismissals.sql", root),
      "utf8",
    ),
    readFile(new URL("migrations/0025_time_entry_work_mode.sql", root), "utf8"),
    readFile(
      new URL("migrations/0026_employee_document_folders.sql", root),
      "utf8",
    ),
    readFile(new URL("migrations/0027_knowledge_sections.sql", root), "utf8"),
    readFile(new URL("migrations/0028_office_inventory.sql", root), "utf8"),
    readFile(new URL("migrations/0029_one_on_ones.sql", root), "utf8"),
    readFile(new URL("migrations/0030_announcement_polls.sql", root), "utf8"),
    readFile(
      new URL("migrations/0031_announcement_delivery.sql", root),
      "utf8",
    ),
    readFile(new URL("migrations/0032_user_project_access.sql", root), "utf8"),
    readFile(new URL("migrations/0033_product_experience.sql", root), "utf8"),
    readFile(
      new URL("migrations/0034_knowledge_guide_hierarchy.sql", root),
      "utf8",
    ),
    readFile(
      new URL("migrations/0035_knowledge_guide_hierarchy_repair.sql", root),
      "utf8",
    ),
    readFile(new URL("migrations/0047_stored_file_kinds.sql", root), "utf8"),
    readFile(
      new URL("migrations/0050_identity_admission_and_offboarding.sql", root),
      "utf8",
    ),
    readFile(
      new URL("migrations/0051_transactional_business_invariants.sql", root),
      "utf8",
    ),
    readFile(
      new URL("migrations/0052_refresh_token_replay_and_rate_limit.sql", root),
      "utf8",
    ),
    readFile(new URL("migrations/0053_notification_outbox.sql", root), "utf8"),
    readFile(
      new URL("migrations/0054_idempotent_create_commands.sql", root),
      "utf8",
    ),
    readFile(
      new URL("migrations/0055_query_bounds_and_indexes.sql", root),
      "utf8",
    ),
    readFile(
      new URL("migrations/0056_immutable_protected_admins.sql", root),
      "utf8",
    ),
    readFile(
      new URL("migrations/0057_time_break_consistency.sql", root),
      "utf8",
    ),
    readFile(
      new URL("migrations/0058_time_period_snapshots.sql", root),
      "utf8",
    ),
    readFile(
      new URL("migrations/0059_admin_settings_separation.sql", root),
      "utf8",
    ),
    readFile(
      new URL("migrations/0060_immutable_user_ownership.sql", root),
      "utf8",
    ),
    readFile(
      new URL("migrations/0061_time_entry_source_contract.sql", root),
      "utf8",
    ),
    readFile(new URL("migrations/0062_file_scan_status.sql", root), "utf8"),
    readFile(
      new URL("migrations/0063_atomic_timesheet_lock_finalize.sql", root),
      "utf8",
    ),
    readFile(
      new URL("migrations/0064_timesheet_locking_status.sql", root),
      "utf8",
    ),
    readFile(
      new URL("migrations/0065_employee_profile_compensation.sql", root),
      "utf8",
    ),
    readFile(
      new URL("migrations/0066_compensation_attachment_kind.sql", root),
      "utf8",
    ),
    readFile(
      new URL("migrations/0067_normalized_login_email_unique.sql", root),
      "utf8",
    ),
    readFile(new URL("db/demo-seed.sql", root), "utf8"),
  ]);
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(migration);
    db.exec(completionMigration);
    db.exec(periodsMigration);
    db.exec(filesMigration);
    db.exec(identityMigration);
    db.exec(nadiiaMigration);
    db.exec(repairMigration);
    db.exec(feedbackMigration);
    db.exec(workModeMigration);
    db.exec(profileRecordsMigration);
    db.exec(profileMediaMigration);
    db.exec(homeCommunicationsMigration);
    db.exec(timeProjectsMigration);
    db.exec(assetsMigration);
    db.exec(documentsMigration);
    db.exec(timeCodesMigration);
    db.exec(assetHistoryMigration);
    db.exec(knowledgeGuideMigration);
    db.exec(knowledgeGuideV2Migration);
    db.exec(knowledgeRoleConstraintMigration);
    db.exec(clientSessionsMigration);
    db.exec(mobilePushTokensMigration);
    db.exec(bohdanSuperadminMigration);
    db.exec(bohdanSuperadminMigration);
    db.exec(repairSuperadminProfilesMigration);
    db.exec(repairSuperadminProfilesMigration);
    db.exec(announcementDismissalsMigration);
    db.exec(timeEntryWorkModeMigration);
    db.exec(employeeDocumentFoldersMigration);
    db.exec(knowledgeSectionsMigration);
    db.exec(officeInventoryMigration);
    db.exec(oneOnOnesMigration);
    db.exec(announcementPollsMigration);
    db.exec(announcementDeliveryMigration);
    db.exec(userProjectAccessMigration);
    db.exec(productExperienceMigration);
    db.exec(knowledgeGuideHierarchyMigration);
    db.exec(knowledgeGuideHierarchyRepairMigration);
    for (const migrationFile of [
      "0036_demo_announcement_and_reference_data.sql",
      "0037_default_one_on_one_rules.sql",
      "0038_system_data_integrity.sql",
      "0039_employment_type_reference.sql",
      "0040_reference_catalog_expansion.sql",
      "0041_leave_balance_trigger_hardening.sql",
      "0042_announcement_engagement.sql",
      "0043_employee_technology_uniqueness.sql",
      "0044_employment_lifecycle_and_leave_days.sql",
      "0045_task_priorities.sql",
      "0046_announcement_images.sql",
    ]) {
      db.exec(
        await readFile(new URL(`migrations/${migrationFile}`, root), "utf8"),
      );
    }
    db.exec(storedFileKindsMigration);
    for (const migrationFile of [
      "0048_knowledge_article_access.sql",
      "0049_poll_option_images.sql",
    ]) {
      db.exec(
        await readFile(new URL(`migrations/${migrationFile}`, root), "utf8"),
      );
    }
    db.exec(identityAdmissionMigration);
    db.exec(transactionalInvariantsMigration);
    db.exec(refreshTokenMigration);
    db.exec(notificationOutboxMigration);
    db.exec(idempotencyMigration);
    db.exec(queryBoundsMigration);
    db.exec(immutableProtectedAdminsMigration);
    db.exec(timeBreakConsistencyMigration);
    db.exec(timePeriodSnapshotsMigration);
    db.exec(adminSettingsSeparationMigration);
    db.exec(immutableUserOwnershipMigration);
    db.exec(timeEntrySourceContractMigration);
    db.exec(fileScanMigration);
    db.exec(atomicTimesheetLockMigration);
    db.exec(timesheetLockingStatusMigration);
    db.exec("BEGIN;");
    db.exec(profileCompensationMigration);
    db.exec("COMMIT;");
    db.prepare(
      "INSERT INTO stored_files(id, kind, category, owner_employee_id, object_key, original_name, content_type, size_bytes, uploaded_by_email, related_entity_type, related_entity_id, visibility, scan_status, scanned_at, scan_provider, scan_error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "file-migration-preserve",
      "bug_screenshot",
      "bug",
      1,
      "bug_screenshot/1/migration-preserve.png",
      "migration-preserve.png",
      "image/png",
      1024,
      "person005@example.test",
      "bug_report",
      "1",
      "hr_only",
      "clean",
      "2026-09-05T10:00:00.000Z",
      "synthetic-scanner",
      "",
    );
    db.prepare(
      "INSERT INTO bug_reports(reporter_email, employee_id, description, screenshot_file_id) VALUES (?, ?, ?, ?)",
    ).run(
      "person005@example.test",
      1,
      "preserve stored file reference through kind migration",
      "file-migration-preserve",
    );
    db.exec("PRAGMA foreign_keys = ON;");
    assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
    db.exec("BEGIN;");
    db.exec(compensationAttachmentMigration);
    db.exec("COMMIT;");
    db.exec(normalizedLoginEmailMigration);
    db.exec(seed);
    const preservedFile = db
      .prepare(
        "SELECT kind, category, owner_employee_id, object_key, original_name, content_type, size_bytes, uploaded_by_email, related_entity_type, related_entity_id, visibility, scan_status, scanned_at, scan_provider, scan_error FROM stored_files WHERE id='file-migration-preserve'",
      )
      .get();
    assert.deepEqual(
      { ...preservedFile },
      {
        kind: "bug_screenshot",
        category: "bug",
        owner_employee_id: 1,
        object_key: "bug_screenshot/1/migration-preserve.png",
        original_name: "migration-preserve.png",
        content_type: "image/png",
        size_bytes: 1024,
        uploaded_by_email: "person005@example.test",
        related_entity_type: "bug_report",
        related_entity_id: "1",
        visibility: "hr_only",
        scan_status: "clean",
        scanned_at: "2026-09-05T10:00:00.000Z",
        scan_provider: "synthetic-scanner",
        scan_error: "",
      },
    );
    assert.equal(
      db
        .prepare(
          "SELECT screenshot_file_id FROM bug_reports WHERE description=?",
        )
        .get("preserve stored file reference through kind migration")
        .screenshot_file_id,
      "file-migration-preserve",
    );
    assert.equal(
      db.prepare("SELECT count(*) count FROM pragma_foreign_key_check").get()
        .count,
      0,
    );
    db.prepare(
      "INSERT INTO stored_files(id, kind, category, owner_employee_id, object_key, original_name, content_type, size_bytes, uploaded_by_email, related_entity_type, related_entity_id, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "compensation-attachment-test",
      "compensation_attachment",
      "contract",
      1,
      "compensation_attachment/1/test.pdf",
      "test.pdf",
      "application/pdf",
      1024,
      "person005@example.test",
      "employee_compensation",
      "1",
      "hr_only",
    );
    assert.throws(
      () =>
        db
          .prepare(
            "INSERT INTO employees(first_name,last_name,email,job_title,department,start_date,division,division_unit_id,department_unit_id,team,team_unit_id,position_value_id,level,level_value_id,employment_type,employment_type_id) SELECT 'Case','Duplicate','person005@example.test',job_title,department,'2026-01-01',division,division_unit_id,department_unit_id,team,team_unit_id,position_value_id,level,level_value_id,employment_type,employment_type_id FROM employees WHERE id=1",
          )
          .run(),
      /UNIQUE constraint failed/,
    );
    assert.throws(
      () =>
        db
          .prepare(
            "INSERT INTO users(email,role) VALUES('person005@example.test','employee')",
          )
          .run(),
      /UNIQUE constraint failed/,
    );

    assert.equal(
      db.prepare("SELECT count(*) count FROM employees").get().count,
      13,
    );
    for (const [index, source] of [
      "web",
      "manual",
      "import",
      "mobile",
      "chrome_extension",
      "autofill",
    ].entries()) {
      db.prepare(
        "INSERT INTO time_entries(employee_id, clock_in, clock_out, source) VALUES (?, ?, ?, ?)",
      ).run(
        1,
        `2026-07-0${index + 1}T09:00:00.000Z`,
        `2026-07-0${index + 1}T10:00:00.000Z`,
        source,
      );
    }
    assert.throws(
      () =>
        db
          .prepare(
            "INSERT INTO time_entries(employee_id, clock_in, clock_out, source) VALUES (?, ?, ?, ?)",
          )
          .run(
            1,
            "2026-07-08T09:00:00.000Z",
            "2026-07-08T10:00:00.000Z",
            "api",
          ),
      /CHECK constraint failed/,
    );
    db.prepare(
      "INSERT INTO stored_files(id, kind, category, owner_employee_id, object_key, original_name, content_type, size_bytes, uploaded_by_email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "announcement-image-1",
      "announcement_image",
      "announcement",
      1,
      "announcement_image/1/announcement-image-1.png",
      "announcement.png",
      "image/png",
      1024,
      "person005@example.test",
    );
    assert.deepEqual(
      db
        .prepare(
          "SELECT email FROM users WHERE role = 'super_admin' ORDER BY email",
        )
        .all()
        .map(({ email }) => email),
      [
        "person003@example.test",
        "person005@example.test",
        "person012@example.test",
        "person023@example.test",
      ],
    );
    assert.equal(
      db.prepare("SELECT count(*) count FROM protected_admin_accounts").get()
        .count,
      4,
    );
    assert.deepEqual(
      db
        .prepare("PRAGMA table_info(timesheet_periods)")
        .all()
        .map(({ name }) => name)
        .filter((name) => name.startsWith("snapshot_")),
      [
        "snapshot_worked_minutes",
        "snapshot_expected_minutes",
        "snapshot_overtime_minutes",
        "snapshot_captured_at",
      ],
    );
    assert.deepEqual(
      db
        .prepare("PRAGMA table_info(stored_files)")
        .all()
        .map(({ name }) => name)
        .filter((name) => name.startsWith("scan") || name === "scan_error"),
      ["scan_status", "scanned_at", "scan_provider", "scan_error"],
    );
    assert.equal(
      db
        .prepare(
          "SELECT scan_status FROM stored_files WHERE id='announcement-image-1'",
        )
        .get().scan_status,
      "unscanned",
    );
    db.prepare(
      "UPDATE stored_files SET scan_status='clean', scanned_at=?, scan_provider=? WHERE id=?",
    ).run(
      "2026-09-04T00:00:00.000Z",
      "synthetic-scanner",
      "announcement-image-1",
    );
    assert.equal(
      db
        .prepare(
          "SELECT scan_status FROM stored_files WHERE id='announcement-image-1'",
        )
        .get().scan_status,
      "clean",
    );
    for (const [table, column, emailColumn] of [
      ["notifications", "user_id", "user_email"],
      ["notification_outbox", "user_id", "user_email"],
      ["mobile_push_tokens", "user_id", "user_email"],
      ["announcement_dismissals", "user_id", "user_email"],
      ["announcement_comments", "user_id", "user_email"],
      ["announcement_reactions", "user_id", "user_email"],
      ["announcement_poll_responses", "user_id", "user_email"],
      ["bug_reports", "reporter_user_id", "reporter_email"],
    ]) {
      assert.equal(
        db
          .prepare(
            `SELECT count(*) count FROM ${table} WHERE ${column} IS NULL AND lower(${emailColumn}) IN (SELECT lower(email) FROM users)`,
          )
          .get().count,
        0,
        `${table} ownership must be backfilled`,
      );
    }
    const announcementId = db
      .prepare("SELECT id FROM announcements ORDER BY id LIMIT 1")
      .get().id;
    db.prepare(
      "INSERT INTO announcement_comments(announcement_id,user_email,body) VALUES (?,?,?)",
    ).run(announcementId, "person005@example.test", "ownership trigger");
    assert.equal(
      db
        .prepare(
          "SELECT user_id FROM announcement_comments WHERE body='ownership trigger'",
        )
        .get().user_id,
      db
        .prepare("SELECT id FROM users WHERE email='person005@example.test'")
        .get().id,
    );
    const protectedAdminId = db
      .prepare("SELECT id FROM users WHERE email = 'person005@example.test'")
      .get().id;
    assert.throws(
      () =>
        db
          .prepare("UPDATE users SET email=? WHERE id=?")
          .run("renamed@example.test", protectedAdminId),
      /protected super administrator email cannot change/,
    );
    assert.throws(
      () =>
        db
          .prepare("UPDATE users SET role='employee' WHERE id=?")
          .run(protectedAdminId),
      /protected super administrator cannot be demoted/,
    );
    assert.throws(
      () =>
        db
          .prepare(
            "UPDATE access_policies SET manage_settings=1 WHERE role='manager'",
          )
          .run(),
      /manage_settings is restricted to administrators/,
    );
    assert.equal(
      db.prepare("SELECT count(*) count FROM users").get().count,
      13,
    );
    assert.equal(
      db
        .prepare(
          "SELECT employee_id FROM users WHERE email = 'person005@example.test'",
        )
        .get().employee_id,
      db
        .prepare(
          "SELECT id FROM employees WHERE email = 'person005@example.test'",
        )
        .get().id,
    );
    assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
    assert.equal(
      db
        .prepare(
          "SELECT count(*) count FROM sqlite_master WHERE type = 'table' AND name IN ('bug_reports', 'company_holidays', 'people_tasks', 'timesheet_periods', 'stored_files', 'work_mode_entries', 'game_scores', 'employee_profile_records')",
        )
        .get().count,
      8,
    );
    assert.equal(
      db
        .prepare(
          "SELECT count(*) count FROM sqlite_master WHERE type = 'table' AND name IN ('client_sessions', 'oauth_authorization_codes', 'web_sessions')",
        )
        .get().count,
      3,
    );
    assert.equal(
      db
        .prepare(
          "SELECT count(*) count FROM sqlite_master WHERE type = 'table' AND name IN ('client_session_refresh_tokens', 'auth_rate_limits')",
        )
        .get().count,
      2,
    );
    assert.equal(
      db
        .prepare(
          "SELECT count(*) count FROM sqlite_master WHERE type = 'trigger' AND name IN ('time_entries_no_overlap_insert', 'break_entries_bounds_insert', 'reimbursement_policy_limit_insert', 'time_entry_break_bounds_update_guard', 'access_policies_settings_scope_insert', 'access_policies_settings_scope_update')",
        )
        .get().count,
      6,
    );
    const userColumns = db
      .prepare("PRAGMA table_info(users)")
      .all()
      .map(({ name }) => name);
    assert.deepEqual(
      userColumns.filter((name) =>
        [
          "provider_subject",
          "enabled",
          "disabled_at",
          "disabled_by_email",
        ].includes(name),
      ),
      ["provider_subject", "enabled", "disabled_at", "disabled_by_email"],
    );
    assert.equal(
      db.prepare("SELECT count(*) count FROM employee_document_folders").get()
        .count,
      26,
    );
    assert.ok(
      db.prepare("SELECT count(*) count FROM knowledge_sections").get().count >
        0,
    );
    assert.equal(
      db
        .prepare(
          "SELECT count(*) count FROM knowledge_articles WHERE section_id IS NULL",
        )
        .get().count,
      0,
    );
    assert.equal(
      db
        .prepare(
          "SELECT count(*) count FROM sqlite_master WHERE type = 'table' AND name IN ('office_inventory_items', 'office_inventory_movements')",
        )
        .get().count,
      2,
    );

    db.prepare(
      "INSERT INTO time_entries(employee_id, clock_in) VALUES (?, ?)",
    ).run(1, "2026-07-23T09:00:00.000Z");
    const openEntryId = db
      .prepare(
        "SELECT id FROM time_entries WHERE employee_id=1 AND clock_out IS NULL ORDER BY id DESC LIMIT 1",
      )
      .get().id;
    assert.throws(
      () =>
        db
          .prepare(
            "INSERT INTO time_entries(employee_id, clock_in) VALUES (?, ?)",
          )
          .run(1, "2026-07-23T10:00:00.000Z"),
      /UNIQUE constraint failed/,
    );
    db.prepare(
      "INSERT INTO break_entries(time_entry_id, started_at, ended_at) VALUES (?, ?, ?)",
    ).run(openEntryId, "2026-07-23T10:00:00.000Z", "2026-07-23T10:30:00.000Z");
    assert.throws(
      () =>
        db
          .prepare("UPDATE time_entries SET clock_in=? WHERE id=?")
          .run("2026-07-23T12:00:00.000Z", openEntryId),
      /time_entry_break_outside_interval/,
    );
    assert.throws(
      () =>
        db
          .prepare(
            "INSERT INTO reimbursement_requests(employee_id, category, amount_cents, expense_date, description) VALUES (?, ?, ?, ?, ?)",
          )
          .run(1, "Software", 100, "2026-07-23", "Invalid category"),
      /CHECK constraint failed/,
    );
    db.prepare(
      "INSERT INTO stored_files(id, kind, category, owner_employee_id, object_key, original_name, content_type, size_bytes, uploaded_by_email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "file-1",
      "employee_document",
      "contract",
      1,
      "employee_document/1/file-1.pdf",
      "contract.pdf",
      "application/pdf",
      1024,
      "person005@example.test",
    );
    assert.throws(
      () =>
        db
          .prepare(
            "INSERT INTO stored_files(id, kind, category, owner_employee_id, object_key, original_name, content_type, size_bytes, uploaded_by_email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            "file-2",
            "public_file",
            "other",
            1,
            "public/file-2.pdf",
            "bad.pdf",
            "application/pdf",
            1024,
            "person005@example.test",
          ),
      /CHECK constraint failed/,
    );
    db.prepare(
      "INSERT INTO timesheet_periods(employee_id, month, status) VALUES (?, ?, ?)",
    ).run(1, "2026-07", "locked");
    assert.throws(
      () =>
        db
          .prepare(
            "INSERT INTO timesheet_periods(employee_id, month, status) VALUES (?, ?, ?)",
          )
          .run(1, "2026-07", "open"),
      /UNIQUE constraint failed/,
    );
    assert.throws(
      () =>
        db
          .prepare(
            "INSERT INTO people_tasks(title, category, assignee_employee_id, created_by_email) VALUES (?, ?, ?, ?)",
          )
          .run("Bad task", "unknown", 1, "person005@example.test"),
      /CHECK constraint failed/,
    );
    assert.equal(
      db
        .prepare(
          "SELECT locale FROM users WHERE email = 'person005@example.test'",
        )
        .get().locale,
      "uk",
    );
    db.prepare(
      "INSERT INTO stored_files(id, kind, category, owner_employee_id, object_key, original_name, content_type, size_bytes, uploaded_by_email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "bug-file-1",
      "bug_screenshot",
      "bug",
      1,
      "bug_screenshot/1/bug-file-1.png",
      "bug.png",
      "image/png",
      1024,
      "person005@example.test",
    );
    db.prepare(
      "INSERT INTO bug_reports(reporter_email, employee_id, description, screenshot_file_id) VALUES (?, ?, ?, ?)",
    ).run(
      "person005@example.test",
      1,
      "Buttons overlap on mobile.",
      "bug-file-1",
    );
    assert.equal(
      db.prepare("SELECT default_work_mode FROM employees WHERE id = 1").get()
        .default_work_mode,
      "office",
    );
    db.prepare(
      "INSERT INTO work_mode_entries(employee_id, work_date, mode) VALUES (?, ?, ?)",
    ).run(1, "2026-07-24", "remote");
    assert.throws(
      () =>
        db
          .prepare(
            "INSERT INTO work_mode_entries(employee_id, work_date, mode) VALUES (?, ?, ?)",
          )
          .run(1, "2026-07-24", "office"),
      /UNIQUE constraint failed/,
    );
    db.prepare(
      "INSERT INTO game_scores(employee_id, user_email, best_score) VALUES (?, ?, ?)",
    ).run(1, "person005@example.test", 42);
    assert.equal(
      db
        .prepare(
          "SELECT count(*) count FROM knowledge_articles WHERE author_email = 'guide@incora.people'",
        )
        .get().count,
      31,
    );
    assert.equal(
      db
        .prepare(
          "SELECT count(*) count FROM knowledge_articles WHERE author_email = 'guide@incora.people' AND instr(body, char(10)) > 0",
        )
        .get().count,
      31,
    );
    assert.equal(
      db
        .prepare(
          "SELECT count(*) count FROM knowledge_articles WHERE author_email = 'guide@incora.people' AND instr(body, '\\n') > 0",
        )
        .get().count,
      0,
    );
    assert.equal(
      db
        .prepare(
          "SELECT minimum_role FROM knowledge_articles WHERE title LIKE '8.%'",
        )
        .get().minimum_role,
      "super_admin",
    );
    assert.throws(
      () =>
        db
          .prepare(
            "INSERT INTO knowledge_articles(title, category, body, minimum_role, published, author_email) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .run(
            "Invalid role",
            "Test",
            "This should be rejected.",
            "unknown",
            1,
            "guide@incora.people",
          ),
      /CHECK constraint failed/,
    );
  } finally {
    db.close();
  }
});

test("Sites Drizzle history contains every runtime table", async () => {
  const migrationUrls = [
    "drizzle/0000_luxuriant_invaders.sql",
    "drizzle/0001_fearless_felicia_hardy.sql",
    "drizzle/0002_abnormal_nightmare.sql",
    "drizzle/0003_chemical_natasha_romanoff.sql",
    "drizzle/0004_ambiguous_maverick.sql",
    "drizzle/0005_tiny_darkstar.sql",
    "drizzle/0006_google_sso_superadmins.sql",
    "drizzle/0007_add_nadiia_superadmin.sql",
    "drizzle/0008_repair_superadmin_accounts.sql",
    "drizzle/0009_sites_demo_seed.sql",
    "drizzle/0010_superadmin_employee_profiles.sql",
    "drizzle/0011_bug_reports_and_preferences.sql",
    "drizzle/0012_work_mode_and_game.sql",
    "drizzle/0013_employee_profile_records.sql",
    "drizzle/0014_profile_media.sql",
    "drizzle/0015_home_communications.sql",
    "drizzle/0016_time_projects.sql",
    "drizzle/0017_nostalgic_piledriver.sql",
    "drizzle/0018_right_bug.sql",
    "drizzle/0019_natural_sersi.sql",
    "drizzle/0020_blue_justin_hammer.sql",
    "drizzle/0021_reflective_tyger_tiger.sql",
    "drizzle/0022_knowledge_guide_v2.sql",
    "drizzle/0023_client_api_sessions.sql",
    "drizzle/0024_mobile_push_tokens.sql",
    "drizzle/0025_add_bohdan_superadmin.sql",
    "drizzle/0026_repair_superadmin_profiles.sql",
    "drizzle/0027_announcement_dismissals.sql",
    "drizzle/0028_time_entry_work_mode.sql",
    "drizzle/0029_employee_document_folders.sql",
    "drizzle/0030_knowledge_sections.sql",
    "drizzle/0031_office_inventory.sql",
    "drizzle/0032_one_on_ones.sql",
    "drizzle/0033_announcement_polls.sql",
    "drizzle/0034_announcement_delivery.sql",
    "drizzle/0035_user_project_access.sql",
    "drizzle/0036_product_experience.sql",
    "drizzle/0037_knowledge_guide_hierarchy.sql",
    "drizzle/0038_knowledge_guide_hierarchy_repair.sql",
    "drizzle/0039_demo_announcement_and_reference_data.sql",
    "drizzle/0040_default_one_on_one_rules.sql",
    "drizzle/0041_system_data_integrity.sql",
    "drizzle/0042_employment_type_reference.sql",
    "drizzle/0043_reference_catalog_expansion.sql",
    "drizzle/0044_leave_balance_trigger_hardening.sql",
    "drizzle/0045_announcement_engagement.sql",
    "drizzle/0046_employee_technology_uniqueness.sql",
    "drizzle/0047_task_priorities.sql",
    "drizzle/0048_employment_lifecycle_and_leave_days.sql",
    "drizzle/0049_announcement_images.sql",
    "drizzle/0050_stored_file_kinds.sql",
    "drizzle/0051_knowledge_article_access.sql",
    "drizzle/0052_poll_option_images.sql",
    "drizzle/0053_identity_admission_and_offboarding.sql",
    "drizzle/0054_transactional_business_invariants.sql",
    "drizzle/0055_refresh_token_replay_and_rate_limit.sql",
    "drizzle/0056_notification_outbox.sql",
    "drizzle/0057_idempotent_create_commands.sql",
    "drizzle/0058_query_bounds_and_indexes.sql",
    "drizzle/0059_immutable_protected_admins.sql",
    "drizzle/0060_time_break_consistency.sql",
    "drizzle/0061_time_period_snapshots.sql",
    "drizzle/0062_admin_settings_separation.sql",
    "drizzle/0063_immutable_user_ownership.sql",
    "drizzle/0064_time_entry_source_contract.sql",
    "drizzle/0065_file_scan_status.sql",
    "drizzle/0066_atomic_timesheet_lock_finalize.sql",
    "drizzle/0067_timesheet_locking_status.sql",
    "drizzle/0068_employee_profile_compensation.sql",
    "drizzle/0069_compensation_attachment_kind.sql",
    "drizzle/0070_normalized_login_email_unique.sql",
    "drizzle/0071_inventory_management.sql",
    "drizzle/0072_view_as_employee.sql",
    "drizzle/0073_hr_1on1_inventory_v2.sql",
    "drizzle/0074_employee_invitations.sql",
  ];
  const migrations = await Promise.all(
    migrationUrls.map((path) => readFile(new URL(path, root), "utf8")),
  );
  const db = new DatabaseSync(":memory:");
  try {
    const transactionStart = migrationUrls.findIndex((path) =>
      path.endsWith("0068_employee_profile_compensation.sql"),
    );
    const transactionEnd = migrationUrls.findIndex((path) =>
      path.endsWith("0069_compensation_attachment_kind.sql"),
    );
    for (const [index, migration] of migrations.entries()) {
      if (index === transactionStart) db.exec("BEGIN;");
      db.exec(migration);
      if (index === transactionEnd) db.exec("COMMIT;");
    }
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all()
      .map((row) => row.name);
    for (const required of [
      "company_holidays",
      "bug_reports",
      "people_tasks",
      "stored_files",
      "timesheet_periods",
      "work_mode_entries",
      "game_scores",
      "employee_profile_records",
      "company_events",
      "announcements",
      "announcement_dismissals",
      "company_links",
      "time_projects",
      "company_assets",
      "asset_events",
      "document_folders",
      "company_documents",
      "knowledge_articles",
      "knowledge_article_access",
      "time_entries",
      "leave_requests",
      "employee_document_folders",
      "knowledge_sections",
      "office_inventory_items",
      "office_inventory_movements",
      "one_on_one_rules",
      "one_on_one_plans",
      "one_on_one_meetings",
      "announcement_polls",
      "announcement_poll_responses",
      "announcement_deliveries",
      "termination_reason_catalog",
      "employee_terminations",
      "leave_request_days",
      "client_session_refresh_tokens",
      "auth_rate_limits",
      "notification_outbox",
      "protected_admin_accounts",
      "notifications",
      "mobile_push_tokens",
      "announcement_dismissals",
      "announcement_comments",
      "announcement_reactions",
      "announcement_poll_responses",
      "timesheet_periods",
      "reimbursement_requests",
      "inventory_categories",
      "inventory_groups",
      "inventory_items",
      "inventory_storage_locations",
      "inventory_item_stocks",
      "inventory_operations",
      "inventory_stock_movements",
      "inventory_counts",
      "inventory_count_lines",
      "inventory_count_events",
      "inventory_corrections",
      "inventory_catalog_events",
      "employee_view_previews",
      "employee_view_preview_audit",
      "employee_invitation_attempts",
    ]) {
      assert.ok(tables.includes(required), `${required} is missing`);
    }
    assert.equal(
      db
        .prepare(
          "SELECT locale FROM users WHERE email = 'person005@example.test'",
        )
        .get().locale,
      "uk",
    );
    assert.equal(
      db.prepare("SELECT count(*) count FROM employees").get().count,
      13,
    );
    assert.equal(
      db
        .prepare(
          "SELECT count(*) count FROM knowledge_articles WHERE author_email = 'guide@incora.people'",
        )
        .get().count,
      31,
    );
    assert.equal(
      db
        .prepare(
          "SELECT employee_id FROM users WHERE email = 'person005@example.test'",
        )
        .get().employee_id,
      1,
    );
    assert.deepEqual(
      db
        .prepare(
          "SELECT email FROM users WHERE role = 'super_admin' AND employee_id IS NOT NULL ORDER BY email",
        )
        .all()
        .map(({ email }) => email),
      [
        "person003@example.test",
        "person005@example.test",
        "person012@example.test",
        "person023@example.test",
      ],
    );
  } finally {
    db.close();
  }
});

test("Wrangler and Sites migrations keep new module contracts compatible", async () => {
  const [runtime, sites] = await Promise.all([
    databaseFromHistory("migrations"),
    databaseFromHistory("drizzle"),
  ]);
  try {
    const runtimeSchema = describeSchema(runtime);
    const sitesSchema = describeSchema(sites);
    const contractTables = [
      "access_policies",
      "company_assets",
      "asset_events",
      "document_folders",
      "company_documents",
      "time_projects",
      "time_entries",
      "leave_requests",
      "knowledge_articles",
      "knowledge_article_access",
      "stored_files",
      "employee_document_folders",
      "client_sessions",
      "auth_rate_limits",
      "client_session_refresh_tokens",
      "notification_outbox",
      "protected_admin_accounts",
      "timesheet_periods",
      "reimbursement_requests",
      "notifications",
      "mobile_push_tokens",
      "bug_reports",
      "announcement_dismissals",
      "announcement_comments",
      "announcement_reactions",
      "announcement_poll_responses",
      "inventory_categories",
      "inventory_groups",
      "inventory_items",
      "inventory_storage_locations",
      "inventory_item_stocks",
      "inventory_operations",
      "inventory_stock_movements",
      "inventory_counts",
      "inventory_count_lines",
      "inventory_count_events",
      "inventory_corrections",
      "inventory_catalog_events",
      "employee_view_previews",
      "employee_view_preview_audit",
    ];

    for (const table of contractTables) {
      assert.deepEqual(
        runtimeSchema[table].map((column) => column.name).sort(),
        sitesSchema[table].map((column) => column.name).sort(),
        `${table} columns must match in both migration histories`,
      );
    }
    for (const db of [runtime, sites]) {
      const userColumns = db
        .prepare("PRAGMA table_info(users)")
        .all()
        .map((column) => column.name);
      assert.ok(userColumns.includes("created_at"));
      assert.ok(userColumns.includes("last_login_at"));
    }

    for (const db of [runtime, sites]) {
      const previewAuditForeignKeys = db
        .prepare("PRAGMA foreign_key_list(employee_view_preview_audit)")
        .all();
      assert.equal(
        previewAuditForeignKeys.find((row) => row.from === "preview_id")
          ?.on_delete,
        undefined,
        "audit references must remain append-only while session cleanup proceeds",
      );
      assert.match(
        db
          .prepare(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='employee_view_previews'",
          )
          .get().sql,
        /expires_at\s*>\s*started_at/i,
      );
    }

    const runtimeSql = runtime
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'knowledge_articles'",
      )
      .get().sql;
    assert.match(runtimeSql, /minimum_role[^)]*IN\s*\(/i);
    for (const db of [runtime, sites]) {
      const timeEntrySql = db
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'time_entries'",
        )
        .get().sql;
      assert.match(timeEntrySql, /chrome_extension/);
      assert.match(timeEntrySql, /autofill/);
      assert.match(timeEntrySql, /mobile/);

      const periodIndexes = db
        .prepare("PRAGMA index_list(timesheet_periods)")
        .all();
      assert.ok(
        periodIndexes.some((index) => index.unique === 1),
        "timesheet periods must retain a unique employee/month key",
      );

      // Use the same UPSERT shape as beginTimesheetPeriodLock. The history
      // database has no demo employees, so this disposable fixture temporarily
      // disables FK enforcement only while inserting the parentless row.
      db.exec("PRAGMA foreign_keys = OFF");
      db.prepare(
        "INSERT INTO timesheet_periods(employee_id, month, status) VALUES (?, ?, 'open')",
      ).run(1, "2099-01");
      db.exec("PRAGMA foreign_keys = ON");
      db.prepare(
        `INSERT INTO timesheet_periods(employee_id, month, status, lock_token)
         VALUES (?, ?, 'locking', ?)
         ON CONFLICT(employee_id, month) DO UPDATE SET
           status=excluded.status,
           lock_token=excluded.lock_token`,
      ).run(1, "2099-01", "migration-runtime-test-token");
      assert.equal(
        db
          .prepare(
            "SELECT status, lock_token FROM timesheet_periods WHERE employee_id=1 AND month='2099-01'",
          )
          .get().status,
        "locking",
      );
      db.prepare(
        "DELETE FROM timesheet_periods WHERE employee_id=1 AND month='2099-01'",
      ).run();
    }
  } finally {
    runtime.close();
    sites.close();
  }
});

test("inventory migration preserves legacy balances and enforces atomic stock and count rules", async () => {
  const db = await databaseFromMigrationsBefore("migrations", 68);
  try {
    db.exec("PRAGMA foreign_keys = ON;");
    const legacyItemId = db
      .prepare(
        "INSERT INTO office_inventory_items(kind,name,sku,category,quantity,minimum_quantity,storage_location,note) VALUES('merchandise','Synthetic legacy hoodie','LEGACY-QA-1','Synthetic sport',5,2,'QA Store','Synthetic migration fixture')",
      )
      .run().lastInsertRowid;
    db.prepare(
      "INSERT INTO office_inventory_movements(item_id,quantity_before,quantity_after,reason,note,actor_email) VALUES(?,0,5,'initial_stock','Synthetic original balance','qa@example.test')",
    ).run(legacyItemId);

    db.exec(
      await readFile(
        new URL("migrations/0068_inventory_management.sql", root),
        "utf8",
      ),
    );
    for (const migration of [
      "migrations/0069_view_as_employee.sql",
      "migrations/0070_hr_1on1_inventory_v2.sql",
    ]) {
      db.exec(await readFile(new URL(migration, root), "utf8"));
    }
    const correctionHistoryQuery = buildInventoryCorrectionHistoryQuery({
      type: "item",
      id: Number(legacyItemId),
    });
    assert.doesNotThrow(
      () =>
        db
          .prepare(correctionHistoryQuery.sql)
          .all(...correctionHistoryQuery.values),
      "correction history SQL remains unambiguous with actor joins",
    );
    assert.equal(
      db
        .prepare("PRAGMA table_info(inventory_count_lines)")
        .all()
        .find((column) => column.name === "count_id").type,
      "TEXT",
      "count line references the UUID-like text count identifier without coercion",
    );
    assert.equal(
      db
        .prepare(
          "SELECT quantity FROM inventory_item_stocks WHERE item_id=(SELECT id FROM inventory_items WHERE legacy_item_id=?)",
        )
        .get(legacyItemId).quantity,
      5,
      "legacy balance is preserved without replaying old movements",
    );
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) count FROM inventory_stock_movements WHERE legacy_movement_id IS NOT NULL",
        )
        .get().count,
      1,
      "legacy movement history is retained as an immutable record",
    );
    assert.equal(
      db
        .prepare(
          "INSERT INTO access_policies(role,label) VALUES('hr_admin','Synthetic HR Admin')",
        )
        .run().changes,
      1,
    );
    assert.equal(
      db
        .prepare(
          "SELECT manage_inventory FROM access_policies WHERE role='hr_admin'",
        )
        .get().manage_inventory,
      0,
      "the new manager permission is least-privilege by default",
    );

    const actor = "qa@example.test";
    const categoryId = db
      .prepare(
        "INSERT INTO inventory_categories(name,created_by_email,updated_by_email) VALUES('QA category',?,?)",
      )
      .run(actor, actor).lastInsertRowid;
    const locationA = db
      .prepare(
        "INSERT INTO inventory_storage_locations(name,created_by_email,updated_by_email) VALUES('QA room A',?,?)",
      )
      .run(actor, actor).lastInsertRowid;
    const locationB = db
      .prepare(
        "INSERT INTO inventory_storage_locations(name,created_by_email,updated_by_email) VALUES('QA room B',?,?)",
      )
      .run(actor, actor).lastInsertRowid;
    const groupId = db
      .prepare(
        "INSERT INTO inventory_groups(category_id,name,created_by_email,updated_by_email) VALUES(?,'QA group',?,?)",
      )
      .run(categoryId, actor, actor).lastInsertRowid;
    const itemId = db
      .prepare(
        "INSERT INTO inventory_items(group_id,sku,name,created_by_email,updated_by_email) VALUES(?,'QA-ITEM-1','Synthetic countable item',?,?)",
      )
      .run(groupId, actor, actor).lastInsertRowid;
    db.prepare(
      "INSERT INTO inventory_item_stocks(item_id,location_id) VALUES(?,?),(?,?)",
    ).run(itemId, locationA, itemId, locationB);

    db.prepare(
      "INSERT INTO inventory_operations(request_id,operation_type,item_id,source_location_id,quantity_delta,expected_source_version,reason,actor_email) VALUES('qa-receipt','receipt',?,?,8,0,'Synthetic receipt',?)",
    ).run(itemId, locationA, actor);
    db.prepare(
      "INSERT INTO inventory_operations(request_id,operation_type,item_id,source_location_id,destination_location_id,quantity_delta,expected_source_version,expected_destination_version,reason,actor_email) VALUES('qa-transfer','transfer',?,?,?,3,1,0,'Synthetic transfer',?)",
    ).run(itemId, locationA, locationB, actor);
    assert.deepEqual(
      db
        .prepare(
          "SELECT location_id,quantity FROM inventory_item_stocks WHERE item_id=? ORDER BY location_id",
        )
        .all(itemId)
        .map((row) => ({ ...row })),
      [
        { location_id: locationA, quantity: 5 },
        { location_id: locationB, quantity: 3 },
      ],
    );
    assert.equal(
      db
        .prepare(
          "SELECT SUM(quantity) total FROM inventory_item_stocks WHERE item_id=?",
        )
        .get(itemId).total,
      8,
    );
    assert.throws(
      () =>
        db
          .prepare("UPDATE inventory_items SET unit='уп.' WHERE id=?")
          .run(itemId),
      /unit cannot change/i,
      "a unit cannot change after immutable stock history exists",
    );
    assert.throws(
      () =>
        db
          .prepare(
            "INSERT INTO inventory_operations(request_id,operation_type,item_id,source_location_id,destination_location_id,quantity_delta,expected_source_version,expected_destination_version,reason,actor_email) VALUES('qa-transfer-too-large','transfer',?,?,?,6,2,1,'Synthetic insufficient transfer',?)",
          )
          .run(itemId, locationA, locationB, actor),
      /insufficient|stale/i,
    );
    assert.equal(
      db
        .prepare(
          "SELECT quantity FROM inventory_item_stocks WHERE item_id=? AND location_id=?",
        )
        .get(itemId, locationA).quantity,
      5,
    );

    const transferMoves = db
      .prepare(
        "SELECT movement.id,movement.location_id,movement.quantity_after FROM inventory_stock_movements movement JOIN inventory_operations operation ON operation.id=movement.operation_id WHERE operation.request_id='qa-transfer' ORDER BY movement.location_id",
      )
      .all();
    const transferCorrectionId = db
      .prepare(
        "INSERT INTO inventory_corrections(request_id,movement_id,previous_value,corrected_value,reason,actor_email) VALUES('qa-transfer-correction',?,?,6,'Synthetic paired transfer correction',?)",
      )
      .run(
        transferMoves[0].id,
        transferMoves[0].quantity_after,
        actor,
      ).lastInsertRowid;
    db.exec("BEGIN");
    try {
      db.prepare(
        "INSERT INTO inventory_operations(request_id,operation_type,item_id,source_location_id,quantity_delta,expected_source_version,correction_id,reason,actor_email) VALUES('qa-transfer-correction-source','historical_correction',?,?,1,2,?,'Synthetic paired correction',?)",
      ).run(itemId, locationA, transferCorrectionId, actor);
      db.prepare(
        "INSERT INTO inventory_operations(request_id,operation_type,item_id,source_location_id,quantity_delta,expected_source_version,correction_id,reason,actor_email) VALUES('qa-transfer-correction-destination','historical_correction',?,?, -1,1,?,'Synthetic paired correction',?)",
      ).run(itemId, locationB, transferCorrectionId, actor);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    assert.equal(
      db
        .prepare(
          "SELECT SUM(quantity) total FROM inventory_item_stocks WHERE item_id=?",
        )
        .get(itemId).total,
      8,
      "transfer correction preserves aggregate stock",
    );
    assert.deepEqual(
      db
        .prepare(
          "SELECT quantity_after FROM inventory_stock_movements WHERE id IN (?,?) ORDER BY location_id",
        )
        .all(transferMoves[0].id, transferMoves[1].id)
        .map((row) => row.quantity_after),
      [5, 3],
      "paired correction leaves both original transfer legs immutable",
    );

    db.prepare(
      "INSERT INTO inventory_counts(id,location_id,count_date,location_version_snapshot,created_by_email) SELECT 'qa-count-1',id,'2026-10-27',inventory_version,? FROM inventory_storage_locations WHERE id=?",
    ).run(actor, locationA);
    db.prepare(
      "INSERT INTO inventory_count_lines(count_id,item_id,expected_quantity,expected_stock_version) SELECT 'qa-count-1',item_id,quantity,version FROM inventory_item_stocks WHERE item_id=? AND location_id=?",
    ).run(itemId, locationA);
    db.prepare(
      "UPDATE inventory_count_lines SET counted_quantity=0 WHERE count_id='qa-count-1' AND item_id=?",
    ).run(itemId);
    assert.equal(
      db
        .prepare(
          "SELECT counted_quantity FROM inventory_count_lines WHERE count_id='qa-count-1' AND item_id=?",
        )
        .get(itemId).counted_quantity,
      0,
      "an explicitly entered zero remains different from an uncounted line",
    );
    db.prepare(
      "UPDATE inventory_count_lines SET counted_quantity=NULL WHERE count_id='qa-count-1' AND item_id=?",
    ).run(itemId);
    assert.equal(
      db
        .prepare(
          "SELECT counted_quantity FROM inventory_count_lines WHERE count_id='qa-count-1' AND item_id=?",
        )
        .get(itemId).counted_quantity,
      null,
    );
    assert.throws(
      () =>
        db
          .prepare(
            "UPDATE inventory_counts SET status='finalized',finalized_by_email=?,finalized_at='2026-10-27T10:00:00Z' WHERE id='qa-count-1'",
          )
          .run(actor),
      /all inventory count quantities must be entered/i,
    );
    assert.equal(
      db
        .prepare("SELECT status FROM inventory_counts WHERE id='qa-count-1'")
        .get().status,
      "draft",
      "an incomplete count cannot be finalized",
    );
    db.prepare(
      "UPDATE inventory_count_lines SET counted_quantity=5 WHERE count_id='qa-count-1' AND item_id=?",
    ).run(itemId);
    db.prepare(
      "UPDATE inventory_counts SET status='finalized',finalized_by_email=?,finalized_at='2026-10-27T10:00:00Z' WHERE id='qa-count-1'",
    ).run(actor);
    assert.equal(
      db
        .prepare(
          "SELECT quantity FROM inventory_item_stocks WHERE item_id=? AND location_id=?",
        )
        .get(itemId, locationA).quantity,
      5,
    );
    const movementCountAfterFinalize = db
      .prepare(
        "SELECT COUNT(*) count FROM inventory_stock_movements WHERE item_id=?",
      )
      .get(itemId).count;
    assert.equal(
      db
        .prepare(
          "UPDATE inventory_counts SET status='finalized' WHERE id='qa-count-1' AND status='draft'",
        )
        .run().changes,
      0,
    );
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) count FROM inventory_stock_movements WHERE item_id=?",
        )
        .get(itemId).count,
      movementCountAfterFinalize,
      "replayed finalization does not apply the count twice",
    );
    assert.throws(
      () =>
        db
          .prepare(
            "UPDATE inventory_count_lines SET counted_quantity=1 WHERE count_id='qa-count-1'",
          )
          .run(),
      /immutable/i,
    );

    db.prepare(
      "INSERT INTO inventory_counts(id,location_id,count_date,location_version_snapshot,created_by_email) SELECT 'qa-count-stale',id,'2026-10-27',inventory_version,? FROM inventory_storage_locations WHERE id=?",
    ).run(actor, locationA);
    db.prepare(
      "INSERT INTO inventory_count_lines(count_id,item_id,expected_quantity,expected_stock_version) SELECT 'qa-count-stale',item_id,quantity,version FROM inventory_item_stocks WHERE item_id=? AND location_id=?",
    ).run(itemId, locationA);
    db.prepare(
      "UPDATE inventory_count_lines SET counted_quantity=5 WHERE count_id='qa-count-stale'",
    ).run();
    db.prepare(
      "INSERT INTO inventory_operations(request_id,operation_type,item_id,source_location_id,quantity_delta,expected_source_version,reason,actor_email) SELECT 'qa-receipt-after-snapshot','receipt',item_id,location_id,1,version,'Synthetic intervening receipt',? FROM inventory_item_stocks WHERE item_id=? AND location_id=?",
    ).run(actor, itemId, locationA);
    assert.throws(
      () =>
        db
          .prepare(
            "UPDATE inventory_counts SET status='finalized',finalized_by_email=?,finalized_at=CURRENT_TIMESTAMP WHERE id='qa-count-stale'",
          )
          .run(actor),
      /stale/i,
    );
    assert.equal(
      db
        .prepare(
          "SELECT status FROM inventory_counts WHERE id='qa-count-stale'",
        )
        .get().status,
      "draft",
    );

    const receiptMovement = db
      .prepare(
        "SELECT movement.id,movement.quantity_after FROM inventory_stock_movements movement JOIN inventory_operations operation ON operation.id=movement.operation_id WHERE operation.request_id='qa-receipt'",
      )
      .get();
    const correctionId = db
      .prepare(
        "INSERT INTO inventory_corrections(request_id,movement_id,previous_value,corrected_value,reason,actor_email) VALUES('qa-correction',?,?,9,'Synthetic correction',?)",
      )
      .run(
        receiptMovement.id,
        receiptMovement.quantity_after,
        actor,
      ).lastInsertRowid;
    const currentStock = db
      .prepare(
        "SELECT version FROM inventory_item_stocks WHERE item_id=? AND location_id=?",
      )
      .get(itemId, locationA);
    db.prepare(
      "INSERT INTO inventory_operations(request_id,operation_type,item_id,source_location_id,quantity_delta,expected_source_version,correction_id,reason,actor_email) VALUES('qa-correction-op','historical_correction',?,?,1,?,?,'Synthetic compensating correction',?)",
    ).run(itemId, locationA, currentStock.version, correctionId, actor);
    assert.equal(
      db
        .prepare(
          "SELECT quantity FROM inventory_item_stocks WHERE item_id=? AND location_id=?",
        )
        .get(itemId, locationA).quantity,
      7,
    );
    assert.equal(
      db
        .prepare(
          "SELECT quantity_after FROM inventory_stock_movements WHERE id=?",
        )
        .get(receiptMovement.id).quantity_after,
      8,
      "the original movement is never rewritten",
    );
    assert.throws(
      () =>
        db
          .prepare(
            "UPDATE inventory_stock_movements SET reason='rewritten' WHERE id=?",
          )
          .run(receiptMovement.id),
      /immutable/i,
    );
    const archivedLocation = db
      .prepare(
        "INSERT INTO inventory_storage_locations(name,created_by_email,updated_by_email) VALUES('QA archived room',?,?)",
      )
      .run(actor, actor).lastInsertRowid;
    db.prepare(
      "INSERT INTO inventory_item_stocks(item_id,location_id,quantity,minimum_quantity) VALUES(?,?,0,0)",
    ).run(itemId, archivedLocation);
    db.prepare(
      "INSERT INTO inventory_counts(id,location_id,count_date,location_version_snapshot,created_by_email) SELECT 'qa-archived-count',id,'2026-10-27',inventory_version,? FROM inventory_storage_locations WHERE id=?",
    ).run(actor, archivedLocation);
    db.prepare(
      "INSERT INTO inventory_count_lines(count_id,item_id,expected_quantity,expected_stock_version,counted_quantity) VALUES('qa-archived-count',?,0,0,0)",
    ).run(itemId);
    db.prepare(
      "UPDATE inventory_storage_locations SET active=0 WHERE id=?",
    ).run(archivedLocation);
    assert.throws(
      () =>
        db
          .prepare(
            "UPDATE inventory_counts SET status='finalized',finalized_by_email=?,finalized_at=CURRENT_TIMESTAMP WHERE id='qa-archived-count'",
          )
          .run(actor),
      /active|stale/i,
      "an archived or stale location count cannot be finalized",
    );
    assert.equal(
      db
        .prepare(
          "SELECT status FROM inventory_counts WHERE id='qa-archived-count'",
        )
        .get().status,
      "draft",
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) count FROM pragma_foreign_key_check").get()
        .count,
      0,
    );
  } finally {
    db.close();
  }
});

test("employee preview migration is session-bound, expires invalid identity links and keeps audit append-only", async () => {
  const db = await databaseFromMigrationsBefore("migrations", 69);
  try {
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec(
      await readFile(
        new URL("migrations/0069_view_as_employee.sql", root),
        "utf8",
      ),
    );
    const actorEmployeeId = Number(
      db
        .prepare(
          `INSERT INTO employees(
             first_name,last_name,email,job_title,department,start_date,
             division,division_unit_id,department_unit_id,team,team_unit_id,
             position_value_id,level,level_value_id,employment_type,employment_type_id,location
           )
           SELECT 'Synthetic','Admin','preview-admin@example.test',job_title,department,'2026-01-01',
                  division,division_unit_id,department_unit_id,team,team_unit_id,
                  position_value_id,level,level_value_id,employment_type,employment_type_id,location
             FROM employees WHERE id=1`,
        )
        .run().lastInsertRowid,
    );
    const actorUserId = Number(
      db
        .prepare(
          "INSERT INTO users(email,role,employee_id) VALUES('preview-admin@example.test','super_admin',?)",
        )
        .run(actorEmployeeId).lastInsertRowid,
    );
    const targetEmployeeId = Number(
      db
        .prepare(
          `INSERT INTO employees(
             first_name,last_name,email,job_title,department,start_date,status,
             division,division_unit_id,department_unit_id,team,team_unit_id,
             position_value_id,level,level_value_id,employment_type,employment_type_id,location
           )
           SELECT 'Synthetic','Viewer','preview-viewer@example.test',job_title,department,'2026-01-01','active',
                  division,division_unit_id,department_unit_id,team,team_unit_id,
                  position_value_id,level,level_value_id,employment_type,employment_type_id,location
             FROM employees WHERE id=1`,
        )
        .run().lastInsertRowid,
    );
    const targetUserId = Number(
      db
        .prepare(
          "INSERT INTO users(email,role,employee_id) VALUES('preview-viewer@example.test','employee',?)",
        )
        .run(targetEmployeeId).lastInsertRowid,
    );
    const sessionId = "synthetic-admin-web-session";
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.prepare(
      `INSERT INTO web_sessions(id,user_id,provider_subject,expires_at)
       VALUES(?,?,?,?)`,
    ).run(sessionId, actorUserId, "synthetic-google-subject", expiresAt);
    db.prepare(
      `INSERT INTO employee_view_previews
       (id,actor_user_id,actor_web_session_id,target_user_id,target_employee_id,status,started_at,expires_at,return_path)
       VALUES(?,?, ?, ?, ?, 'active', ?, ?, ?)`,
    ).run(
      "synthetic-preview",
      actorUserId,
      sessionId,
      targetUserId,
      targetEmployeeId,
      now,
      new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      `/employees/${targetEmployeeId}`,
    );

    const d1 = asD1(db);
    const active = await resolvePreviewSession(d1, actorUserId, sessionId);
    assert.equal(active?.state, "active");
    assert.equal(active?.actorUserId, actorUserId);
    assert.equal(active?.targetUserId, targetUserId);
    assert.equal(
      await resolvePreviewSession(d1, actorUserId, "another-session"),
      null,
      "preview cannot be reused outside the original web session",
    );

    const secondSessionId = "synthetic-admin-web-session-2";
    db.prepare(
      `INSERT INTO web_sessions(id,user_id,provider_subject,expires_at)
       VALUES(?,?,?,?)`,
    ).run(
      secondSessionId,
      actorUserId,
      "synthetic-google-subject-2",
      expiresAt,
    );
    db.prepare(
      `INSERT INTO employee_view_previews
       (id,actor_user_id,actor_web_session_id,target_user_id,target_employee_id,status,started_at,expires_at,return_path)
       VALUES(?,?, ?, ?, ?, 'active', ?, ?, ?)`,
    ).run(
      "synthetic-preview-ambiguous",
      actorUserId,
      secondSessionId,
      targetUserId,
      targetEmployeeId,
      new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      `/employees/${targetEmployeeId}`,
    );
    const ambiguous = await resolvePreviewSession(
      d1,
      actorUserId,
      secondSessionId,
    );
    assert.equal(ambiguous?.state, "expired");
    assert.equal(
      db
        .prepare(
          "SELECT status FROM employee_view_previews WHERE id = 'synthetic-preview-ambiguous'",
        )
        .get().status,
      "expired",
      "an expired preview is invalidated and audited",
    );

    db.prepare("UPDATE users SET employee_id = NULL WHERE id = ?").run(
      targetUserId,
    );
    const invalidLink = await resolvePreviewSession(d1, actorUserId, sessionId);
    assert.equal(invalidLink?.state, "expired");
    assert.equal(
      db
        .prepare("SELECT status FROM employee_view_previews WHERE id = ?")
        .get("synthetic-preview").status,
      "expired",
    );
    assert.equal(
      db
        .prepare(
          "SELECT count(*) AS count FROM employee_view_preview_audit WHERE event_type='preview_expired'",
        )
        .get().count,
      2,
      "invalid account/employee linkage expires the preview and is audited",
    );
    db.prepare("DELETE FROM web_sessions WHERE id = ?").run(secondSessionId);
    assert.equal(
      db
        .prepare(
          "SELECT preview_id FROM employee_view_preview_audit WHERE event_key = 'preview_expired:synthetic-preview-ambiguous'",
        )
        .get().preview_id,
      "synthetic-preview-ambiguous",
      "session cleanup can cascade preview state without deleting its audit record",
    );
    assert.throws(
      () =>
        db
          .prepare(
            "UPDATE employee_view_preview_audit SET created_at=? WHERE event_type='preview_expired'",
          )
          .run(now),
      /append-only/,
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

test("preview commands enforce actor and target eligibility, preserve the admin session, and audit exit", async () => {
  const db = await databaseFromMigrationsBefore("migrations", 69);
  try {
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec(
      await readFile(
        new URL("migrations/0069_view_as_employee.sql", root),
        "utf8",
      ),
    );
    const actorEmployeeId = Number(
      db
        .prepare(
          `INSERT INTO employees(
             first_name,last_name,email,job_title,department,start_date,
             division,division_unit_id,department_unit_id,team,team_unit_id,
             position_value_id,level,level_value_id,employment_type,employment_type_id,location
           )
           SELECT 'Synthetic','Admin','preview-admin@example.test',job_title,department,'2026-01-01',
                  division,division_unit_id,department_unit_id,team,team_unit_id,
                  position_value_id,level,level_value_id,employment_type,employment_type_id,location
             FROM employees WHERE id=1`,
        )
        .run().lastInsertRowid,
    );
    const actorUserId = Number(
      db
        .prepare(
          "INSERT INTO users(email,role,employee_id) VALUES('preview-admin@example.test','super_admin',?)",
        )
        .run(actorEmployeeId).lastInsertRowid,
    );
    const targetEmployeeId = Number(
      db
        .prepare(
          `INSERT INTO employees(
             first_name,last_name,email,job_title,department,start_date,status,
             division,division_unit_id,department_unit_id,team,team_unit_id,
             position_value_id,level,level_value_id,employment_type,employment_type_id,location
           )
           SELECT 'Synthetic','Viewer','preview-viewer@example.test',job_title,department,'2026-01-01','active',
                  division,division_unit_id,department_unit_id,team,team_unit_id,
                  position_value_id,level,level_value_id,employment_type,employment_type_id,location
             FROM employees WHERE id=1`,
        )
        .run().lastInsertRowid,
    );
    const targetUserId = Number(
      db
        .prepare(
          "INSERT INTO users(email,role,employee_id) VALUES(' Preview-Viewer@Example.Test ','employee',?)",
        )
        .run(targetEmployeeId).lastInsertRowid,
    );
    const sessionId = "synthetic-command-admin-session";
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO web_sessions(id,user_id,provider_subject,expires_at)
       VALUES(?,?,?,?)`,
    ).run(
      sessionId,
      actorUserId,
      "synthetic-google-subject",
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    );

    const d1 = asD1(db);
    const actor = { userId: actorUserId, role: "super_admin" };
    const started = await createEmployeePreview(d1, {
      actor,
      sessionId,
      employeeId: targetEmployeeId,
    });
    assert.equal(started.targetName, "Synthetic Viewer");
    assert.equal(started.returnPath, `/employees/${targetEmployeeId}`);
    assert.ok(Date.parse(started.expiresAt) - Date.now() <= 15 * 60 * 1000);
    const active = await resolvePreviewSession(d1, actorUserId, sessionId);
    assert.equal(active?.actorUserId, actorUserId);
    assert.equal(active?.targetUserId, targetUserId);
    assert.equal(active?.targetEmployeeId, targetEmployeeId);
    assert.equal(
      db.prepare("SELECT user_id FROM web_sessions WHERE id = ?").get(sessionId)
        .user_id,
      actorUserId,
      "preview keeps the original Super Admin session identity intact",
    );
    await assert.rejects(
      createEmployeePreview(d1, {
        actor: { userId: actorUserId, role: "hr_admin" },
        sessionId,
        employeeId: targetEmployeeId,
      }),
      (error) => error instanceof PreviewCommandError && error.status === 403,
    );

    const exit = await endEmployeePreview(d1, { actorUserId, sessionId });
    assert.equal(exit.returnPath, `/employees/${targetEmployeeId}`);
    assert.equal(await resolvePreviewSession(d1, actorUserId, sessionId), null);
    assert.equal(
      db
        .prepare(
          "SELECT count(*) AS count FROM employee_view_preview_audit WHERE event_type IN ('preview_started','preview_ended')",
        )
        .get().count,
      2,
      "start and exit are recorded as distinct lifecycle events",
    );

    const expectIneligible = async (employeeId = targetEmployeeId) => {
      await assert.rejects(
        createEmployeePreview(d1, { actor, sessionId, employeeId }),
        (error) => error instanceof PreviewCommandError && error.status === 404,
      );
    };
    db.prepare("UPDATE users SET enabled = 0 WHERE id = ?").run(targetUserId);
    await expectIneligible();
    db.prepare("UPDATE users SET enabled = 1 WHERE id = ?").run(targetUserId);

    db.prepare("UPDATE employees SET status = 'inactive' WHERE id = ?").run(
      targetEmployeeId,
    );
    await expectIneligible();
    db.prepare("UPDATE employees SET status = 'active' WHERE id = ?").run(
      targetEmployeeId,
    );

    db.prepare("UPDATE users SET role = 'super_admin' WHERE id = ?").run(
      targetUserId,
    );
    await expectIneligible();
    db.prepare("UPDATE users SET role = 'employee' WHERE id = ?").run(
      targetUserId,
    );

    db.prepare(
      "INSERT INTO protected_admin_accounts(user_id,granted_by_user_id) VALUES(?,?)",
    ).run(targetUserId, actorUserId);
    await expectIneligible();
    db.prepare("DELETE FROM protected_admin_accounts WHERE user_id = ?").run(
      targetUserId,
    );

    db.prepare(
      "UPDATE users SET email = 'other@example.test' WHERE id = ?",
    ).run(targetUserId);
    await expectIneligible();
    db.prepare(
      "UPDATE users SET email = ' Preview-Viewer@Example.Test ' WHERE id = ?",
    ).run(targetUserId);
    await expectIneligible(999999);

    db.prepare("UPDATE users SET role = 'hr_admin' WHERE id = ?").run(
      actorUserId,
    );
    await assert.rejects(
      createEmployeePreview(d1, {
        actor,
        sessionId,
        employeeId: targetEmployeeId,
      }),
      (error) => error instanceof PreviewCommandError && error.status === 403,
      "database role is rechecked instead of trusting the request context",
    );
    db.prepare("UPDATE users SET role = 'super_admin' WHERE id = ?").run(
      actorUserId,
    );
    db.prepare("UPDATE web_sessions SET revoked_at = ? WHERE id = ?").run(
      now,
      sessionId,
    );
    await assert.rejects(
      createEmployeePreview(d1, {
        actor,
        sessionId,
        employeeId: targetEmployeeId,
      }),
      (error) => error instanceof PreviewCommandError && error.status === 403,
      "revoked admin sessions cannot start a preview",
    );

    assert.equal(
      db
        .prepare(
          "SELECT count(*) AS count FROM employee_view_preview_audit WHERE event_type = 'unauthorized_preview_attempt'",
        )
        .get().count,
      9,
      "denied starts are audited without creating preview sessions",
    );
    assert.equal(
      db.prepare("SELECT count(*) AS count FROM employee_view_previews").get()
        .count,
      1,
      "rejected targets never create preview contexts",
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

test("system data integrity is enforced below every API write path", async () => {
  const db = await databaseFromHistory("migrations");
  try {
    assert.equal(
      db.prepare("SELECT count(*) count FROM pragma_foreign_key_check").get()
        .count,
      0,
    );
    assert.equal(
      db
        .prepare(
          "SELECT count(*) count FROM employees WHERE division_unit_id IS NULL OR department_unit_id IS NULL OR position_value_id IS NULL OR employment_type_id IS NULL",
        )
        .get().count,
      0,
    );
    assert.throws(
      () =>
        db
          .prepare("UPDATE employees SET department='Unmanaged' WHERE id=1")
          .run(),
      /invalid department reference/,
    );
    assert.throws(
      () =>
        db
          .prepare(
            "UPDATE employees SET employment_type='Unmanaged' WHERE id=1",
          )
          .run(),
      /invalid employment type reference/,
    );
    assert.throws(
      () => db.prepare("UPDATE employees SET manager_id=1 WHERE id=1").run(),
      /cannot manage themselves/,
    );
    assert.throws(
      () =>
        db
          .prepare(
            "INSERT INTO users(email,role,employee_id) VALUES('duplicate@example.com','employee',1)",
          )
          .run(),
      /UNIQUE constraint failed/,
    );

    db.exec(
      "INSERT INTO leave_types(code,name,color,default_allowance,requires_approval) VALUES('vacation-integrity','Vacation','#ffd400',14,1)",
    );
    const leaveTypeId = db
      .prepare("SELECT id FROM leave_types WHERE code='vacation-integrity'")
      .get().id;
    db.prepare(
      "INSERT INTO leave_balances(employee_id,leave_type_id,year,allowance,used,adjustment) VALUES(1,?,2026,14,0,0)",
    ).run(leaveTypeId);
    assert.throws(
      () =>
        db
          .prepare(
            "INSERT INTO leave_requests(employee_id,leave_type_id,start_date,end_date,days,status) VALUES(1,?,'2026-09-01','2026-09-01',0.25,'pending')",
          )
          .run(leaveTypeId),
      /half-day increments/,
    );
    const request = db
      .prepare(
        "INSERT INTO leave_requests(employee_id,leave_type_id,start_date,end_date,days,status) VALUES(1,?,'2026-09-01','2026-09-01',0.5,'pending') RETURNING id",
      )
      .get(leaveTypeId);
    assert.throws(
      () =>
        db
          .prepare(
            "INSERT INTO leave_requests(employee_id,leave_type_id,start_date,end_date,days,status) VALUES(1,?,'2026-09-01','2026-09-02',2,'pending')",
          )
          .run(leaveTypeId),
      /overlaps/,
    );
    db.prepare("UPDATE leave_requests SET status='approved' WHERE id=?").run(
      request.id,
    );
    assert.equal(
      db
        .prepare(
          "SELECT used FROM leave_balances WHERE employee_id=1 AND leave_type_id=? AND year=2026",
        )
        .get(leaveTypeId).used,
      0.5,
    );
    db.prepare("UPDATE leave_requests SET status='withdrawn' WHERE id=?").run(
      request.id,
    );
    assert.equal(
      db
        .prepare(
          "SELECT used FROM leave_balances WHERE employee_id=1 AND leave_type_id=? AND year=2026",
        )
        .get(leaveTypeId).used,
      0,
    );
    assert.deepEqual(
      db
        .prepare(
          "SELECT event_type,delta FROM leave_ledger WHERE source_request_id=? ORDER BY id",
        )
        .all(request.id)
        .map(({ event_type, delta }) => ({ event_type, delta })),
      [
        { event_type: "request_approved", delta: 0.5 },
        { event_type: "request_withdrawn", delta: -0.5 },
      ],
    );
  } finally {
    db.close();
  }
});

test("rebuilds the demo database from the complete migration history", async () => {
  const db = await databaseFromHistory("migrations");
  try {
    const seed = await readFile(new URL("db/demo-seed.sql", root), "utf8");
    db.exec(seed);
    // A second run is the same operation used by a developer refreshing a
    // local demo. It must remain idempotent and must not violate integrity
    // triggers introduced by later migrations.
    db.exec(seed);

    assert.ok(
      db.prepare("SELECT count(*) AS count FROM employees").get().count >= 10,
    );
    assert.ok(
      db.prepare("SELECT count(*) AS count FROM users").get().count >= 10,
    );
    assert.ok(
      db.prepare("SELECT count(*) AS count FROM employment_types").get()
        .count >= 2,
    );
    assert.ok(
      db.prepare("SELECT count(*) AS count FROM org_units").get().count >= 12,
    );
    assert.equal(
      db
        .prepare(
          "SELECT count(*) AS count FROM employees WHERE division_unit_id IS NULL OR department_unit_id IS NULL OR position_value_id IS NULL OR employment_type_id IS NULL",
        )
        .get().count,
      0,
    );
    assert.equal(
      db.prepare("SELECT count(*) AS count FROM pragma_foreign_key_check").get()
        .count,
      0,
    );
    assert.deepEqual(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('employment_periods','employee_termination_events') ORDER BY name",
        )
        .all(),
      [],
      "the cancelled numbered-period model is absent from the full migration chain",
    );
    assert.equal(
      db
        .prepare(
          "SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name='inventory_categories'",
        )
        .get().count,
      1,
      "the full migration chain includes the retained inventory migration",
    );
  } finally {
    db.close();
  }
});

test("upgrades a populated time schema without losing dependent rows", async () => {
  const db = await databaseFromMigrationsBefore("migrations", 61);
  try {
    db.exec(`
      INSERT OR IGNORE INTO employment_types(value, label)
      VALUES ('full-time', 'Full-time');
      INSERT OR IGNORE INTO org_units(type, name)
      VALUES ('division', 'Ukraine');
      INSERT OR IGNORE INTO org_units(type, name)
      VALUES ('department', 'Engineering');
      INSERT OR IGNORE INTO reference_values(kind, value, label)
      VALUES ('position', 'qa', 'QA');
    `);
    const employmentTypeId = db
      .prepare("SELECT id FROM employment_types WHERE label='Full-time'")
      .get().id;
    const divisionUnitId = db
      .prepare(
        "SELECT id FROM org_units WHERE type='division' AND name='Ukraine'",
      )
      .get().id;
    const departmentUnitId = db
      .prepare(
        "SELECT id FROM org_units WHERE type='department' AND name='Engineering'",
      )
      .get().id;
    const positionValueId = db
      .prepare(
        "SELECT id FROM reference_values WHERE kind='position' AND label='QA'",
      )
      .get().id;
    db.prepare(
      `INSERT INTO employees(
         first_name, last_name, email, job_title, department, division,
         start_date, employment_type_id, division_unit_id, department_unit_id,
         position_value_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "Upgrade",
      "Fixture",
      "upgrade-fixture@example.com",
      "QA",
      "Engineering",
      "Ukraine",
      "2026-01-01",
      employmentTypeId,
      divisionUnitId,
      departmentUnitId,
      positionValueId,
    );
    const employeeId = db
      .prepare(
        "SELECT id FROM employees WHERE email='upgrade-fixture@example.com'",
      )
      .get().id;
    db.prepare(
      `INSERT INTO timesheet_periods(
         employee_id, month, status, note, locked_by_email, locked_at,
         snapshot_worked_minutes, snapshot_expected_minutes,
         snapshot_overtime_minutes, snapshot_captured_at
       ) VALUES (?, '2026-01', 'locked', ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      employeeId,
      "Populated period",
      "upgrade-fixture@example.com",
      "2026-02-01T00:00:00.000Z",
      480,
      9600,
      0,
      "2026-02-01T00:00:00.000Z",
    );
    db.prepare(
      `INSERT INTO time_entries(employee_id, clock_in, clock_out, source)
       VALUES (?, ?, ?, 'web')`,
    ).run(employeeId, "2026-02-06T07:00:00.000Z", "2026-02-06T15:00:00.000Z");
    const timeEntryId = db
      .prepare("SELECT id FROM time_entries WHERE employee_id=?")
      .get(employeeId).id;
    db.prepare(
      `INSERT INTO break_entries(time_entry_id, started_at, ended_at)
       VALUES (?, ?, ?)`,
    ).run(timeEntryId, "2026-02-06T11:00:00.000Z", "2026-02-06T12:00:00.000Z");
    db.prepare(
      `INSERT INTO time_corrections(
         employee_id, time_entry_id, requested_clock_in,
         requested_clock_out, reason
       ) VALUES (?, ?, ?, ?, ?)`,
    ).run(
      employeeId,
      timeEntryId,
      "2026-02-06T07:00:00.000Z",
      "2026-02-06T15:00:00.000Z",
      "Upgrade fixture",
    );

    db.exec(
      await readFile(
        new URL("migrations/0061_time_entry_source_contract.sql", root),
        "utf8",
      ),
    );
    db.exec(
      await readFile(
        new URL("migrations/0062_file_scan_status.sql", root),
        "utf8",
      ),
    );
    db.exec(
      await readFile(
        new URL("migrations/0063_atomic_timesheet_lock_finalize.sql", root),
        "utf8",
      ),
    );
    db.exec(
      await readFile(
        new URL("migrations/0064_timesheet_locking_status.sql", root),
        "utf8",
      ),
    );

    const technologyValueId = db
      .prepare(
        "INSERT INTO reference_values(kind,value,label) VALUES ('technology','upgrade-tech','Upgrade Tech') RETURNING id",
      )
      .get().id;
    db.prepare(
      `INSERT INTO employee_profile_records(
         employee_id, kind, reference_value_id, title, subtitle, notes
       ) VALUES (?, 'skill', ?, 'Upgrade Tech', '', '')`,
    ).run(employeeId, technologyValueId);
    db.prepare(
      `INSERT INTO employee_profile_records(
         employee_id, kind, title, subtitle, notes, amount_cents, currency
       ) VALUES (?, 'compensation', 'Legacy salary row', '', 'legacy preserved', 1234500, 'USD')`,
    ).run(employeeId);
    db.prepare(
      `INSERT INTO employee_terminations(
         employee_id, last_working_day, termination_type,
         reason_codes_json, rehire_eligible, terminated_by_email
       ) VALUES (?, '2026-02-01', 'resignation', '[]', 0, 'fixture@example.com')`,
    ).run(employeeId);

    const referenceCountBefore = db
      .prepare("SELECT count(*) AS count FROM reference_values")
      .get().count;
    db.exec("BEGIN;");
    db.exec(
      await readFile(
        new URL("migrations/0065_employee_profile_compensation.sql", root),
        "utf8",
      ),
    );
    db.exec("COMMIT;");
    db.exec(
      await readFile(
        new URL("migrations/0066_compensation_attachment_kind.sql", root),
        "utf8",
      ),
    );

    assert.equal(
      db.prepare("SELECT count(*) AS count FROM reference_values").get().count,
      referenceCountBefore,
    );
    assert.equal(
      db
        .prepare(
          "SELECT count(*) AS count FROM employee_profile_records WHERE title='Upgrade Tech'",
        )
        .get().count,
      1,
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.throws(
      () =>
        db
          .prepare(
            "INSERT INTO reference_values(kind,value,label) VALUES ('unknown','invalid','Invalid')",
          )
          .run(),
      /CHECK constraint failed/,
    );
    db.prepare(
      "INSERT INTO reference_values(kind,value,label) VALUES ('legal_entity','incora_ua','INCORA Ukraine')",
    ).run();
    const legalEntityId = db
      .prepare("SELECT id FROM reference_values WHERE kind='legal_entity'")
      .get().id;
    db.prepare(
      `INSERT INTO employee_private_details(employee_id, legal_entity_value_id, updated_by_email)
       VALUES (?, ?, 'fixture@example.com')`,
    ).run(employeeId, legalEntityId);
    assert.throws(
      () =>
        db
          .prepare(
            `INSERT INTO employee_private_details(employee_id, legal_entity_value_id, updated_by_email)
         VALUES (?, ?, 'fixture@example.com')`,
          )
          .run(employeeId, technologyValueId),
      /invalid legal entity reference/,
    );
    assert.throws(
      () =>
        db
          .prepare("UPDATE reference_values SET active=0 WHERE id=?")
          .run(legalEntityId),
      /reference value is assigned to employees/,
    );
    db.prepare(
      `INSERT INTO employee_compensations(
         employee_id, kind, effective_from, amount_cents, currency, period,
         payment_schedule, created_by_email
       ) VALUES (?, 'base', '2026-01-01', 1234500, 'USD', 'month', 'monthly', 'fixture@example.com')`,
    ).run(employeeId);
    const compensationId = db
      .prepare(
        "SELECT id FROM employee_compensations WHERE employee_id=? AND kind='base' AND effective_from='2026-01-01'",
      )
      .get(employeeId).id;
    for (const [id, name] of [
      ["compensation-file-one", "agreement.pdf"],
      ["compensation-file-two", "amendment.pdf"],
    ]) {
      db.prepare(
        "INSERT INTO stored_files(id,kind,category,owner_employee_id,object_key,original_name,content_type,size_bytes,uploaded_by_email,related_entity_type,related_entity_id,visibility,scan_status,scanned_at,scan_provider) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ).run(
        id,
        "compensation_attachment",
        "contract",
        employeeId,
        `compensation_attachment/${employeeId}/${id}`,
        name,
        "application/pdf",
        256,
        "fixture@example.com",
        "employee_compensation",
        String(compensationId),
        "hr_only",
        "clean",
        "2026-09-07T10:00:00.000Z",
        "synthetic-scanner",
      );
    }
    assert.deepEqual(
      db
        .prepare(
          "SELECT original_name FROM stored_files WHERE related_entity_type='employee_compensation' AND related_entity_id=? ORDER BY created_at,id",
        )
        .all(String(compensationId))
        .map((row) => row.original_name),
      ["agreement.pdf", "amendment.pdf"],
    );
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM employee_profile_records WHERE kind='compensation'",
        )
        .get().count,
      1,
    );
    assert.throws(
      () =>
        db
          .prepare(
            `INSERT INTO employee_compensations(
           employee_id, kind, effective_from, amount_cents, currency, period,
           payment_schedule, created_by_email
         ) VALUES (?, 'base', '2026-01-01', 1300000, 'USD', 'month', 'monthly', 'fixture@example.com')`,
          )
          .run(employeeId),
      /UNIQUE constraint failed/,
    );
    assert.equal(
      db
        .prepare(
          "SELECT amount_cents FROM employee_profile_records WHERE kind='compensation'",
        )
        .get().amount_cents,
      1234500,
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);

    assert.equal(
      db.prepare("SELECT count(*) AS count FROM time_entries").get().count,
      1,
    );
    assert.equal(
      db.prepare("SELECT count(*) AS count FROM break_entries").get().count,
      1,
    );
    assert.equal(
      db.prepare("SELECT time_entry_id FROM break_entries").get().time_entry_id,
      timeEntryId,
    );
    assert.equal(
      db.prepare("SELECT count(*) AS count FROM time_corrections").get().count,
      1,
    );
    assert.deepEqual(
      {
        ...db
          .prepare(
            "SELECT employee_id, month, status, note, snapshot_worked_minutes, snapshot_expected_minutes, snapshot_overtime_minutes, lock_token FROM timesheet_periods WHERE employee_id=? AND month='2026-01'",
          )
          .get(employeeId),
      },
      {
        employee_id: employeeId,
        month: "2026-01",
        status: "locked",
        note: "Populated period",
        snapshot_worked_minutes: 480,
        snapshot_expected_minutes: 9600,
        snapshot_overtime_minutes: 0,
        lock_token: null,
      },
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);

    db.prepare(
      `INSERT INTO time_entries(employee_id, clock_in, clock_out, source)
       VALUES (?, ?, ?, 'mobile')`,
    ).run(employeeId, "2026-02-06T16:00:00.000Z", "2026-02-06T17:00:00.000Z");
    assert.throws(
      () =>
        db
          .prepare(
            `INSERT INTO time_entries(employee_id, clock_in, clock_out, source)
             VALUES (?, ?, ?, 'unknown')`,
          )
          .run(
            employeeId,
            "2026-02-06T18:00:00.000Z",
            "2026-02-06T19:00:00.000Z",
          ),
      /CHECK constraint failed/,
    );
  } finally {
    db.close();
  }
});

test("upgrades a populated Sites timesheet and accepts the lock upsert", async () => {
  const db = await databaseFromMigrationsBefore("drizzle", 67);
  try {
    db.exec(`
      INSERT OR IGNORE INTO employment_types(value, label)
      VALUES ('full-time', 'Full-time');
      INSERT OR IGNORE INTO org_units(type, name)
      VALUES ('division', 'Ukraine');
      INSERT OR IGNORE INTO org_units(type, name)
      VALUES ('department', 'Engineering');
      INSERT OR IGNORE INTO reference_values(kind, value, label)
      VALUES ('position', 'qa', 'QA');
    `);
    const employmentTypeId = db
      .prepare("SELECT id FROM employment_types WHERE value='full-time'")
      .get().id;
    const divisionUnitId = db
      .prepare(
        "SELECT id FROM org_units WHERE type='division' AND name='Ukraine'",
      )
      .get().id;
    const departmentUnitId = db
      .prepare(
        "SELECT id FROM org_units WHERE type='department' AND name='Engineering'",
      )
      .get().id;
    const positionValueId = db
      .prepare(
        "SELECT id FROM reference_values WHERE kind='position' AND value='qa'",
      )
      .get().id;
    db.prepare(
      `INSERT INTO employees(
         first_name, last_name, email, job_title, department, location,
         employment_type, status, start_date, division, default_work_mode,
         employment_type_id, division_unit_id, department_unit_id,
         position_value_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "Sites",
      "Fixture",
      "sites-upgrade-fixture@example.test",
      "QA",
      "Engineering",
      "Lviv",
      "Full-time",
      "active",
      "2026-01-01",
      "Ukraine",
      "office",
      employmentTypeId,
      divisionUnitId,
      departmentUnitId,
      positionValueId,
    );
    const employeeId = db
      .prepare(
        "SELECT id FROM employees WHERE email='sites-upgrade-fixture@example.test'",
      )
      .get().id;
    db.prepare(
      `INSERT INTO timesheet_periods(
         employee_id, month, status, note, locked_by_email, locked_at,
         snapshot_worked_minutes, snapshot_expected_minutes,
         snapshot_overtime_minutes, snapshot_captured_at
       ) VALUES (?, '2026-01', 'locked', ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      employeeId,
      "Sites populated period",
      "sites-upgrade-fixture@example.test",
      "2026-02-01T00:00:00.000Z",
      480,
      9600,
      0,
      "2026-02-01T00:00:00.000Z",
    );
    db.prepare(
      `INSERT INTO time_entries(employee_id, clock_in, clock_out, source)
       VALUES (?, ?, ?, 'web')`,
    ).run(employeeId, "2026-01-06T07:00:00.000Z", "2026-01-06T15:00:00.000Z");
    const timeEntryId = db
      .prepare("SELECT id FROM time_entries WHERE employee_id=?")
      .get(employeeId).id;
    db.prepare(
      `INSERT INTO break_entries(time_entry_id, started_at, ended_at)
       VALUES (?, ?, ?)`,
    ).run(timeEntryId, "2026-01-06T11:00:00.000Z", "2026-01-06T12:00:00.000Z");

    db.exec(
      await readFile(
        new URL("drizzle/0067_timesheet_locking_status.sql", root),
        "utf8",
      ),
    );

    assert.equal(
      db
        .prepare(
          "SELECT snapshot_worked_minutes FROM timesheet_periods WHERE employee_id=? AND month='2026-01'",
        )
        .get(employeeId).snapshot_worked_minutes,
      480,
    );
    assert.equal(
      db.prepare("SELECT count(*) AS count FROM time_entries").get().count,
      1,
    );
    assert.equal(
      db.prepare("SELECT count(*) AS count FROM break_entries").get().count,
      1,
    );
    db.prepare(
      `INSERT INTO timesheet_periods(employee_id, month, status, lock_token)
       VALUES (?, ?, 'locking', ?)
       ON CONFLICT(employee_id, month) DO UPDATE SET
         status=excluded.status,
         lock_token=excluded.lock_token`,
    ).run(employeeId, "2026-01", "sites-populated-lock-token");
    assert.deepEqual(
      {
        ...db
          .prepare(
            "SELECT status, lock_token FROM timesheet_periods WHERE employee_id=? AND month='2026-01'",
          )
          .get(employeeId),
      },
      { status: "locking", lock_token: "sites-populated-lock-token" },
    );
    const referenceCountBefore = db
      .prepare("SELECT count(*) AS count FROM reference_values")
      .get().count;
    db.exec("BEGIN;");
    db.exec(
      await readFile(
        new URL("drizzle/0068_employee_profile_compensation.sql", root),
        "utf8",
      ),
    );
    db.exec("COMMIT;");
    assert.equal(
      db.prepare("SELECT count(*) AS count FROM reference_values").get().count,
      referenceCountBefore,
    );
    db.prepare(
      "INSERT INTO reference_values(kind,value,label) VALUES ('legal_entity','sites_incora','INCORA Sites')",
    ).run();
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

test("D1 compensation file migrations preserve populated child foreign keys inside transactions", async () => {
  const migrationCases = [
    ["migrations", 66, "0066_compensation_attachment_kind.sql"],
    ["drizzle", 69, "0069_compensation_attachment_kind.sql"],
  ];
  for (const [directory, maxExclusive, migrationFile] of migrationCases) {
    const db = await databaseFromMigrationsBefore(directory, maxExclusive);
    try {
      db.exec("PRAGMA foreign_keys = ON;");
      assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
      const employee = db
        .prepare("SELECT id FROM employees ORDER BY id LIMIT 1")
        .get();
      assert.ok(employee, `${directory} fixture should have an employee`);
      const fileId = `${directory}-populated-fk-file`;
      const description = `${directory} child should survive stored_files rebuild`;
      db.prepare(
        `INSERT INTO stored_files(
          id, kind, category, owner_employee_id, object_key, original_name,
          content_type, size_bytes, uploaded_by_email
        ) VALUES (?, 'bug_screenshot', 'bug', ?, ?, ?, 'image/png', 1200, ?)`,
      ).run(
        fileId,
        employee.id,
        `bug_screenshot/${employee.id}/${fileId}.png`,
        `${fileId}.png`,
        "migration-fixture@example.test",
      );
      db.prepare(
        `INSERT INTO bug_reports(
          reporter_email, employee_id, description, screenshot_file_id
        ) VALUES (?, ?, ?, ?)`,
      ).run("migration-fixture@example.test", employee.id, description, fileId);

      db.exec("BEGIN;");
      db.exec(
        await readFile(new URL(`${directory}/${migrationFile}`, root), "utf8"),
      );
      db.exec("COMMIT;");

      assert.equal(
        db.prepare("SELECT id FROM stored_files WHERE id=?").get(fileId).id,
        fileId,
      );
      assert.equal(
        db
          .prepare(
            "SELECT screenshot_file_id FROM bug_reports WHERE description=?",
          )
          .get(description).screenshot_file_id,
        fileId,
      );
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
      db.prepare(
        `INSERT INTO stored_files(
          id, kind, category, owner_employee_id, object_key, original_name,
          content_type, size_bytes, uploaded_by_email
        ) VALUES (?, 'compensation_attachment', 'contract', ?, ?, ?,
          'application/pdf', 1200, ?)`,
      ).run(
        `${directory}-compensation-file`,
        employee.id,
        `compensation_attachment/${employee.id}/${directory}-comp.pdf`,
        `${directory}-comp.pdf`,
        "migration-fixture@example.test",
      );
    } finally {
      db.close();
    }
  }
});

test("0071 invitation migration upgrades the 0070 schema without rewriting HR, inventory, or session data", async () => {
  const db = await databaseFromMigrationsBefore("migrations", 71);
  try {
    db.exec("PRAGMA foreign_keys = ON;");
    const employeeId = db
      .prepare(
        `INSERT INTO employees(first_name,last_name,email,job_title,department,division,team,level,location,employment_type,start_date,division_unit_id,department_unit_id,team_unit_id,position_value_id,level_value_id,employment_type_id)
         SELECT 'Synthetic','Invitation','invitation-target@example.test',job_title,department,division,team,level,location,employment_type,'2026-01-01',division_unit_id,department_unit_id,team_unit_id,position_value_id,level_value_id,employment_type_id
           FROM employees ORDER BY id LIMIT 1
         RETURNING id`,
      )
      .get().id;
    const userId = db
      .prepare(
        `INSERT INTO users(email,role,employee_id)
         VALUES ('invitation-target@example.test','manager',?) RETURNING id`,
      )
      .get(employeeId).id;
    db.prepare(
      `INSERT INTO web_sessions(id,user_id,provider_subject,expires_at,created_at,last_used_at)
       VALUES ('synthetic-invitation-session',?,'synthetic-google-subject','2030-01-01T00:00:00.000Z','2026-11-10T10:00:00.000Z','2026-11-10T10:00:00.000Z')`,
    ).run(userId);
    const planId = db
      .prepare(
        `INSERT INTO one_on_one_plans(employee_id,facilitator_email,facilitator_kind,cadence_days,active)
         VALUES (?,'synthetic-hr@example.test','hr',30,1) RETURNING id`,
      )
      .get(employeeId).id;
    db.prepare(
      `INSERT INTO one_on_one_meetings(plan_id,employee_id,facilitator_email,held_at,notes)
       VALUES (?,?,'synthetic-hr@example.test','2026-11-01','synthetic legacy meeting')`,
    ).run(planId, employeeId);

    const categoryId = db
      .prepare(
        `INSERT INTO inventory_categories(name,created_by_email,updated_by_email)
         VALUES ('Invitation migration fixture','synthetic-hr@example.test','synthetic-hr@example.test')
         RETURNING id`,
      )
      .get().id;
    const locationId = db
      .prepare(
        `INSERT INTO inventory_storage_locations(name,created_by_email,updated_by_email)
         VALUES ('Invitation migration fixture location','synthetic-hr@example.test','synthetic-hr@example.test')
         RETURNING id`,
      )
      .get().id;
    const groupId = db
      .prepare(
        `INSERT INTO inventory_groups(category_id,name,default_location_id,created_by_email,updated_by_email)
         VALUES (?,'Fixture group',?,'synthetic-hr@example.test','synthetic-hr@example.test')
         RETURNING id`,
      )
      .get(categoryId, locationId).id;
    const itemId = db
      .prepare(
        `INSERT INTO inventory_items(group_id,sku,name,created_by_email,updated_by_email)
         VALUES (?,'INV-INVITATION-FIXTURE','Fixture item','synthetic-hr@example.test','synthetic-hr@example.test')
         RETURNING id`,
      )
      .get(groupId).id;
    db.prepare(
      `INSERT INTO inventory_item_stocks(item_id,location_id,quantity,minimum_quantity)
       VALUES (?,?,0,2)`,
    ).run(itemId, locationId);
    const operationId = db
      .prepare(
        `INSERT INTO inventory_operations(request_id,operation_type,item_id,source_location_id,quantity_delta,expected_source_version,reason,actor_email)
         VALUES ('synthetic-invitation-operation','receipt',?,?,7,0,'migration fixture','synthetic-hr@example.test')
         RETURNING id`,
      )
      .get(itemId, locationId).id;
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM inventory_stock_movements WHERE operation_id=?",
        )
        .get(operationId).count,
      1,
    );

    const preservedTables = [
      "employees",
      "users",
      "web_sessions",
      "client_sessions",
      "one_on_one_plans",
      "one_on_one_meetings",
      "inventory_items",
      "inventory_item_stocks",
      "inventory_stock_movements",
    ];
    const before = Object.fromEntries(
      preservedTables.map((table) => [
        table,
        db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count,
      ]),
    );

    db.exec(
      await readFile(
        new URL("migrations/0071_employee_invitations.sql", root),
        "utf8",
      ),
    );

    const after = Object.fromEntries(
      preservedTables.map((table) => [
        table,
        db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count,
      ]),
    );
    assert.deepEqual(after, before);
    assert.equal(
      db.prepare("SELECT employee_id FROM users WHERE id=?").get(userId)
        .employee_id,
      employeeId,
    );
    assert.equal(
      db.prepare("SELECT created_at FROM users WHERE id=?").get(userId)
        .created_at,
      null,
      "existing accounts remain unknown rather than receiving a fabricated creation/login date",
    );
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM one_on_one_meetings WHERE employee_id=?",
        )
        .get(employeeId).count,
      1,
    );
    assert.equal(
      db
        .prepare(
          "SELECT quantity FROM inventory_item_stocks WHERE item_id=? AND location_id=?",
        )
        .get(itemId, locationId).quantity,
      7,
    );

    const newEmployeeId = db
      .prepare(
        `INSERT INTO employees(first_name,last_name,email,job_title,department,division,team,level,location,employment_type,start_date,division_unit_id,department_unit_id,team_unit_id,position_value_id,level_value_id,employment_type_id)
         SELECT 'Synthetic','New User','invitation-new@example.test',job_title,department,division,team,level,location,employment_type,'2026-11-10',division_unit_id,department_unit_id,team_unit_id,position_value_id,level_value_id,employment_type_id
           FROM employees WHERE email='invitation-target@example.test'
         RETURNING id`,
      )
      .get().id;
    const newUserId = db
      .prepare(
        `INSERT INTO users(email,role,employee_id)
         VALUES ('invitation-new@example.test','employee',?) RETURNING id`,
      )
      .get(newEmployeeId).id;
    const newUser = db
      .prepare("SELECT id,created_at,last_login_at FROM users WHERE id=?")
      .get(newUserId);
    assert.ok(newUser.created_at);
    assert.equal(newUser.last_login_at, null);

    const now = "2026-11-10T12:00:00.000Z";
    const commandSource = await readFile(
      new URL("modules/invitations/commands.ts", root),
      "utf8",
    );
    const insertStart = commandSource.indexOf(
      "`INSERT INTO employee_invitation_attempts (",
    );
    const insertEnd = commandSource.indexOf("`,", insertStart);
    assert.ok(insertStart >= 0 && insertEnd > insertStart);
    const insertSql = commandSource.slice(insertStart + 1, insertEnd);
    const insertValues = [
      "synthetic-invitation-attempt",
      "invitation-target@example.test",
      JSON.stringify({ to: ["invitation-target@example.test"] }),
      now,
      now,
      userId,
      "synthetic-hr@example.test",
      userId,
      employeeId,
      "invitation-target@example.test",
      "2026-11-10T11:59:00.000Z",
      "2026-11-10T11:00:00.000Z",
      5,
      userId,
      "2026-11-10T11:00:00.000Z",
      30,
    ];
    assert.equal(db.prepare(insertSql).run(...insertValues).changes, 1);
    assert.equal(
      db
        .prepare(insertSql)
        .run("synthetic-duplicate-attempt", ...insertValues.slice(1)).changes,
      0,
      "the same employee cannot acquire a second open or cooldown attempt",
    );
    db.prepare(
      `UPDATE employee_invitation_attempts
          SET status='sent',provider_message_id='synthetic-provider-id',accepted_at=?,updated_at=?
        WHERE id='synthetic-invitation-attempt'`,
    ).run(now, now);
    assert.equal(
      db
        .prepare(
          "SELECT status FROM employee_invitation_attempts WHERE id='synthetic-invitation-attempt'",
        )
        .get().status,
      "sent",
    );
    const { employeeInvitedSql } = await import(
      new URL("modules/people/activation.ts", root)
    );
    const invited = (id) =>
      db
        .prepare(
          `SELECT ${employeeInvitedSql("employees.id")} AS invited FROM employees WHERE id=?`,
        )
        .get(id).invited === 1;
    assert.equal(
      invited(employeeId),
      true,
      "a provider-accepted invitation activates the profile",
    );
    assert.equal(
      invited(newEmployeeId),
      false,
      "a newly added person without an invitation is not active",
    );
    db.prepare("UPDATE users SET last_login_at=? WHERE id=?").run(
      now,
      newUserId,
    );
    assert.equal(
      invited(newEmployeeId),
      false,
      "signing in without an invitation does not activate the profile",
    );
    db.prepare("UPDATE users SET role='super_admin' WHERE id=?").run(newUserId);
    assert.equal(
      invited(newEmployeeId),
      true,
      "a Super Admin cannot be invited and is always active",
    );
    db.prepare("UPDATE users SET role='hr_admin' WHERE id=?").run(newUserId);
    assert.equal(
      invited(newEmployeeId),
      false,
      "an HR administrator still needs an invitation",
    );
    assert.throws(
      () =>
        db
          .prepare(
            "DELETE FROM employee_invitation_attempts WHERE id='synthetic-invitation-attempt'",
          )
          .run(),
      /employee invitation attempts are retained/,
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

async function databaseFromHistory(directory) {
  const relative = new URL(`${directory}/`, root);
  const files = (await readdir(relative))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const db = new DatabaseSync(":memory:");
  for (const file of files) {
    const migration = await readFile(
      new URL(`${directory}/${file}`, root),
      "utf8",
    );
    const needsTransaction =
      file === "0065_employee_profile_compensation.sql" ||
      file === "0068_employee_profile_compensation.sql";
    if (needsTransaction) db.exec("BEGIN;");
    db.exec(migration);
    if (needsTransaction) db.exec("COMMIT;");
  }
  return db;
}

async function databaseFromMigrationsBefore(directory, maxExclusive) {
  const relative = new URL(`${directory}/`, root);
  const files = (await readdir(relative))
    .filter(
      (file) =>
        file.endsWith(".sql") &&
        Number.parseInt(file.slice(0, 4), 10) < maxExclusive,
    )
    .sort();
  const db = new DatabaseSync(":memory:");
  for (const file of files) {
    const needsTransaction =
      (directory === "migrations" &&
        file === "0065_employee_profile_compensation.sql") ||
      (directory === "drizzle" &&
        file === "0068_employee_profile_compensation.sql");
    if (needsTransaction) db.exec("BEGIN;");
    db.exec(await readFile(new URL(`${directory}/${file}`, root), "utf8"));
    if (needsTransaction) db.exec("COMMIT;");
  }
  return db;
}

function asD1(db) {
  return {
    prepare(sql) {
      let values = [];
      const statement = {
        bind(...nextValues) {
          values = nextValues;
          return statement;
        },
        first() {
          return db.prepare(sql).get(...values) ?? null;
        },
        run() {
          const result = db.prepare(sql).run(...values);
          return { meta: { changes: Number(result.changes) } };
        },
      };
      return statement;
    },
    async batch(statements) {
      db.exec("BEGIN;");
      try {
        const results = statements.map((statement) => statement.run());
        db.exec("COMMIT;");
        return results;
      } catch (error) {
        db.exec("ROLLBACK;");
        throw error;
      }
    },
  };
}

function describeSchema(db) {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((row) => row.name);
  return Object.fromEntries(
    tables.map((table) => [
      table,
      db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((column) => ({
          name: column.name,
          type: column.type,
          notnull: column.notnull,
          dflt_value: column.dflt_value,
          pk: column.pk,
        })),
    ]),
  );
}
