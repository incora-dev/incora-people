ALTER TABLE announcements ADD COLUMN image_file_id TEXT REFERENCES stored_files(id);

CREATE INDEX IF NOT EXISTS announcements_image_file_idx
ON announcements(image_file_id);
