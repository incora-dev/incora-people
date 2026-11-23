-- A time-entry edit must not strand child breaks outside the new interval.
-- The command layer may explicitly reconcile breaks before editing; direct SQL
-- writes fail closed instead of creating impossible time data.
CREATE TRIGGER IF NOT EXISTS time_entry_break_bounds_update_guard
BEFORE UPDATE OF clock_in, clock_out ON time_entries
WHEN EXISTS (
  SELECT 1
  FROM break_entries break
  WHERE break.time_entry_id = NEW.id
    AND (
      break.started_at < NEW.clock_in
      OR (
        NEW.clock_out IS NOT NULL
        AND (
          break.ended_at IS NULL
          OR break.ended_at > NEW.clock_out
        )
      )
    )
)
BEGIN
  SELECT RAISE(ABORT, 'time_entry_break_outside_interval');
END;
