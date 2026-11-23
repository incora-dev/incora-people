-- Sites/Drizzle mirror of migrations/0056_immutable_protected_admins.sql.
CREATE TABLE IF NOT EXISTS protected_admin_accounts (
  user_id INTEGER PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO protected_admin_accounts(user_id)
SELECT u.id
FROM users u
WHERE u.role = 'super_admin'
  AND EXISTS (
    SELECT 1
    FROM system_settings s, json_each(s.value_json) configured
    WHERE s.key = 'protected_super_admin_emails'
      AND lower(configured.value) = lower(u.email)
  );

DROP TRIGGER IF EXISTS protected_super_admin_delete;
DROP TRIGGER IF EXISTS protected_super_admin_demote;

CREATE TRIGGER IF NOT EXISTS protected_admin_delete
BEFORE DELETE ON users
WHEN EXISTS (SELECT 1 FROM protected_admin_accounts p WHERE p.user_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'protected super administrator cannot be deleted');
END;

CREATE TRIGGER IF NOT EXISTS protected_admin_demote
BEFORE UPDATE OF role ON users
WHEN NEW.role <> 'super_admin'
  AND EXISTS (SELECT 1 FROM protected_admin_accounts p WHERE p.user_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'protected super administrator cannot be demoted');
END;

CREATE TRIGGER IF NOT EXISTS protected_admin_email_change
BEFORE UPDATE OF email ON users
WHEN lower(NEW.email) <> lower(OLD.email)
  AND EXISTS (SELECT 1 FROM protected_admin_accounts p WHERE p.user_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'protected super administrator email cannot change');
END;
