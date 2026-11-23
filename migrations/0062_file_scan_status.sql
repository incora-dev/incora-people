-- Optional R2 malware-scanning lifecycle.
-- Uploads stay private and are marked unscanned until an external scanner
-- calls the signed internal callback. Existing deployments can roll this out
-- with FILES_REQUIRE_SCAN=false, then scan and promote existing objects before
-- enabling enforcement.
ALTER TABLE stored_files ADD COLUMN scan_status TEXT NOT NULL DEFAULT 'unscanned'
  CHECK (scan_status IN ('unscanned', 'clean', 'quarantined', 'failed'));
ALTER TABLE stored_files ADD COLUMN scanned_at TEXT;
ALTER TABLE stored_files ADD COLUMN scan_provider TEXT;
ALTER TABLE stored_files ADD COLUMN scan_error TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS stored_files_scan_status_idx
  ON stored_files(scan_status, created_at);
