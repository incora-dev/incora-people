CREATE TABLE `company_events` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `title` text NOT NULL,
  `description` text DEFAULT '' NOT NULL,
  `starts_at` text NOT NULL,
  `ends_at` text,
  `location` text DEFAULT '' NOT NULL,
  `url` text,
  `active` integer DEFAULT true NOT NULL,
  `created_by_email` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX `company_events_active_starts_idx` ON `company_events` (`active`,`starts_at`);

CREATE TABLE `announcements` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `title` text NOT NULL,
  `body` text NOT NULL,
  `published_at` text NOT NULL,
  `expires_at` text,
  `pinned` integer DEFAULT false NOT NULL,
  `active` integer DEFAULT true NOT NULL,
  `created_by_email` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX `announcements_active_published_idx` ON `announcements` (`active`,`published_at`);

CREATE TABLE `company_links` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `label` text NOT NULL,
  `url` text NOT NULL,
  `description` text DEFAULT '' NOT NULL,
  `sort_order` integer DEFAULT 0 NOT NULL,
  `active` integer DEFAULT true NOT NULL,
  `created_by_email` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX `company_links_active_sort_idx` ON `company_links` (`active`,`sort_order`);
