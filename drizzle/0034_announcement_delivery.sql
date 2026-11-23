CREATE TABLE IF NOT EXISTS announcement_deliveries (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE, channel TEXT NOT NULL, scheduled_for TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT NOT NULL DEFAULT '', sent_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT announcement_deliveries_channel_check CHECK (channel IN ('google_chat', 'email')));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS announcement_deliveries_announcement_channel_unique ON announcement_deliveries (announcement_id, channel);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS announcement_deliveries_status_schedule_idx ON announcement_deliveries (status, scheduled_for);
