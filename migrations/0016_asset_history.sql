CREATE TABLE `asset_events` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `asset_id` integer NOT NULL REFERENCES `company_assets`(`id`),
  `event_type` text NOT NULL,
  `previous_employee_id` integer REFERENCES `employees`(`id`),
  `next_employee_id` integer REFERENCES `employees`(`id`),
  `previous_status` text,
  `next_status` text NOT NULL,
  `note` text DEFAULT '' NOT NULL,
  `actor_email` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX `asset_events_asset_created_idx` ON `asset_events` (`asset_id`, `created_at`);
