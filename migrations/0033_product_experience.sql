ALTER TABLE announcement_polls ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE announcement_polls ADD COLUMN questions_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE announcement_poll_responses ADD COLUMN answers_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE knowledge_sections ADD COLUMN parent_id INTEGER REFERENCES knowledge_sections(id);

INSERT INTO knowledge_sections (title, description, minimum_role, sort_order, created_by_email)
SELECT 'INCORA People', 'Повний путівник з використання платформи INCORA People.', 'employee', 0, 'system@incora.people'
WHERE NOT EXISTS (SELECT 1 FROM knowledge_sections WHERE title = 'INCORA People');

UPDATE knowledge_sections
SET parent_id = (SELECT id FROM knowledge_sections WHERE title = 'INCORA People' LIMIT 1),
    sort_order = CASE title
      WHEN 'Початок роботи' THEN 10 WHEN 'Люди та структура' THEN 20
      WHEN 'Відпустки та календар' THEN 30 WHEN 'Облік робочого часу' THEN 40
      WHEN 'Завдання й комунікації' THEN 50 WHEN 'Ресурси працівника' THEN 60
      WHEN 'Адміністрування HR' THEN 70 WHEN 'Системне адміністрування' THEN 80
      ELSE sort_order END
WHERE created_by_email = 'system@incora.people'
  AND title IN ('Початок роботи','Люди та структура','Відпустки та календар','Облік робочого часу','Завдання й комунікації','Ресурси працівника','Адміністрування HR','Системне адміністрування');

CREATE INDEX knowledge_sections_parent_sort_idx ON knowledge_sections(parent_id, sort_order, title);
