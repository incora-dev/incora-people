UPDATE knowledge_sections
SET parent_id = (SELECT id FROM knowledge_sections WHERE title = 'INCORA People' LIMIT 1)
WHERE created_by_email = 'system@incora.people'
  AND title <> 'INCORA People'
  AND (title LIKE '%Початок роботи' OR title LIKE '%Люди та структура' OR title LIKE '%Відпустки та календар' OR title LIKE '%Облік робочого часу' OR title LIKE '%Завдання й комунікації' OR title LIKE '%Ресурси працівника' OR title LIKE '%Адміністрування HR' OR title LIKE '%Системне адміністрування');
