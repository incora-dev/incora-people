CREATE TABLE `document_folders` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `description` text DEFAULT '' NOT NULL,
  `sort_order` integer DEFAULT 0 NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX `document_folders_name_unique` ON `document_folders` (`name`);

CREATE TABLE `company_documents` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `folder_id` integer NOT NULL REFERENCES `document_folders`(`id`),
  `file_id` text NOT NULL REFERENCES `stored_files`(`id`),
  `title` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX `company_documents_file_id_unique` ON `company_documents` (`file_id`);
CREATE INDEX `company_documents_folder_idx` ON `company_documents` (`folder_id`);
