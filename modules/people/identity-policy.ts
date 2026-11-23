export function normalizeVerifiedGoogleIdentity(input: {
  email?: unknown;
  email_verified?: unknown;
  sub?: unknown;
}) {
  if (
    input.email_verified !== true ||
    typeof input.email !== "string" ||
    typeof input.sub !== "string"
  ) {
    return null;
  }
  const email = input.email.trim().toLowerCase();
  const subject = input.sub.trim();
  return email && subject ? { email, subject } : null;
}

export function uniqueNormalizedEmailMatch<T extends { email: string }>(
  email: string,
  candidates: readonly T[],
) {
  const normalizedEmail = normalizeEmailValue(email);
  const matches = candidates.filter(
    (candidate) => normalizeEmailValue(candidate.email) === normalizedEmail,
  );
  return matches.length === 1 ? matches[0] : null;
}

export function isLoginAccountEligible(account: {
  enabled: boolean;
  employeeStatus: string | null;
}) {
  return account.enabled && account.employeeStatus !== "inactive";
}

export function canManageSystemAccess(role: string, manageSettings: boolean) {
  return role === "super_admin" && manageSettings;
}

export function isSelfAccount(
  actorUserId: number | null,
  targetUserId: number,
) {
  return actorUserId !== null && actorUserId === targetUserId;
}

export function accountAccessRevocationStatements(
  userId: number,
  timestamp: string,
) {
  return [
    {
      sql: "UPDATE web_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL",
      values: [timestamp, userId],
    },
    {
      sql: "UPDATE client_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL",
      values: [timestamp, userId],
    },
    {
      sql: "UPDATE client_session_refresh_tokens SET revoked_at=? WHERE session_id IN (SELECT id FROM client_sessions WHERE user_id=?) AND revoked_at IS NULL",
      values: [timestamp, userId],
    },
    {
      sql: "DELETE FROM oauth_authorization_codes WHERE user_id=?",
      values: [userId],
    },
    {
      sql: "DELETE FROM mobile_push_tokens WHERE user_id=?",
      values: [userId],
    },
  ];
}

function normalizeEmailValue(value: string) {
  return value.trim().toLowerCase();
}
