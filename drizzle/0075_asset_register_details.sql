-- Mirror of migrations/0072_asset_register_details.sql.
-- Runtime D1 migration ordering is defined by /migrations.
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
