-- Database-level invariants for concurrent writes.
CREATE TRIGGER IF NOT EXISTS time_entries_no_overlap_insert
BEFORE INSERT ON time_entries
WHEN EXISTS (SELECT 1 FROM time_entries existing WHERE existing.employee_id = NEW.employee_id AND NOT (NEW.clock_out IS NULL AND existing.clock_out IS NULL) AND NEW.clock_in < COALESCE(existing.clock_out, '9999-12-31T23:59:59.999Z') AND existing.clock_in < COALESCE(NEW.clock_out, '9999-12-31T23:59:59.999Z'))
BEGIN SELECT RAISE(ABORT, 'time_entry_overlap'); END;
CREATE TRIGGER IF NOT EXISTS time_entries_no_overlap_update
BEFORE UPDATE OF employee_id, clock_in, clock_out ON time_entries
WHEN EXISTS (SELECT 1 FROM time_entries existing WHERE existing.id <> OLD.id AND existing.employee_id = NEW.employee_id AND NOT (NEW.clock_out IS NULL AND existing.clock_out IS NULL) AND NEW.clock_in < COALESCE(existing.clock_out, '9999-12-31T23:59:59.999Z') AND existing.clock_in < COALESCE(NEW.clock_out, '9999-12-31T23:59:59.999Z'))
BEGIN SELECT RAISE(ABORT, 'time_entry_overlap'); END;
CREATE TRIGGER IF NOT EXISTS break_entries_bounds_insert
BEFORE INSERT ON break_entries
WHEN NOT EXISTS (SELECT 1 FROM time_entries entry WHERE entry.id = NEW.time_entry_id AND NEW.started_at >= entry.clock_in AND (entry.clock_out IS NULL OR NEW.started_at < entry.clock_out) AND (NEW.ended_at IS NULL OR (NEW.ended_at > NEW.started_at AND (entry.clock_out IS NULL OR NEW.ended_at <= entry.clock_out))))
BEGIN SELECT RAISE(ABORT, 'break_outside_time_entry'); END;
CREATE TRIGGER IF NOT EXISTS break_entries_bounds_update
BEFORE UPDATE OF time_entry_id, started_at, ended_at ON break_entries
WHEN NOT EXISTS (SELECT 1 FROM time_entries entry WHERE entry.id = NEW.time_entry_id AND NEW.started_at >= entry.clock_in AND (entry.clock_out IS NULL OR NEW.started_at < entry.clock_out) AND (NEW.ended_at IS NULL OR (NEW.ended_at > NEW.started_at AND (entry.clock_out IS NULL OR NEW.ended_at <= entry.clock_out))))
BEGIN SELECT RAISE(ABORT, 'break_outside_time_entry'); END;
CREATE TRIGGER IF NOT EXISTS break_entries_no_overlap_insert
BEFORE INSERT ON break_entries
WHEN EXISTS (SELECT 1 FROM break_entries existing WHERE existing.time_entry_id = NEW.time_entry_id AND NEW.started_at < COALESCE(existing.ended_at, '9999-12-31T23:59:59.999Z') AND existing.started_at < COALESCE(NEW.ended_at, '9999-12-31T23:59:59.999Z'))
BEGIN SELECT RAISE(ABORT, 'break_overlap'); END;
CREATE TRIGGER IF NOT EXISTS break_entries_no_overlap_update
BEFORE UPDATE OF time_entry_id, started_at, ended_at ON break_entries
WHEN EXISTS (SELECT 1 FROM break_entries existing WHERE existing.id <> OLD.id AND existing.time_entry_id = NEW.time_entry_id AND NEW.started_at < COALESCE(existing.ended_at, '9999-12-31T23:59:59.999Z') AND existing.started_at < COALESCE(NEW.ended_at, '9999-12-31T23:59:59.999Z'))
BEGIN SELECT RAISE(ABORT, 'break_overlap'); END;
CREATE TRIGGER IF NOT EXISTS reimbursement_policy_limit_insert
BEFORE INSERT ON reimbursement_requests
WHEN NEW.status NOT IN ('rejected', 'withdrawn') AND EXISTS (SELECT 1 FROM reimbursement_policies policy WHERE policy.enabled = 1 AND ((SELECT count(*) FROM reimbursement_requests existing WHERE existing.employee_id = NEW.employee_id AND substr(existing.expense_date, 1, 4) = substr(NEW.expense_date, 1, 4) AND existing.status NOT IN ('rejected', 'withdrawn')) >= policy.max_requests_per_year OR (SELECT coalesce(sum(existing.amount_cents), 0) FROM reimbursement_requests existing WHERE existing.employee_id = NEW.employee_id AND substr(existing.expense_date, 1, 4) = substr(NEW.expense_date, 1, 4) AND existing.status NOT IN ('rejected', 'withdrawn')) + NEW.amount_cents > policy.annual_limit))
BEGIN SELECT RAISE(ABORT, 'reimbursement_policy_limit'); END;
CREATE TRIGGER IF NOT EXISTS reimbursement_policy_limit_update
BEFORE UPDATE OF employee_id, expense_date, amount_cents, status ON reimbursement_requests
WHEN NEW.status NOT IN ('rejected', 'withdrawn') AND EXISTS (SELECT 1 FROM reimbursement_policies policy WHERE policy.enabled = 1 AND ((SELECT count(*) FROM reimbursement_requests existing WHERE existing.id <> OLD.id AND existing.employee_id = NEW.employee_id AND substr(existing.expense_date, 1, 4) = substr(NEW.expense_date, 1, 4) AND existing.status NOT IN ('rejected', 'withdrawn')) >= policy.max_requests_per_year OR (SELECT coalesce(sum(existing.amount_cents), 0) FROM reimbursement_requests existing WHERE existing.id <> OLD.id AND existing.employee_id = NEW.employee_id AND substr(existing.expense_date, 1, 4) = substr(NEW.expense_date, 1, 4) AND existing.status NOT IN ('rejected', 'withdrawn')) + NEW.amount_cents > policy.annual_limit))
BEGIN SELECT RAISE(ABORT, 'reimbursement_policy_limit'); END;
