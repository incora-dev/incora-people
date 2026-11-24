/**
 * A profile becomes active only after the person has been invited to the
 * system: an invitation attempt the email provider accepted ('sent'). Signing
 * in without an invitation does not activate the profile.
 *
 * Accounts that can never receive an invitation (Super Admin and protected
 * administrator accounts, see invitationEligibilityCode) are always active.
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
    SELECT 1 FROM users admin_account
     WHERE admin_account.employee_id = ${employeeIdColumn}
       AND (
         admin_account.role NOT IN ('employee', 'manager', 'hr_admin')
         OR EXISTS (
           SELECT 1 FROM protected_admin_accounts protected
            WHERE protected.user_id = admin_account.id
         )
       )
  ))`;
}
