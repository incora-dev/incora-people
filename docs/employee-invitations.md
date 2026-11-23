> Historical source note. Start with [START_HERE](../START_HERE.md) for verified handoff instructions. Treat commands and release claims below as historical.

# Employee email invitations

Employee invitations notify an existing employee-linked account that INCORA People access is available. They do not create an account, activate a disabled account, authenticate the recipient, or replace Google OAuth. The employee must sign in through the existing Google flow with the exact normalized work email already linked to the enabled account.

## Delivery configuration

The application uses a dedicated Resend adapter for invitations. The existing announcement webhook is not reused: it has no provider message identifier or idempotency contract for safe reconciliation.

Before enabling live delivery, INCORA must:

1. Verify an INCORA-controlled sender domain and sender address in Resend.
2. Configure the canonical HTTPS application origin as `PUBLIC_APP_URL`.
3. Set `INVITATION_FROM_EMAIL` to that verified sender.
4. Store `RESEND_API_KEY` as a Cloudflare Worker secret (`npx wrangler secret put RESEND_API_KEY`); for local development, keep it only in ignored `.dev.vars`.
5. Confirm the existing Google OAuth configuration is active (`AUTH_PROVIDER=google` plus the existing Google client and auth secrets).
6. Set `EMPLOYEE_INVITATIONS_ENABLED=true` only after the provider, sender, application URL, and Google login flow are ready.

The flag defaults to false. The API key is never emitted into the browser bundle or the generated Wrangler `vars` block. Protected mode rejects non-HTTPS, localhost, IP-literal, reserved/example, credential-bearing, query-bearing, and path-based application URLs. A provider accepting a request means it accepted the message for sending; it does not prove delivery or employee acceptance.

## Behavior and safeguards

- Eligible targets are an enabled, non-terminated employee and exactly one linked, non-protected employee/manager/HR account whose normalized email matches the employee work email.
- HR users with the existing `managePeople` permission can send. Preview sessions are rejected server-side.
- Employee creation succeeds independently of optional invitation delivery.
- Delivery attempts are retained with actor, target, request, status, and provider acceptance/failure information. They contain no credentials or OAuth tokens.
- Sending is rate-limited to one attempt per employee per minute, five per employee per hour, and thirty per actor per hour. Provider retries reuse the same idempotency key and stored payload. An uncertain result is only retried inside a 23-hour safety window; after that, an operator must reconcile the provider result before a new invitation can be created.
- “Accepted by email provider” is distinct from delivery and login activity. Newly tracked account creation time distinguishes future “not signed in yet” accounts. Existing accounts are not backfilled; their historical login state remains “unknown” until a successful login is recorded.
- Successful admitted web Google OAuth sessions and successful mobile/extension OAuth code exchanges update `last_login_at`. Refreshing a session does not update it.

## Schema

Runtime migration `0071_employee_invitations.sql` adds nullable `users.created_at` and `users.last_login_at`, a creation-time trigger for new accounts, and append-only `employee_invitation_attempts` with constrained state transitions, open-attempt uniqueness, and retained audit history. Existing login/session and employee records are not rewritten. `drizzle/0074_employee_invitations.sql` is the schema mirror; runtime deployments apply the canonical `migrations/` chain.

## Local verification

Provider tests use synthetic addresses and a fake HTTP response only. They do not send mail. End-to-end provider checks require an isolated test account and a provider-controlled test recipient; never use production employee mailboxes for local testing.
