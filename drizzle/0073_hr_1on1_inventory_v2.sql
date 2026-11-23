-- Mirror of migrations/0070_hr_1on1_inventory_v2.sql.
-- Runtime D1 migration ordering is defined by /migrations.
ALTER TABLE one_on_one_plans ADD COLUMN next_due_date TEXT;
UPDATE one_on_one_plans AS plan
   SET next_due_date = date(
     COALESCE(
       (SELECT date(MAX(meeting.held_at)) FROM one_on_one_meetings meeting WHERE meeting.plan_id = plan.id),
       date(plan.created_at)
     ),
     '+' || plan.cadence_days || ' days'
   )
 WHERE next_due_date IS NULL;
ALTER TABLE one_on_one_meetings ADD COLUMN creator_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE one_on_one_meetings ADD COLUMN risk_status TEXT CHECK (risk_status IS NULL OR risk_status IN ('low_risk', 'medium_risk', 'high_risk', 'problem'));
ALTER TABLE one_on_one_meetings ADD COLUMN reason TEXT NOT NULL DEFAULT '';
ALTER TABLE one_on_one_meetings ADD COLUMN feedback TEXT NOT NULL DEFAULT '';
ALTER TABLE one_on_one_meetings ADD COLUMN ways_to_solve TEXT NOT NULL DEFAULT '';
ALTER TABLE one_on_one_meetings ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
ALTER TABLE one_on_one_meetings ADD COLUMN deleted_at TEXT;
ALTER TABLE one_on_one_meetings ADD COLUMN request_id TEXT;
UPDATE one_on_one_meetings SET updated_at = created_at;
CREATE TRIGGER IF NOT EXISTS one_on_one_meetings_updated_at_legacy_insert
AFTER INSERT ON one_on_one_meetings
WHEN NEW.updated_at = '1970-01-01T00:00:00.000Z'
BEGIN UPDATE one_on_one_meetings SET updated_at = NEW.created_at WHERE id = NEW.id; END;
UPDATE one_on_one_meetings AS meeting
   SET creator_user_id = (SELECT user.id FROM users user WHERE lower(trim(user.email)) = lower(trim(meeting.facilitator_email)) ORDER BY user.id LIMIT 1)
 WHERE creator_user_id IS NULL;
CREATE INDEX IF NOT EXISTS one_on_one_meetings_employee_created_idx ON one_on_one_meetings(employee_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS one_on_one_meetings_plan_deleted_idx ON one_on_one_meetings(plan_id, deleted_at, held_at);
CREATE INDEX IF NOT EXISTS one_on_one_plans_due_active_idx ON one_on_one_plans(active, next_due_date, employee_id);
CREATE UNIQUE INDEX IF NOT EXISTS one_on_one_meetings_request_id_uq ON one_on_one_meetings(request_id) WHERE request_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS one_on_one_conversation_notes (
  id TEXT PRIMARY KEY NOT NULL,
  meeting_id INTEGER NOT NULL REFERENCES one_on_one_meetings(id) ON DELETE RESTRICT,
  author_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  note_type TEXT NOT NULL CHECK (note_type IN ('private_author', 'selected_recipients', 'employee_or_team')),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS one_on_one_conversation_notes_meeting_idx ON one_on_one_conversation_notes(meeting_id, created_at, id);
CREATE INDEX IF NOT EXISTS one_on_one_conversation_notes_author_idx ON one_on_one_conversation_notes(author_user_id, updated_at DESC, id);
CREATE TABLE IF NOT EXISTS one_on_one_note_recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id TEXT NOT NULL REFERENCES one_on_one_conversation_notes(id) ON DELETE RESTRICT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  granted_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  grant_source TEXT NOT NULL CHECK (grant_source IN ('person', 'employee', 'team')),
  source_id TEXT,
  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS one_on_one_note_recipient_active_uq ON one_on_one_note_recipients(note_id, user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS one_on_one_note_recipients_user_idx ON one_on_one_note_recipients(user_id, revoked_at, note_id);
CREATE TRIGGER IF NOT EXISTS one_on_one_private_note_no_recipients
BEFORE INSERT ON one_on_one_note_recipients
WHEN (SELECT note_type FROM one_on_one_conversation_notes WHERE id = NEW.note_id) = 'private_author'
BEGIN SELECT RAISE(ABORT, 'private manager notes cannot have recipients'); END;
ALTER TABLE inventory_counts ADD COLUMN scope_type TEXT NOT NULL DEFAULT 'location' CHECK (scope_type IN ('location', 'group', 'item'));
ALTER TABLE inventory_counts ADD COLUMN scope_id INTEGER;
CREATE INDEX IF NOT EXISTS inventory_counts_scope_idx ON inventory_counts(scope_type, scope_id, location_id, count_date DESC, id DESC);
ALTER TABLE inventory_count_lines ADD COLUMN included INTEGER NOT NULL DEFAULT 1 CHECK (included IN (0, 1));
DROP TRIGGER IF EXISTS inventory_count_finalize_validate;
CREATE TRIGGER inventory_count_finalize_validate
BEFORE UPDATE OF status ON inventory_counts
WHEN OLD.status = 'draft' AND NEW.status = 'finalized'
BEGIN
  SELECT CASE WHEN (SELECT active FROM inventory_storage_locations WHERE id = NEW.location_id) <> 1 THEN RAISE(ABORT, 'inventory counts require an active storage location') END;
  SELECT CASE WHEN NEW.location_version_snapshot <> (SELECT inventory_version FROM inventory_storage_locations WHERE id = NEW.location_id) THEN RAISE(ABORT, 'inventory count snapshot is stale; refresh it before finalizing') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM inventory_count_lines WHERE count_id = NEW.id AND included = 1) THEN RAISE(ABORT, 'inventory count must include at least one item') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM inventory_count_lines WHERE count_id = NEW.id AND included = 1 AND counted_quantity IS NULL) THEN RAISE(ABORT, 'all inventory count quantities must be entered') END;
END;
DROP TRIGGER IF EXISTS inventory_count_finalize_apply;
CREATE TRIGGER inventory_count_finalize_apply
AFTER UPDATE OF status ON inventory_counts
WHEN OLD.status = 'draft' AND NEW.status = 'finalized'
BEGIN
  INSERT INTO inventory_operations(request_id, operation_type, item_id, source_location_id, quantity_delta, expected_source_version, reason, actor_email, created_at)
  SELECT 'inventory-count:' || NEW.id || ':' || line.item_id, 'count_adjustment', line.item_id, NEW.location_id,
    line.counted_quantity - line.expected_quantity, stock.version, 'Фактичний перерахунок запасу', NEW.finalized_by_email, COALESCE(NEW.finalized_at, CURRENT_TIMESTAMP)
  FROM inventory_count_lines line JOIN inventory_item_stocks stock ON stock.item_id = line.item_id AND stock.location_id = NEW.location_id
  WHERE line.count_id = NEW.id AND line.included = 1 AND line.counted_quantity <> line.expected_quantity;
END;
