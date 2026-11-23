CREATE TABLE IF NOT EXISTS announcement_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS announcement_comments_announcement_created_idx
  ON announcement_comments (announcement_id, created_at);

CREATE TABLE IF NOT EXISTS announcement_reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  emoji TEXT NOT NULL CHECK (emoji IN ('👍', '❤️', '🎉', '👏', '😄', '🤔')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT announcement_reactions_user_emoji_unique
    UNIQUE (announcement_id, user_email, emoji)
);
CREATE INDEX IF NOT EXISTS announcement_reactions_announcement_idx
  ON announcement_reactions (announcement_id);
