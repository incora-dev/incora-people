CREATE TABLE `announcement_dismissals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`announcement_id` integer NOT NULL,
	`user_email` text NOT NULL,
	`dismissed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`announcement_id`) REFERENCES `announcements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `announcement_dismissals_user_announcement_unique` ON `announcement_dismissals` (`user_email`,`announcement_id`);--> statement-breakpoint
CREATE INDEX `announcement_dismissals_user_idx` ON `announcement_dismissals` (`user_email`);
