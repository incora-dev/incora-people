ALTER TABLE `timesheet_periods` ADD COLUMN `snapshot_worked_minutes` integer;
ALTER TABLE `timesheet_periods` ADD COLUMN `snapshot_expected_minutes` integer;
ALTER TABLE `timesheet_periods` ADD COLUMN `snapshot_overtime_minutes` integer;
ALTER TABLE `timesheet_periods` ADD COLUMN `snapshot_captured_at` text;
