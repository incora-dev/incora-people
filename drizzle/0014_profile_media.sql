PRAGMA foreign_keys = OFF;--> statement-breakpoint
CREATE TABLE `stored_files_profile_media` (
  `id` text PRIMARY KEY NOT NULL,
  `kind` text NOT NULL CHECK (`kind` IN (
    'employee_document',
    'reimbursement_receipt',
    'bug_screenshot',
    'profile_photo',
    'profile_cover'
  )),
  `category` text DEFAULT 'other' NOT NULL CHECK (`category` IN (
    'contract',
    'identity',
    'tax',
    'policy',
    'receipt',
    'bug',
    'profile',
    'other'
  )),
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
INSERT INTO `stored_files_profile_media` SELECT * FROM `stored_files`;--> statement-breakpoint
DROP TABLE `stored_files`;--> statement-breakpoint
ALTER TABLE `stored_files_profile_media` RENAME TO `stored_files`;--> statement-breakpoint
CREATE UNIQUE INDEX `stored_files_object_key_unique` ON `stored_files` (`object_key`);--> statement-breakpoint
CREATE INDEX `stored_files_owner_kind_idx` ON `stored_files` (`owner_employee_id`, `kind`, `created_at`);--> statement-breakpoint
CREATE INDEX `stored_files_related_idx` ON `stored_files` (`related_entity_type`, `related_entity_id`);--> statement-breakpoint
PRAGMA foreign_keys = ON;
