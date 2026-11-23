> Historical source note. Start with [START_HERE](../START_HERE.md) for verified handoff instructions. Treat commands and release claims below as historical.

# INCORA People architecture

## Decision

INCORA People is a **modular monolith** deployed as one Cloudflare Worker with
one D1 database. That is the right operational shape for the current team and
traffic: one deployment, no distributed transactions, and clear module
boundaries that can later be extracted only when there is evidence to do so.

## Runtime shape

```text
Browser
  → Google OAuth session or Cloudflare Access (protected mode)
  → vinext / React Server Components
  → route handlers and server data queries
  → Drizzle ORM → Cloudflare D1
  → private file service → Cloudflare R2
```

The public alpha uses explicit `APP_MODE=demo`. It is intentionally a shared
super-administrator demo identity and must contain demo data only. Production
must use `APP_MODE=protected` with either a verified direct Google OAuth session
or a Cloudflare Access JWT.

## Source layout and dependency rule

- `app/`: pages and HTTP adapters. Authorization is enforced again in every
  mutating or sensitive route.
- `components/`: presentation and browser interaction, grouped by feature for
  complex workspaces. Client components
  receive purpose-built DTOs, never entire database rows by default.
- `modules/<capability>/`: DTO contracts, domain rules, query modules and
  command services for People, Leave, Time, Reimbursements, Tasks and
  administration.
- `lib/`: runtime integrations and thin compatibility facades only.
- `db/schema.ts`: typed schema used by application code.
- `migrations/`: the only production schema history consumed by Wrangler.
- `db/demo-seed.sql`: explicit, opt-in demo data; never executed by a request.

Dependencies should point inward: UI/HTTP → module rules → persistence
adapters. Domain functions must not import React or request objects.

## Data and migration policy

1. Every schema change gets a new immutable SQL file in `migrations/`.
2. `npm run db:generate:draft` may create a Drizzle draft in `drizzle/`; it is
   not deployed until reviewed and promoted into the production migration
   history.
3. CI/deploy runs quality checks and a build before applying remote migrations.
4. Demo seeding is a separate command and is never part of deployment.
5. Uniqueness constraints protect concurrency invariants such as one open timer
   per employee and one open break per timer.

## Security boundaries

- Protected identity comes only from a verified Google OAuth session or a
  verified Cloudflare Access JWT. The Worker verifies a Google session before
  any protected page or API route reaches application data queries.
- Google authentication verifies identity; roles are assigned only from the
  application database and never inferred from an email domain.
- `person023@example.test`, `person005@example.test`,
  `person012@example.test` and `person003@example.test` are pre-provisioned, protected
  super-administrator identities.
- Unknown, disabled or terminated users fail closed at admission and never
  receive an unlinked employee identity.
- Authorization comes from editable access policies, plus ownership/direct
  manager scope where relevant.
- Employee directory DTOs exclude private HR fields. Sensitive profile data is
  fetched and rendered only for self, the permitted manager, or HR.
- API responses are non-cacheable and the Worker applies baseline security
  headers.
- The demo deployment is not suitable for real employee or receipt data.

## Consistency model

D1 uniqueness constraints and conditional updates prevent duplicate timer
starts, double approval decisions and duplicate monthly timesheet periods.
Locked periods are checked again by every time mutation endpoint. Asset
assignments and approval-based time corrections use D1 batches to commit their
state transition, history and audit intent together. Push notifications are
queued in a D1-backed outbox so delivery can be retried separately from the
committed state; all create commands accept idempotency keys.

## Deliberate next boundaries

- File hardening: the private R2-backed document service records an explicit
  `unscanned`/`clean`/`quarantined`/`failed` lifecycle and exposes a signed
  scanner callback; enabling `FILES_REQUIRE_SCAN` blocks unclean files. R2
  retention, external scanner provisioning and download telemetry remain
  operational follow-up work.
- Background work: the current D1 outbox/Cron consumer covers push delivery;
  email/Google Chat delivery and reminders need an explicit provider/queue
  contract before enabling them in production.
- Tests: D1 integration tests for authorization and concurrent state changes,
  then Playwright smoke tests for critical employee/manager/HR paths.
- Observability: structured request IDs, error tracking and alerts.
- Recovery: scheduled D1/R2 snapshots and quarterly restore tests. The current
  manual export and R2-key manifest are documented in
  `docs/backup-recovery-ua.md`.

The administrator JSON export is a manual portability snapshot and R2-key
manifest, not yet a replacement for encrypted scheduled backups and a tested
restore procedure.

Do not split into microservices merely because the module count grows. Extract a
service only when independent scaling, ownership, security isolation or
deployment cadence clearly outweighs the distributed-system cost.

The planned Chrome timer extension and full Android/iOS client share this
backend through a versioned API rather than duplicating domain rules. Their
architecture, authentication model and private distribution plan are defined in
`docs/client-apps-architecture-ua.md`.
