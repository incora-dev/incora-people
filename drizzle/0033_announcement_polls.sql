CREATE TABLE IF NOT EXISTS announcement_polls (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, announcement_id INTEGER NOT NULL UNIQUE REFERENCES announcements(id) ON DELETE CASCADE, question TEXT NOT NULL, options_json TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS announcement_poll_responses (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, poll_id INTEGER NOT NULL REFERENCES announcement_polls(id) ON DELETE CASCADE, user_email TEXT NOT NULL, option_index INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS announcement_poll_response_unique ON announcement_poll_responses (poll_id, user_email);
