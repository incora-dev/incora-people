INSERT INTO announcements (title, body, published_at, expires_at, pinned, active, created_by_email)
SELECT 'П’ятничний командний дайджест', '<p>Привіт, командо! Цього тижня ми закрили кілька важливих задач і підготували оновлення внутрішніх процесів.</p><p><strong>Нагадування:</strong> у п’ятницю о 16:30 збираємося на короткий командний синк. Буде кава, піца й кілька хороших новин.</p>', '2026-08-13T08:00:00.000Z', NULL, 1, 1, 'person011@example.test'
WHERE NOT EXISTS (SELECT 1 FROM announcements WHERE title = 'П’ятничний командний дайджест');

CREATE TABLE IF NOT EXISTS reference_values (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, kind TEXT NOT NULL, value TEXT NOT NULL, label TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT reference_values_kind_check CHECK (kind IN ('technology', 'level', 'position')));
CREATE UNIQUE INDEX IF NOT EXISTS reference_values_kind_value_unique ON reference_values (kind, value);
CREATE INDEX IF NOT EXISTS reference_values_kind_active_idx ON reference_values (kind, active, sort_order);
INSERT OR IGNORE INTO reference_values (kind, value, label, sort_order) SELECT 'technology', lower(trim(title)), trim(title), 100 FROM employee_profile_records WHERE kind = 'skill' AND trim(title) <> '';
INSERT OR IGNORE INTO reference_values (kind, value, label, sort_order) SELECT 'level', lower(trim(level)), trim(level), 100 FROM employees WHERE level IS NOT NULL AND trim(level) <> '';
INSERT OR IGNORE INTO reference_values (kind, value, label, sort_order) SELECT 'position', lower(trim(job_title)), trim(job_title), 100 FROM employees WHERE trim(job_title) <> '';
