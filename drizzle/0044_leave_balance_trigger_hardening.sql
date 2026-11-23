DROP TRIGGER leave_request_approved_insert;
DROP TRIGGER leave_request_approved_update;
DROP TRIGGER leave_request_withdrawn_update;

CREATE TRIGGER leave_request_approved_insert AFTER INSERT ON leave_requests
WHEN NEW.status='approved' AND EXISTS (SELECT 1 FROM leave_types WHERE id=NEW.leave_type_id AND code<>'unpaid')
BEGIN
  INSERT INTO leave_balances(employee_id,leave_type_id,year,allowance,used,adjustment)
  SELECT NEW.employee_id,NEW.leave_type_id,CAST(substr(NEW.start_date,1,4) AS INTEGER),default_allowance,0,0 FROM leave_types WHERE id=NEW.leave_type_id
  ON CONFLICT(employee_id,leave_type_id,year) DO NOTHING;
  INSERT OR IGNORE INTO leave_ledger(employee_id,leave_type_id,year,delta,event_type,source_request_id,note,actor_email)
  VALUES(NEW.employee_id,NEW.leave_type_id,CAST(substr(NEW.start_date,1,4) AS INTEGER),NEW.days,'request_approved',NEW.id,'Approved automatically',COALESCE(NEW.reviewer_email,'system@incora-people.local'));
  UPDATE leave_balances SET used=COALESCE((SELECT SUM(delta) FROM leave_ledger WHERE employee_id=NEW.employee_id AND leave_type_id=NEW.leave_type_id AND year=CAST(substr(NEW.start_date,1,4) AS INTEGER)),0),updated_at=CURRENT_TIMESTAMP
  WHERE employee_id=NEW.employee_id AND leave_type_id=NEW.leave_type_id AND year=CAST(substr(NEW.start_date,1,4) AS INTEGER);
END;

CREATE TRIGGER leave_request_approved_update AFTER UPDATE OF status ON leave_requests
WHEN OLD.status<>'approved' AND NEW.status='approved' AND EXISTS (SELECT 1 FROM leave_types WHERE id=NEW.leave_type_id AND code<>'unpaid')
BEGIN
  INSERT INTO leave_balances(employee_id,leave_type_id,year,allowance,used,adjustment)
  SELECT NEW.employee_id,NEW.leave_type_id,CAST(substr(NEW.start_date,1,4) AS INTEGER),default_allowance,0,0 FROM leave_types WHERE id=NEW.leave_type_id
  ON CONFLICT(employee_id,leave_type_id,year) DO NOTHING;
  INSERT OR IGNORE INTO leave_ledger(employee_id,leave_type_id,year,delta,event_type,source_request_id,note,actor_email)
  VALUES(NEW.employee_id,NEW.leave_type_id,CAST(substr(NEW.start_date,1,4) AS INTEGER),NEW.days,'request_approved',NEW.id,'Request approved',COALESCE(NEW.reviewer_email,'system@incora-people.local'));
  UPDATE leave_balances SET used=COALESCE((SELECT SUM(delta) FROM leave_ledger WHERE employee_id=NEW.employee_id AND leave_type_id=NEW.leave_type_id AND year=CAST(substr(NEW.start_date,1,4) AS INTEGER)),0),updated_at=CURRENT_TIMESTAMP
  WHERE employee_id=NEW.employee_id AND leave_type_id=NEW.leave_type_id AND year=CAST(substr(NEW.start_date,1,4) AS INTEGER);
END;

CREATE TRIGGER leave_request_withdrawn_update AFTER UPDATE OF status ON leave_requests
WHEN OLD.status='approved' AND NEW.status='withdrawn' AND EXISTS (SELECT 1 FROM leave_types WHERE id=NEW.leave_type_id AND code<>'unpaid')
BEGIN
  INSERT OR IGNORE INTO leave_ledger(employee_id,leave_type_id,year,delta,event_type,source_request_id,note,actor_email)
  VALUES(NEW.employee_id,NEW.leave_type_id,CAST(substr(NEW.start_date,1,4) AS INTEGER),-NEW.days,'request_withdrawn',NEW.id,'Approved request withdrawn',COALESCE(NEW.reviewer_email,'system@incora-people.local'));
  UPDATE leave_balances SET used=MAX(0,COALESCE((SELECT SUM(delta) FROM leave_ledger WHERE employee_id=NEW.employee_id AND leave_type_id=NEW.leave_type_id AND year=CAST(substr(NEW.start_date,1,4) AS INTEGER)),0)),updated_at=CURRENT_TIMESTAMP
  WHERE employee_id=NEW.employee_id AND leave_type_id=NEW.leave_type_id AND year=CAST(substr(NEW.start_date,1,4) AS INTEGER);
END;
