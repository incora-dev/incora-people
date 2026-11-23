CREATE TABLE IF NOT EXISTS knowledge_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  title TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  minimum_role TEXT NOT NULL DEFAULT 'employee',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT knowledge_sections_minimum_role_check CHECK (minimum_role IN ('employee', 'manager', 'hr_admin', 'super_admin'))
);

CREATE INDEX IF NOT EXISTS knowledge_sections_sort_idx
  ON knowledge_sections (sort_order, title);

ALTER TABLE knowledge_articles ADD COLUMN section_id INTEGER REFERENCES knowledge_sections(id);

INSERT OR IGNORE INTO knowledge_sections (title, description, minimum_role, sort_order, created_by_email)
SELECT
  category,
  CASE
    WHEN category LIKE '%INCORA People%' OR category LIKE '0.%' OR category LIKE '1.%'
      THEN 'Покроковий путівник по функціях INCORA People.'
    ELSE 'Внутрішні інструкції та матеріали компанії.'
  END,
  'employee',
  ROW_NUMBER() OVER (ORDER BY category),
  MIN(author_email)
FROM knowledge_articles
GROUP BY category;

UPDATE knowledge_articles
SET section_id = (
  SELECT knowledge_sections.id
  FROM knowledge_sections
  WHERE knowledge_sections.title = knowledge_articles.category
  LIMIT 1
)
WHERE section_id IS NULL;
