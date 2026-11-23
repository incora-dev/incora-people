CREATE TABLE `asset_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_id` integer NOT NULL,
	`event_type` text NOT NULL,
	`previous_employee_id` integer,
	`next_employee_id` integer,
	`previous_status` text,
	`next_status` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`actor_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `company_assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`previous_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`next_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `asset_events_asset_created_idx` ON `asset_events` (`asset_id`,`created_at`);