CREATE TRIGGER IF NOT EXISTS `access_policies_settings_scope_insert`
BEFORE INSERT ON `access_policies`
WHEN NEW.`role` NOT IN ('super_admin', 'hr_admin') AND NEW.`manage_settings` = 1
BEGIN
  SELECT RAISE(ABORT, 'manage_settings is restricted to administrators');
END;

CREATE TRIGGER IF NOT EXISTS `access_policies_settings_scope_update`
BEFORE UPDATE OF `role`, `manage_settings` ON `access_policies`
WHEN NEW.`role` NOT IN ('super_admin', 'hr_admin') AND NEW.`manage_settings` = 1
BEGIN
  SELECT RAISE(ABORT, 'manage_settings is restricted to administrators');
END;
