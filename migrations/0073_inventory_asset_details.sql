-- Asset details on office inventory items, so laptops, monitors and other
-- equipment carry their serial number, characteristics and holder. Additive
-- only: existing items keep their values and receive empty defaults.
-- assignee_name holds a holder imported from the asset register who does not
-- match an employee record; assigned_employee_id is the source of truth when
-- a match exists. Price, serial number and repair history are private to
-- inventory managers (enforced in the application).

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
