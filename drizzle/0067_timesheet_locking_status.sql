-- Sites/Drizzle mirror of migrations/0064_timesheet_locking_status.sql.
PRAGMA foreign_keys = OFF;

CREATE TABLE `timesheet_periods_rebuild` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`month` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL CHECK (`status` IN ('open', 'locking', 'locked', 'approved', 'revision_required')),
	`note` text DEFAULT '' NOT NULL,
	`locked_by_email` text,
	`locked_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`snapshot_worked_minutes` integer,
	`snapshot_expected_minutes` integer,
	`snapshot_overtime_minutes` integer,
	`snapshot_captured_at` text,
	`lock_token` text,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);

INSERT INTO `timesheet_periods_rebuild` (
	`id`, `employee_id`, `month`, `status`, `note`, `locked_by_email`, `locked_at`,
	`updated_at`, `snapshot_worked_minutes`, `snapshot_expected_minutes`,
	`snapshot_overtime_minutes`, `snapshot_captured_at`, `lock_token`
)
SELECT
	`id`, `employee_id`, `month`, `status`, `note`, `locked_by_email`, `locked_at`,
	`updated_at`, `snapshot_worked_minutes`, `snapshot_expected_minutes`,
	`snapshot_overtime_minutes`, `snapshot_captured_at`, `lock_token`
FROM `timesheet_periods`;

DROP TABLE `timesheet_periods`;
ALTER TABLE `timesheet_periods_rebuild` RENAME TO `timesheet_periods`;

CREATE INDEX IF NOT EXISTS `timesheet_periods_month_status_idx`
	ON `timesheet_periods` (`month`, `status`);
CREATE UNIQUE INDEX IF NOT EXISTS `timesheet_periods_employee_month_unique`
	ON `timesheet_periods` (`employee_id`, `month`);
CREATE UNIQUE INDEX IF NOT EXISTS `timesheet_periods_lock_token_unique`
	ON `timesheet_periods` (`lock_token`)
	WHERE `lock_token` IS NOT NULL;

PRAGMA foreign_keys = ON;
