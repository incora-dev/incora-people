-- Keep Sites/Drizzle history in sync with production migration 0067.
CREATE UNIQUE INDEX IF NOT EXISTS employees_normalized_email_uq
  ON employees(lower(trim(email)));

CREATE UNIQUE INDEX IF NOT EXISTS users_normalized_email_uq
  ON users(lower(trim(email)));
