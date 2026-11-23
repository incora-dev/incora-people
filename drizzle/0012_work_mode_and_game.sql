ALTER TABLE `employees` ADD `default_work_mode` text DEFAULT 'office' NOT NULL;
--> statement-breakpoint
CREATE TABLE `work_mode_entries` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `employee_id` integer NOT NULL,
  `work_date` text NOT NULL,
  `mode` text DEFAULT 'office' NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_mode_entries_employee_date_unique` ON `work_mode_entries` (`employee_id`,`work_date`);
--> statement-breakpoint
CREATE INDEX `work_mode_entries_date_mode_idx` ON `work_mode_entries` (`work_date`,`mode`);
--> statement-breakpoint
CREATE TABLE `game_scores` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `employee_id` integer NOT NULL,
  `user_email` text NOT NULL,
  `best_score` integer DEFAULT 0 NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_scores_employee_id_unique` ON `game_scores` (`employee_id`);
--> statement-breakpoint
CREATE INDEX `game_scores_best_idx` ON `game_scores` (`best_score`);
