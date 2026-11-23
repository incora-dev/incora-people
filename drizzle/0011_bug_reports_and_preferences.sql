ALTER TABLE `users` ADD `locale` text DEFAULT 'uk' NOT NULL;--> statement-breakpoint
CREATE TABLE `stored_files_next` (
  `id` text PRIMARY KEY NOT NULL,
  `kind` text NOT NULL CHECK (`kind` IN ('employee_document', 'reimbursement_receipt', 'bug_screenshot')),
  `category` text DEFAULT 'other' NOT NULL CHECK (`category` IN ('contract', 'identity', 'tax', 'policy', 'receipt', 'bug', 'other')),
  `owner_employee_id` integer NOT NULL,
  `object_key` text NOT NULL,
  `original_name` text NOT NULL,
  `content_type` text NOT NULL,
  `size_bytes` integer NOT NULL CHECK (`size_bytes` > 0 AND `size_bytes` <= 10485760),
  `uploaded_by_email` text NOT NULL,
  `related_entity_type` text,
  `related_entity_id` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`owner_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `stored_files_next` SELECT * FROM `stored_files`;--> statement-breakpoint
DROP TABLE `stored_files`;--> statement-breakpoint
ALTER TABLE `stored_files_next` RENAME TO `stored_files`;--> statement-breakpoint
CREATE UNIQUE INDEX `stored_files_object_key_unique` ON `stored_files` (`object_key`);--> statement-breakpoint
CREATE INDEX `stored_files_owner_kind_idx` ON `stored_files` (`owner_employee_id`, `kind`, `created_at`);--> statement-breakpoint
CREATE INDEX `stored_files_related_idx` ON `stored_files` (`related_entity_type`, `related_entity_id`);--> statement-breakpoint
CREATE TABLE `bug_reports` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `reporter_email` text NOT NULL,
  `employee_id` integer,
  `description` text NOT NULL,
  `screenshot_file_id` text,
  `status` text DEFAULT 'open' NOT NULL,
  `resolved_by_email` text,
  `resolved_at` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`screenshot_file_id`) REFERENCES `stored_files`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE INDEX `bug_reports_status_created_idx` ON `bug_reports` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `bug_reports_reporter_idx` ON `bug_reports` (`reporter_email`);
