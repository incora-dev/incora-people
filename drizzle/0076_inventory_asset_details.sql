-- Mirror of migrations/0073_inventory_asset_details.sql.
-- Runtime D1 migration ordering is defined by /migrations.
ALTER TABLE inventory_items ADD COLUMN serial_number TEXT NOT NULL DEFAULT '';
ALTER TABLE inventory_items ADD COLUMN price TEXT NOT NULL DEFAULT '';
ALTER TABLE inventory_items ADD COLUMN division TEXT NOT NULL DEFAULT '';
ALTER TABLE inventory_items ADD COLUMN department TEXT NOT NULL DEFAULT '';
ALTER TABLE inventory_items ADD COLUMN warranty_ends TEXT;
ALTER TABLE inventory_items ADD COLUMN repair_history TEXT NOT NULL DEFAULT '';
ALTER TABLE inventory_items ADD COLUMN attributes_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE inventory_items ADD COLUMN assigned_employee_id INTEGER REFERENCES employees(id);
ALTER TABLE inventory_items ADD COLUMN assignee_name TEXT NOT NULL DEFAULT '';
ALTER TABLE inventory_items ADD COLUMN assigned_since TEXT;
CREATE INDEX IF NOT EXISTS inventory_items_assignee_idx ON inventory_items(assigned_employee_id);
