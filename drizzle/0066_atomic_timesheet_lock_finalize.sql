-- Sites/Drizzle mirror of migrations/0063_atomic_timesheet_lock_finalize.sql.
ALTER TABLE `timesheet_periods` ADD COLUMN `lock_token` text;
CREATE UNIQUE INDEX IF NOT EXISTS `timesheet_periods_lock_token_unique`
  ON `timesheet_periods` (`lock_token`)
  WHERE `lock_token` IS NOT NULL;
