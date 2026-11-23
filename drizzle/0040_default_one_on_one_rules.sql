INSERT OR IGNORE INTO one_on_one_rules (
  audience,
  cadence_days,
  active,
  updated_by_email
) VALUES
  ('developers', 30, 1, 'system@incora-people.local'),
  ('managers', 30, 1, 'system@incora-people.local'),
  ('probation', 14, 1, 'system@incora-people.local');
