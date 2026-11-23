-- Query-supporting indexes and bounded list surfaces. Full exports/backups
-- intentionally remain unbounded because they are explicit admin operations.
CREATE INDEX IF NOT EXISTS people_tasks_assignee_status_due_idx
  ON people_tasks(assignee_employee_id, status, due_date, id);
CREATE INDEX IF NOT EXISTS announcement_poll_responses_poll_created_idx
  ON announcement_poll_responses(poll_id, created_at, id);
CREATE INDEX IF NOT EXISTS audit_events_created_id_idx
  ON audit_events(created_at, id);
CREATE INDEX IF NOT EXISTS reimbursement_requests_employee_date_idx
  ON reimbursement_requests(employee_id, expense_date, id);
