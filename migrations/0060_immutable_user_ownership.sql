-- Keep user-owned activity bound to the immutable users.id instead of using a
-- mutable email address as the primary identity. Email columns remain for
-- delivery, exports and backwards compatibility with older deployments.

ALTER TABLE notifications ADD COLUMN user_id INTEGER REFERENCES users(id);
ALTER TABLE notification_outbox ADD COLUMN user_id INTEGER REFERENCES users(id);
ALTER TABLE mobile_push_tokens ADD COLUMN user_id INTEGER REFERENCES users(id);
ALTER TABLE bug_reports ADD COLUMN reporter_user_id INTEGER REFERENCES users(id);
ALTER TABLE announcement_dismissals ADD COLUMN user_id INTEGER REFERENCES users(id);
ALTER TABLE announcement_comments ADD COLUMN user_id INTEGER REFERENCES users(id);
ALTER TABLE announcement_reactions ADD COLUMN user_id INTEGER REFERENCES users(id);
ALTER TABLE announcement_poll_responses ADD COLUMN user_id INTEGER REFERENCES users(id);

UPDATE notifications
SET user_id = (SELECT id FROM users WHERE lower(users.email) = lower(notifications.user_email))
WHERE user_id IS NULL;
UPDATE notification_outbox
SET user_id = (SELECT id FROM users WHERE lower(users.email) = lower(notification_outbox.user_email))
WHERE user_id IS NULL;
UPDATE mobile_push_tokens
SET user_id = (SELECT id FROM users WHERE lower(users.email) = lower(mobile_push_tokens.user_email))
WHERE user_id IS NULL;
UPDATE bug_reports
SET reporter_user_id = (SELECT id FROM users WHERE lower(users.email) = lower(bug_reports.reporter_email))
WHERE reporter_user_id IS NULL;
UPDATE announcement_dismissals
SET user_id = (SELECT id FROM users WHERE lower(users.email) = lower(announcement_dismissals.user_email))
WHERE user_id IS NULL;
UPDATE announcement_comments
SET user_id = (SELECT id FROM users WHERE lower(users.email) = lower(announcement_comments.user_email))
WHERE user_id IS NULL;
UPDATE announcement_reactions
SET user_id = (SELECT id FROM users WHERE lower(users.email) = lower(announcement_reactions.user_email))
WHERE user_id IS NULL;
UPDATE announcement_poll_responses
SET user_id = (SELECT id FROM users WHERE lower(users.email) = lower(announcement_poll_responses.user_email))
WHERE user_id IS NULL;

CREATE INDEX notifications_user_id_idx ON notifications(user_id, created_at);
CREATE INDEX notification_outbox_user_id_idx ON notification_outbox(user_id, status, available_at);
CREATE INDEX mobile_push_tokens_user_id_active_idx ON mobile_push_tokens(user_id, active);
CREATE INDEX bug_reports_reporter_user_id_idx ON bug_reports(reporter_user_id, created_at);
CREATE INDEX announcement_dismissals_user_id_idx ON announcement_dismissals(user_id, announcement_id);
CREATE INDEX announcement_comments_user_id_idx ON announcement_comments(user_id, created_at);
CREATE INDEX announcement_reactions_user_id_idx ON announcement_reactions(user_id, announcement_id);
CREATE INDEX announcement_poll_responses_user_id_idx ON announcement_poll_responses(user_id, poll_id);

-- New writes may still provide email-only payloads from an older client. The
-- trigger fills the immutable link server-side and never changes it later.
CREATE TRIGGER IF NOT EXISTS notifications_fill_user_id
AFTER INSERT ON notifications
WHEN NEW.user_id IS NULL
BEGIN
  UPDATE notifications
  SET user_id = (SELECT id FROM users WHERE lower(users.email) = lower(NEW.user_email))
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS notification_outbox_fill_user_id
AFTER INSERT ON notification_outbox
WHEN NEW.user_id IS NULL
BEGIN
  UPDATE notification_outbox
  SET user_id = (SELECT id FROM users WHERE lower(users.email) = lower(NEW.user_email))
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS mobile_push_tokens_fill_user_id
AFTER INSERT ON mobile_push_tokens
WHEN NEW.user_id IS NULL
BEGIN
  UPDATE mobile_push_tokens
  SET user_id = (SELECT id FROM users WHERE lower(users.email) = lower(NEW.user_email))
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS bug_reports_fill_reporter_user_id
AFTER INSERT ON bug_reports
WHEN NEW.reporter_user_id IS NULL
BEGIN
  UPDATE bug_reports
  SET reporter_user_id = (SELECT id FROM users WHERE lower(users.email) = lower(NEW.reporter_email))
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS announcement_dismissals_fill_user_id
AFTER INSERT ON announcement_dismissals
WHEN NEW.user_id IS NULL
BEGIN
  UPDATE announcement_dismissals
  SET user_id = (SELECT id FROM users WHERE lower(users.email) = lower(NEW.user_email))
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS announcement_comments_fill_user_id
AFTER INSERT ON announcement_comments
WHEN NEW.user_id IS NULL
BEGIN
  UPDATE announcement_comments
  SET user_id = (SELECT id FROM users WHERE lower(users.email) = lower(NEW.user_email))
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS announcement_reactions_fill_user_id
AFTER INSERT ON announcement_reactions
WHEN NEW.user_id IS NULL
BEGIN
  UPDATE announcement_reactions
  SET user_id = (SELECT id FROM users WHERE lower(users.email) = lower(NEW.user_email))
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS announcement_poll_responses_fill_user_id
AFTER INSERT ON announcement_poll_responses
WHEN NEW.user_id IS NULL
BEGIN
  UPDATE announcement_poll_responses
  SET user_id = (SELECT id FROM users WHERE lower(users.email) = lower(NEW.user_email))
  WHERE id = NEW.id;
END;
