ALTER TABLE people_tasks
ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'
CHECK (priority IN ('low', 'medium', 'high'));

CREATE INDEX IF NOT EXISTS people_tasks_due_priority_idx
ON people_tasks(due_date, priority, status);
