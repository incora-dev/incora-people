ALTER TABLE access_policies
  ADD COLUMN manage_inventory INTEGER NOT NULL DEFAULT 0 CHECK (manage_inventory IN (0, 1));

CREATE TABLE IF NOT EXISTS inventory_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by_email TEXT NOT NULL,
  updated_by_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_storage_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  inventory_version INTEGER NOT NULL DEFAULT 0 CHECK (inventory_version >= 0),
  created_by_email TEXT NOT NULL,
  updated_by_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES inventory_categories(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  accounting_mode TEXT NOT NULL DEFAULT 'quantity' CHECK (accounting_mode = 'quantity'),
  default_location_id INTEGER REFERENCES inventory_storage_locations(id) ON DELETE RESTRICT,
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by_email TEXT NOT NULL,
  updated_by_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (category_id, name)
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES inventory_groups(id) ON DELETE RESTRICT,
  legacy_item_id INTEGER UNIQUE REFERENCES office_inventory_items(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT 'шт.',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  next_inventory_date TEXT CHECK (next_inventory_date IS NULL OR (length(next_inventory_date) = 10 AND next_inventory_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
  created_by_email TEXT NOT NULL,
  updated_by_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS inventory_items_group_active_idx ON inventory_items(group_id, active, name);

CREATE TABLE IF NOT EXISTS inventory_item_stocks (
  item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  location_id INTEGER NOT NULL REFERENCES inventory_storage_locations(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  minimum_quantity INTEGER NOT NULL DEFAULT 0 CHECK (minimum_quantity >= 0),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (item_id, location_id)
);
CREATE INDEX IF NOT EXISTS inventory_stocks_location_idx ON inventory_item_stocks(location_id, item_id);

CREATE TABLE IF NOT EXISTS inventory_counts (
  id TEXT PRIMARY KEY NOT NULL,
  location_id INTEGER NOT NULL REFERENCES inventory_storage_locations(id) ON DELETE RESTRICT,
  count_date TEXT NOT NULL CHECK (length(count_date) = 10 AND count_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  location_version_snapshot INTEGER NOT NULL CHECK (location_version_snapshot >= 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
  notes TEXT NOT NULL DEFAULT '',
  created_by_email TEXT NOT NULL,
  finalized_by_email TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finalized_at TEXT
);
CREATE INDEX IF NOT EXISTS inventory_counts_location_date_idx ON inventory_counts(location_id, count_date DESC, id DESC);

CREATE TABLE IF NOT EXISTS inventory_count_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  count_id TEXT NOT NULL REFERENCES inventory_counts(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('created', 'refreshed', 'finalized')),
  details TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS inventory_count_events_count_idx ON inventory_count_events(count_id, created_at, id);

CREATE TABLE IF NOT EXISTS inventory_count_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  count_id TEXT NOT NULL REFERENCES inventory_counts(id) ON DELETE RESTRICT,
  item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  expected_quantity INTEGER NOT NULL CHECK (expected_quantity >= 0),
  expected_stock_version INTEGER NOT NULL CHECK (expected_stock_version >= 0),
  counted_quantity INTEGER CHECK (counted_quantity IS NULL OR counted_quantity >= 0),
  UNIQUE (count_id, item_id)
);
CREATE INDEX IF NOT EXISTS inventory_count_lines_count_idx ON inventory_count_lines(count_id, item_id);

CREATE TABLE IF NOT EXISTS inventory_corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  movement_id INTEGER REFERENCES inventory_stock_movements(id) ON DELETE RESTRICT,
  count_line_id INTEGER REFERENCES inventory_count_lines(id) ON DELETE RESTRICT,
  previous_value INTEGER NOT NULL,
  corrected_value INTEGER NOT NULL CHECK (corrected_value >= 0),
  reason TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((movement_id IS NOT NULL) + (count_line_id IS NOT NULL) = 1)
);

CREATE TABLE IF NOT EXISTS inventory_operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('initial_stock', 'receipt', 'decrease', 'transfer', 'count_adjustment', 'historical_correction')),
  item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  source_location_id INTEGER NOT NULL REFERENCES inventory_storage_locations(id) ON DELETE RESTRICT,
  destination_location_id INTEGER REFERENCES inventory_storage_locations(id) ON DELETE RESTRICT,
  quantity_delta INTEGER NOT NULL CHECK (quantity_delta <> 0),
  expected_source_version INTEGER NOT NULL CHECK (expected_source_version >= 0),
  expected_destination_version INTEGER,
  correction_id INTEGER REFERENCES inventory_corrections(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((operation_type = 'transfer' AND quantity_delta > 0 AND destination_location_id IS NOT NULL AND destination_location_id <> source_location_id AND expected_destination_version IS NOT NULL)
    OR (operation_type <> 'transfer' AND destination_location_id IS NULL AND expected_destination_version IS NULL)),
  CHECK ((operation_type = 'historical_correction' AND correction_id IS NOT NULL) OR (operation_type <> 'historical_correction' AND correction_id IS NULL))
);

CREATE TABLE IF NOT EXISTS inventory_stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id INTEGER REFERENCES inventory_operations(id) ON DELETE RESTRICT,
  legacy_movement_id INTEGER UNIQUE REFERENCES office_inventory_movements(id) ON DELETE RESTRICT,
  item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  location_id INTEGER NOT NULL REFERENCES inventory_storage_locations(id) ON DELETE RESTRICT,
  quantity_before INTEGER NOT NULL CHECK (quantity_before >= 0),
  quantity_after INTEGER NOT NULL CHECK (quantity_after >= 0),
  quantity_delta INTEGER NOT NULL,
  operation_type TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (quantity_after = quantity_before + quantity_delta),
  CHECK ((operation_id IS NOT NULL) + (legacy_movement_id IS NOT NULL) = 1),
  UNIQUE (operation_id, item_id, location_id)
);
CREATE INDEX IF NOT EXISTS inventory_movements_item_created_idx ON inventory_stock_movements(item_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_location_created_idx ON inventory_stock_movements(location_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS inventory_catalog_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('category', 'group', 'location', 'item')),
  entity_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS inventory_catalog_events_entity_idx ON inventory_catalog_events(entity_type, entity_id, created_at DESC);

CREATE TRIGGER IF NOT EXISTS inventory_group_insert_active_category
BEFORE INSERT ON inventory_groups
WHEN (SELECT active FROM inventory_categories WHERE id = NEW.category_id) <> 1
BEGIN SELECT RAISE(ABORT, 'inventory groups require an active category'); END;
CREATE TRIGGER IF NOT EXISTS inventory_group_update_active_category
BEFORE UPDATE OF category_id, active ON inventory_groups
WHEN NEW.active = 1 AND (SELECT active FROM inventory_categories WHERE id = NEW.category_id) <> 1
BEGIN SELECT RAISE(ABORT, 'active inventory groups require an active category'); END;
CREATE TRIGGER IF NOT EXISTS inventory_category_archive_guard
BEFORE UPDATE OF active ON inventory_categories
WHEN NEW.active = 0 AND EXISTS (SELECT 1 FROM inventory_groups WHERE category_id = OLD.id AND active = 1)
BEGIN SELECT RAISE(ABORT, 'archive active inventory groups before archiving the category'); END;
CREATE TRIGGER IF NOT EXISTS inventory_item_insert_active_group
BEFORE INSERT ON inventory_items
WHEN (SELECT active FROM inventory_groups WHERE id = NEW.group_id) <> 1
BEGIN SELECT RAISE(ABORT, 'inventory items require an active group'); END;
CREATE TRIGGER IF NOT EXISTS inventory_item_update_active_group
BEFORE UPDATE OF group_id, active ON inventory_items
WHEN NEW.active = 1 AND (SELECT active FROM inventory_groups WHERE id = NEW.group_id) <> 1
BEGIN SELECT RAISE(ABORT, 'active inventory items require an active group'); END;
CREATE TRIGGER IF NOT EXISTS inventory_item_insert_invalidates_counts
AFTER INSERT ON inventory_items
BEGIN UPDATE inventory_storage_locations SET inventory_version = inventory_version + 1 WHERE active = 1; END;
CREATE TRIGGER IF NOT EXISTS inventory_item_update_invalidates_counts
AFTER UPDATE OF active, group_id, sku, name, unit ON inventory_items
WHEN OLD.active <> NEW.active
  OR OLD.group_id <> NEW.group_id
  OR OLD.sku <> NEW.sku
  OR OLD.name <> NEW.name
  OR OLD.unit <> NEW.unit
BEGIN UPDATE inventory_storage_locations SET inventory_version = inventory_version + 1 WHERE active = 1; END;
CREATE TRIGGER IF NOT EXISTS inventory_item_unit_history_guard
BEFORE UPDATE OF unit ON inventory_items
WHEN NEW.unit <> OLD.unit AND (
  EXISTS (SELECT 1 FROM inventory_item_stocks WHERE item_id = OLD.id AND (quantity <> 0 OR minimum_quantity <> 0))
  OR EXISTS (SELECT 1 FROM inventory_stock_movements WHERE item_id = OLD.id)
  OR EXISTS (SELECT 1 FROM inventory_count_lines WHERE item_id = OLD.id)
)
BEGIN SELECT RAISE(ABORT, 'inventory item unit cannot change after stock, movement, or count history exists'); END;
CREATE TRIGGER IF NOT EXISTS inventory_group_archive_guard
BEFORE UPDATE OF active ON inventory_groups
WHEN NEW.active = 0 AND EXISTS (SELECT 1 FROM inventory_items WHERE group_id = OLD.id AND active = 1)
BEGIN SELECT RAISE(ABORT, 'archive active inventory items before archiving the group'); END;
CREATE TRIGGER IF NOT EXISTS inventory_location_archive_guard
BEFORE UPDATE OF active ON inventory_storage_locations
WHEN NEW.active = 0 AND EXISTS (SELECT 1 FROM inventory_item_stocks WHERE location_id = OLD.id AND quantity > 0)
BEGIN SELECT RAISE(ABORT, 'clear or transfer stock before archiving the storage location'); END;
CREATE TRIGGER IF NOT EXISTS inventory_count_active_location_guard
BEFORE INSERT ON inventory_counts
WHEN (SELECT active FROM inventory_storage_locations WHERE id = NEW.location_id) <> 1
BEGIN SELECT RAISE(ABORT, 'inventory counts require an active storage location'); END;
CREATE TRIGGER IF NOT EXISTS inventory_location_update_invalidates_counts
AFTER UPDATE OF name, active ON inventory_storage_locations
WHEN OLD.name <> NEW.name OR OLD.active <> NEW.active
BEGIN UPDATE inventory_storage_locations SET inventory_version = inventory_version + 1 WHERE id = NEW.id; END;

-- Safely represent existing legacy rows. Legacy kind/category become editable
-- catalog data; the prior balance is assigned to its legacy storage location.
INSERT OR IGNORE INTO inventory_categories(name, description, sort_order, created_by_email, updated_by_email)
SELECT DISTINCT category, 'Migrated from office inventory', 0, 'system:migration', 'system:migration'
FROM office_inventory_items;
INSERT OR IGNORE INTO inventory_storage_locations(name, description, created_by_email, updated_by_email)
SELECT DISTINCT CASE WHEN trim(storage_location) = '' THEN 'Невизначене місце зберігання' ELSE trim(storage_location) END,
  'Migrated from office inventory', 'system:migration', 'system:migration'
FROM office_inventory_items;
INSERT OR IGNORE INTO inventory_groups(category_id, name, notes, created_by_email, updated_by_email)
SELECT DISTINCT category.id,
  CASE legacy.kind WHEN 'office_equipment' THEN 'Техніка та обладнання' ELSE 'Мерчандайзинг' END,
  'Імпортована група з попереднього обліку', 'system:migration', 'system:migration'
FROM office_inventory_items legacy
JOIN inventory_categories category ON category.name = legacy.category;
INSERT OR IGNORE INTO inventory_items(group_id, legacy_item_id, sku, name, description, unit, created_by_email, updated_by_email, created_at, updated_at)
SELECT group_row.id, legacy.id, legacy.sku, legacy.name, legacy.note, 'шт.', 'system:migration', 'system:migration', legacy.created_at, legacy.updated_at
FROM office_inventory_items legacy
JOIN inventory_categories category ON category.name = legacy.category
JOIN inventory_groups group_row ON group_row.category_id = category.id
  AND group_row.name = CASE legacy.kind WHEN 'office_equipment' THEN 'Техніка та обладнання' ELSE 'Мерчандайзинг' END;
INSERT OR IGNORE INTO inventory_item_stocks(item_id, location_id, quantity, minimum_quantity, updated_at)
SELECT item.id,
  location.id,
  legacy.quantity,
  legacy.minimum_quantity,
  legacy.updated_at
FROM office_inventory_items legacy
JOIN inventory_items item ON item.legacy_item_id = legacy.id
JOIN inventory_storage_locations location ON location.name = CASE WHEN trim(legacy.storage_location) = '' THEN 'Невизначене місце зберігання' ELSE trim(legacy.storage_location) END;
INSERT OR IGNORE INTO inventory_stock_movements(
  legacy_movement_id, item_id, location_id, quantity_before, quantity_after,
  quantity_delta, operation_type, reason, actor_email, created_at
)
SELECT old_move.id, item.id, stock.location_id,
  old_move.quantity_before, old_move.quantity_after,
  old_move.quantity_after - old_move.quantity_before,
  old_move.reason, old_move.note, old_move.actor_email, old_move.created_at
FROM office_inventory_movements old_move
JOIN inventory_items item ON item.legacy_item_id = old_move.item_id
JOIN inventory_item_stocks stock ON stock.item_id = item.id;

CREATE TRIGGER IF NOT EXISTS inventory_operations_validate
BEFORE INSERT ON inventory_operations
BEGIN
  SELECT CASE WHEN (SELECT active FROM inventory_items WHERE id = NEW.item_id) <> 1
    THEN RAISE(ABORT, 'archived inventory items cannot receive new stock operations') END;
  SELECT CASE WHEN NEW.operation_type IN ('initial_stock', 'receipt')
    AND (SELECT active FROM inventory_storage_locations WHERE id = NEW.source_location_id) <> 1
    THEN RAISE(ABORT, 'stock cannot be added to an archived storage location') END;
  SELECT CASE WHEN NEW.operation_type = 'transfer'
    AND (SELECT active FROM inventory_storage_locations WHERE id = NEW.destination_location_id) <> 1
    THEN RAISE(ABORT, 'stock cannot be transferred to an archived storage location') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM inventory_item_stocks stock
    WHERE stock.item_id = NEW.item_id
      AND stock.location_id = NEW.source_location_id
      AND stock.version = NEW.expected_source_version
      AND stock.quantity + CASE WHEN NEW.operation_type = 'transfer' THEN -NEW.quantity_delta ELSE NEW.quantity_delta END >= 0
  ) THEN RAISE(ABORT, 'inventory source stock is stale, missing, or insufficient') END;
  SELECT CASE WHEN NEW.operation_type = 'transfer' AND NOT EXISTS (
    SELECT 1 FROM inventory_item_stocks stock
    WHERE stock.item_id = NEW.item_id
      AND stock.location_id = NEW.destination_location_id
      AND stock.version = NEW.expected_destination_version
  ) THEN RAISE(ABORT, 'inventory destination stock is stale or missing') END;
  SELECT CASE WHEN NEW.operation_type IN ('initial_stock', 'receipt') AND NEW.quantity_delta <= 0
    THEN RAISE(ABORT, 'receipt quantity must be positive') END;
  SELECT CASE WHEN NEW.operation_type = 'decrease' AND NEW.quantity_delta >= 0
    THEN RAISE(ABORT, 'decrease quantity must be negative') END;
END;

CREATE TRIGGER IF NOT EXISTS inventory_operations_apply
AFTER INSERT ON inventory_operations
BEGIN
  UPDATE inventory_item_stocks
    SET quantity = quantity + CASE WHEN NEW.operation_type = 'transfer' THEN -NEW.quantity_delta ELSE NEW.quantity_delta END,
        version = version + 1, updated_at = NEW.created_at
    WHERE item_id = NEW.item_id AND location_id = NEW.source_location_id;
  UPDATE inventory_item_stocks
    SET quantity = quantity + NEW.quantity_delta, version = version + 1, updated_at = NEW.created_at
    WHERE NEW.operation_type = 'transfer' AND item_id = NEW.item_id AND location_id = NEW.destination_location_id;
  UPDATE inventory_storage_locations SET inventory_version = inventory_version + 1, updated_at = NEW.created_at WHERE id = NEW.source_location_id;
  UPDATE inventory_storage_locations SET inventory_version = inventory_version + 1, updated_at = NEW.created_at WHERE NEW.operation_type = 'transfer' AND id = NEW.destination_location_id;
  INSERT INTO inventory_stock_movements(operation_id, item_id, location_id, quantity_before, quantity_after, quantity_delta, operation_type, reason, actor_email, created_at)
  SELECT NEW.id, NEW.item_id, NEW.source_location_id,
    stock.quantity - CASE WHEN NEW.operation_type = 'transfer' THEN -NEW.quantity_delta ELSE NEW.quantity_delta END,
    stock.quantity,
    CASE WHEN NEW.operation_type = 'transfer' THEN -NEW.quantity_delta ELSE NEW.quantity_delta END,
    NEW.operation_type, NEW.reason, NEW.actor_email, NEW.created_at
  FROM inventory_item_stocks stock WHERE stock.item_id = NEW.item_id AND stock.location_id = NEW.source_location_id;
  INSERT INTO inventory_stock_movements(operation_id, item_id, location_id, quantity_before, quantity_after, quantity_delta, operation_type, reason, actor_email, created_at)
  SELECT NEW.id, NEW.item_id, NEW.destination_location_id,
    stock.quantity - NEW.quantity_delta, stock.quantity, NEW.quantity_delta,
    NEW.operation_type, NEW.reason, NEW.actor_email, NEW.created_at
  FROM inventory_item_stocks stock WHERE NEW.operation_type = 'transfer' AND stock.item_id = NEW.item_id AND stock.location_id = NEW.destination_location_id;
END;

CREATE TRIGGER IF NOT EXISTS inventory_movements_immutable_update
BEFORE UPDATE ON inventory_stock_movements BEGIN SELECT RAISE(ABORT, 'inventory movements are immutable'); END;
CREATE TRIGGER IF NOT EXISTS inventory_movements_immutable_delete
BEFORE DELETE ON inventory_stock_movements BEGIN SELECT RAISE(ABORT, 'inventory movements are immutable'); END;
CREATE TRIGGER IF NOT EXISTS inventory_catalog_events_immutable_update
BEFORE UPDATE ON inventory_catalog_events BEGIN SELECT RAISE(ABORT, 'inventory catalog history is immutable'); END;
CREATE TRIGGER IF NOT EXISTS inventory_catalog_events_immutable_delete
BEFORE DELETE ON inventory_catalog_events BEGIN SELECT RAISE(ABORT, 'inventory catalog history is immutable'); END;
CREATE TRIGGER IF NOT EXISTS inventory_corrections_immutable_update
BEFORE UPDATE ON inventory_corrections BEGIN SELECT RAISE(ABORT, 'inventory corrections are immutable'); END;
CREATE TRIGGER IF NOT EXISTS inventory_corrections_immutable_delete
BEFORE DELETE ON inventory_corrections BEGIN SELECT RAISE(ABORT, 'inventory corrections are immutable'); END;
CREATE TRIGGER IF NOT EXISTS inventory_operations_immutable_update
BEFORE UPDATE ON inventory_operations BEGIN SELECT RAISE(ABORT, 'inventory operations are immutable'); END;
CREATE TRIGGER IF NOT EXISTS inventory_operations_immutable_delete
BEFORE DELETE ON inventory_operations BEGIN SELECT RAISE(ABORT, 'inventory operations are immutable'); END;

CREATE TRIGGER IF NOT EXISTS inventory_count_finalize_validate
BEFORE UPDATE OF status ON inventory_counts
WHEN OLD.status = 'draft' AND NEW.status = 'finalized'
BEGIN
  SELECT CASE WHEN (SELECT active FROM inventory_storage_locations WHERE id = NEW.location_id) <> 1
    THEN RAISE(ABORT, 'inventory counts require an active storage location') END;
  SELECT CASE WHEN NEW.location_version_snapshot <> (SELECT inventory_version FROM inventory_storage_locations WHERE id = NEW.location_id)
    THEN RAISE(ABORT, 'inventory count snapshot is stale; refresh it before finalizing') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM inventory_count_lines WHERE count_id = NEW.id AND counted_quantity IS NULL)
    THEN RAISE(ABORT, 'all inventory count quantities must be entered') END;
END;
CREATE TRIGGER IF NOT EXISTS inventory_count_finalize_apply
AFTER UPDATE OF status ON inventory_counts
WHEN OLD.status = 'draft' AND NEW.status = 'finalized'
BEGIN
  INSERT INTO inventory_operations(request_id, operation_type, item_id, source_location_id, quantity_delta, expected_source_version, reason, actor_email, created_at)
  SELECT 'inventory-count:' || NEW.id || ':' || line.item_id,
    'count_adjustment', line.item_id, NEW.location_id,
    line.counted_quantity - line.expected_quantity,
    stock.version,
    'Фактичний перерахунок запасу', NEW.finalized_by_email, COALESCE(NEW.finalized_at, CURRENT_TIMESTAMP)
  FROM inventory_count_lines line
  JOIN inventory_item_stocks stock ON stock.item_id = line.item_id AND stock.location_id = NEW.location_id
  WHERE line.count_id = NEW.id AND line.counted_quantity <> line.expected_quantity;
END;
CREATE TRIGGER IF NOT EXISTS inventory_finalized_count_immutable
BEFORE UPDATE ON inventory_count_lines
WHEN (SELECT status FROM inventory_counts WHERE id = OLD.count_id) = 'finalized'
BEGIN SELECT RAISE(ABORT, 'finalized inventory counts are immutable'); END;
CREATE TRIGGER IF NOT EXISTS inventory_finalized_count_no_insert
BEFORE INSERT ON inventory_count_lines
WHEN (SELECT status FROM inventory_counts WHERE id = NEW.count_id) = 'finalized'
BEGIN SELECT RAISE(ABORT, 'finalized inventory counts are immutable'); END;
CREATE TRIGGER IF NOT EXISTS inventory_finalized_count_no_delete
BEFORE DELETE ON inventory_count_lines
WHEN (SELECT status FROM inventory_counts WHERE id = OLD.count_id) = 'finalized'
BEGIN SELECT RAISE(ABORT, 'finalized inventory counts are immutable'); END;
CREATE TRIGGER IF NOT EXISTS inventory_finalized_header_immutable
BEFORE UPDATE ON inventory_counts
WHEN OLD.status = 'finalized'
BEGIN SELECT RAISE(ABORT, 'finalized inventory counts are immutable'); END;
CREATE TRIGGER IF NOT EXISTS inventory_count_no_delete_finalized
BEFORE DELETE ON inventory_counts
WHEN OLD.status = 'finalized'
BEGIN SELECT RAISE(ABORT, 'finalized inventory counts cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS inventory_count_finalize_event
AFTER UPDATE OF status ON inventory_counts
WHEN OLD.status = 'draft' AND NEW.status = 'finalized'
BEGIN
  INSERT INTO inventory_count_events(count_id, action, details, actor_email, created_at)
  VALUES(NEW.id, 'finalized', 'Count finalized and stock reconciled', NEW.finalized_by_email, COALESCE(NEW.finalized_at, CURRENT_TIMESTAMP));
END;
CREATE TRIGGER IF NOT EXISTS inventory_count_events_immutable_update
BEFORE UPDATE ON inventory_count_events BEGIN SELECT RAISE(ABORT, 'inventory count history is immutable'); END;
CREATE TRIGGER IF NOT EXISTS inventory_count_events_immutable_delete
BEFORE DELETE ON inventory_count_events BEGIN SELECT RAISE(ABORT, 'inventory count history is immutable'); END;

-- Existing stock rows start at the same balance as the retained legacy table;
-- historical movement imports above are informational and are not replayed.
