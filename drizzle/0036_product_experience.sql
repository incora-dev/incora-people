ALTER TABLE announcement_polls ADD COLUMN description TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE announcement_polls ADD COLUMN questions_json TEXT NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE announcement_poll_responses ADD COLUMN answers_json TEXT NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE knowledge_sections ADD COLUMN parent_id INTEGER REFERENCES knowledge_sections(id);
--> statement-breakpoint
INSERT INTO knowledge_sections (title, description, minimum_role, sort_order, created_by_email)
SELECT 'INCORA People', 'Повний путівник з використання платформи INCORA People.', 'employee', 0, 'system@incora.people'
WHERE NOT EXISTS (SELECT 1 FROM knowledge_sections WHERE title = 'INCORA People');
--> statement-breakpoint
UPDATE knowledge_sections SET parent_id = (SELECT id FROM knowledge_sections WHERE title = 'INCORA People' LIMIT 1) WHERE created_by_email = 'system@incora.people' AND title IN ('Початок роботи','Люди та структура','Відпустки та календар','Облік робочого часу','Завдання й комунікації','Ресурси працівника','Адміністрування HR','Системне адміністрування');
--> statement-breakpoint
CREATE INDEX knowledge_sections_parent_sort_idx ON knowledge_sections(parent_id, sort_order, title);
