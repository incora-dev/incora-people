/**
 * A profile becomes active only after the person has been invited to the
 * system: an invitation attempt the email provider accepted ('sent'). A
 * recorded sign-in also counts, so people who were already using the system
 * before invitations existed are not shown as awaiting an invitation.
 *
 * Kept as plain SQL without imports so the database integration tests can run
 * the exact predicate against the migrated schema.
 */
export function employeeInvitedSql(employeeIdColumn: string) {
  return `(EXISTS (
    SELECT 1 FROM employee_invitation_attempts invitation
     WHERE invitation.employee_id = ${employeeIdColumn}
       AND invitation.status = 'sent'
  ) OR EXISTS (
    SELECT 1 FROM users signed_in
     WHERE signed_in.employee_id = ${employeeIdColumn}
       AND signed_in.last_login_at IS NOT NULL
  ))`;
}
