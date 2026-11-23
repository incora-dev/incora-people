CREATE TABLE `time_projects` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `code` text NOT NULL UNIQUE,
  `active` integer DEFAULT true NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX `time_projects_active_name_idx` ON `time_projects` (`active`,`name`);
ALTER TABLE `time_entries` ADD COLUMN `project_id` integer REFERENCES `time_projects`(`id`);
