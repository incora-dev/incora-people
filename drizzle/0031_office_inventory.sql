CREATE TABLE IF NOT EXISTS office_inventory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'other',
  quantity INTEGER NOT NULL DEFAULT 0,
  minimum_quantity INTEGER NOT NULL DEFAULT 0,
  serial_number TEXT NOT NULL DEFAULT '',
  storage_location TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT office_inventory_items_kind_check CHECK (kind IN ('office_equipment', 'merchandise')),
  CONSTRAINT office_inventory_items_quantity_check CHECK (quantity >= 0),
  CONSTRAINT office_inventory_items_minimum_quantity_check CHECK (minimum_quantity >= 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS office_inventory_items_kind_name_idx ON office_inventory_items (kind, name);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS office_inventory_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  item_id INTEGER NOT NULL REFERENCES office_inventory_items(id),
  quantity_before INTEGER NOT NULL,
  quantity_after INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT 'manual_adjustment',
  note TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS office_inventory_movements_item_created_idx ON office_inventory_movements (item_id, created_at);
