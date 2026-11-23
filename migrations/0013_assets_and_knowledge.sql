CREATE TABLE `company_assets` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `asset_tag` text NOT NULL,
  `category` text DEFAULT 'equipment' NOT NULL,
  `status` text DEFAULT 'available' NOT NULL,
  `assigned_employee_id` integer REFERENCES `employees`(`id`),
  `serial_number` text DEFAULT '' NOT NULL,
  `note` text DEFAULT '' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX `company_assets_asset_tag_unique` ON `company_assets` (`asset_tag`);
CREATE INDEX `company_assets_status_idx` ON `company_assets` (`status`, `category`);
CREATE INDEX `company_assets_assignee_idx` ON `company_assets` (`assigned_employee_id`);

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
CREATE INDEX `knowledge_articles_published_idx` ON `knowledge_articles` (`published`, `category`);
