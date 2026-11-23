ALTER TABLE `time_entries`
ADD COLUMN `work_mode` text NOT NULL DEFAULT 'office'
CHECK (`work_mode` IN ('office', 'remote'));
