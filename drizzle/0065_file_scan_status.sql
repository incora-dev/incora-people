-- Optional R2 malware-scanning lifecycle.
ALTER TABLE `stored_files` ADD COLUMN `scan_status` text NOT NULL DEFAULT 'unscanned'
  CHECK (`scan_status` IN ('unscanned', 'clean', 'quarantined', 'failed'));
ALTER TABLE `stored_files` ADD COLUMN `scanned_at` text;
ALTER TABLE `stored_files` ADD COLUMN `scan_provider` text;
ALTER TABLE `stored_files` ADD COLUMN `scan_error` text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS `stored_files_scan_status_idx`
  ON `stored_files` (`scan_status`, `created_at`);
