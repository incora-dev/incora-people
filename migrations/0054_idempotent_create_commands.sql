-- Optional client idempotency keys prevent duplicate create commands after
-- network retries. NULL remains allowed for older clients.
ALTER TABLE reimbursement_requests ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS reimbursement_requests_employee_idempotency_unique
  ON reimbursement_requests(employee_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE time_entries ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS time_entries_employee_idempotency_unique
  ON time_entries(employee_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE leave_requests ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS leave_requests_employee_idempotency_unique
  ON leave_requests(employee_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
