-- Prevent case/whitespace variants from creating ambiguous login identities.
-- If this migration encounters legacy duplicates, it fails closed and requires
-- a separately approved account reconciliation before rollout.
CREATE UNIQUE INDEX IF NOT EXISTS employees_normalized_email_uq
  ON employees(lower(trim(email)));

CREATE UNIQUE INDEX IF NOT EXISTS users_normalized_email_uq
  ON users(lower(trim(email)));
