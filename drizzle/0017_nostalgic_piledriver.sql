CREATE TABLE `company_assets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`asset_tag` text NOT NULL,
	`category` text DEFAULT 'equipment' NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`assigned_employee_id` integer,
	`serial_number` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`assigned_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `company_assets_asset_tag_unique` ON `company_assets` (`asset_tag`);
--> statement-breakpoint
CREATE INDEX `company_assets_status_idx` ON `company_assets` (`status`,`category`);
--> statement-breakpoint
CREATE INDEX `company_assets_assignee_idx` ON `company_assets` (`assigned_employee_id`);
--> statement-breakpoint
CREATE TABLE `knowledge_articles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`category` text DEFAULT 'General' NOT NULL,
	`body` text NOT NULL,
	`published` integer DEFAULT true NOT NULL,
	`author_email` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `knowledge_articles_published_idx` ON `knowledge_articles` (`published`,`category`);
