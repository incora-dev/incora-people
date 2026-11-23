CREATE TABLE `employee_profile_records` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `employee_id` integer NOT NULL,
  `kind` text NOT NULL CHECK (`kind` IN ('skill','education','certification','emergency_contact','dependent','experience','compensation')),
  `title` text NOT NULL,
  `subtitle` text DEFAULT '' NOT NULL,
  `started_on` text,
  `ended_on` text,
  `notes` text DEFAULT '' NOT NULL,
  `amount_cents` integer,
  `currency` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `employee_profile_records_employee_kind_idx` ON `employee_profile_records` (`employee_id`,`kind`);
