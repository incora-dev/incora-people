-- Immutable totals captured when a timesheet period is locked or approved.
-- Live entries remain available for audit, while the approved totals no longer
-- drift if an administrative repair changes a historical row.
ALTER TABLE timesheet_periods ADD COLUMN snapshot_worked_minutes INTEGER;
ALTER TABLE timesheet_periods ADD COLUMN snapshot_expected_minutes INTEGER;
ALTER TABLE timesheet_periods ADD COLUMN snapshot_overtime_minutes INTEGER;
ALTER TABLE timesheet_periods ADD COLUMN snapshot_captured_at TEXT;
