CREATE TABLE `knowledge_articles_next` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `title` text NOT NULL,
  `category` text DEFAULT 'General' NOT NULL,
  `body` text NOT NULL,
  `minimum_role` text DEFAULT 'employee' NOT NULL CHECK (`minimum_role` IN ('employee', 'manager', 'hr_admin', 'super_admin')),
  `published` integer DEFAULT true NOT NULL,
  `author_email` text NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT INTO `knowledge_articles_next`
  (`id`, `title`, `category`, `body`, `minimum_role`, `published`, `author_email`, `updated_at`, `created_at`)
SELECT
  `id`, `title`, `category`, `body`,
  CASE WHEN `minimum_role` IN ('employee', 'manager', 'hr_admin', 'super_admin') THEN `minimum_role` ELSE 'employee' END,
  `published`, `author_email`, `updated_at`, `created_at`
FROM `knowledge_articles`;
DROP TABLE `knowledge_articles`;
ALTER TABLE `knowledge_articles_next` RENAME TO `knowledge_articles`;
CREATE INDEX `knowledge_articles_published_idx` ON `knowledge_articles` (`published`, `category`);
