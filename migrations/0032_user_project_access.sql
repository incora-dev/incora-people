ALTER TABLE users ADD COLUMN manage_projects INTEGER NOT NULL DEFAULT 0;
UPDATE users SET manage_projects = 1 WHERE role = 'super_admin';
