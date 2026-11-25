-- Asset register details for the company assets page. Additive only: existing
-- rows keep their values and receive empty defaults for the new fields.
-- assignee_name holds the holder's name from an imported register when it does
-- not match an employee record; assigned_employee_id stays the source of truth
-- whenever a match exists.

ALTER TABLE company_assets ADD COLUMN price TEXT NOT NULL DEFAULT '';
ALTER TABLE company_assets ADD COLUMN location TEXT NOT NULL DEFAULT '';
ALTER TABLE company_assets ADD COLUMN division TEXT NOT NULL DEFAULT '';
ALTER TABLE company_assets ADD COLUMN department TEXT NOT NULL DEFAULT '';
ALTER TABLE company_assets ADD COLUMN warranty_ends TEXT;
ALTER TABLE company_assets ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE company_assets ADD COLUMN repair_history TEXT NOT NULL DEFAULT '';
ALTER TABLE company_assets ADD COLUMN attributes_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE company_assets ADD COLUMN assigned_since TEXT;
ALTER TABLE company_assets ADD COLUMN assignee_name TEXT NOT NULL DEFAULT '';
