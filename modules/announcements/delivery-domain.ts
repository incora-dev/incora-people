/** Re-enqueueing can update a pending schedule or retry a failed row, but can
 * never make a provider-accepted or ambiguous delivery pending again. */
export const ENQUEUE_ANNOUNCEMENT_DELIVERY_SQL = `
  INSERT INTO announcement_deliveries
    (announcement_id, channel, scheduled_for, status, attempts, last_error, sent_at)
  VALUES (?, ?, ?, 'pending', 0, '', NULL)
  ON CONFLICT(announcement_id, channel) DO UPDATE SET
    scheduled_for = excluded.scheduled_for,
    status = CASE
      WHEN announcement_deliveries.status IN ('failed', 'skipped') THEN 'pending'
      ELSE announcement_deliveries.status
    END,
    attempts = CASE
      WHEN announcement_deliveries.status IN ('failed', 'skipped') THEN 0
      ELSE announcement_deliveries.attempts
    END,
    last_error = CASE
      WHEN announcement_deliveries.status IN ('failed', 'skipped') THEN ''
      ELSE announcement_deliveries.last_error
    END,
    sent_at = CASE
      WHEN announcement_deliveries.status IN ('failed', 'skipped') THEN NULL
      ELSE announcement_deliveries.sent_at
    END
  WHERE announcement_deliveries.status <> 'sent'
`;

/** A row is auto-claimed at most once. If the worker crashes or a provider
 * outcome is ambiguous after this claim, it must be reconciled before a human
 * explicitly retries it; provider idempotency keys have a limited lifetime. */
export const CLAIM_ANNOUNCEMENT_DELIVERY_SQL = `
  UPDATE announcement_deliveries
     SET attempts = attempts + 1
   WHERE id = ? AND status = 'pending' AND attempts = ? AND attempts = 0
`;
