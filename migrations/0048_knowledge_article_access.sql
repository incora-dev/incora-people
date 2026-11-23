-- Add optional per-person audience rules for published knowledge articles.
CREATE TABLE IF NOT EXISTS knowledge_article_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL REFERENCES knowledge_articles(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  granted_by_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(article_id, employee_id)
);

CREATE INDEX IF NOT EXISTS knowledge_article_access_article_idx
  ON knowledge_article_access(article_id);
CREATE INDEX IF NOT EXISTS knowledge_article_access_employee_idx
  ON knowledge_article_access(employee_id);
