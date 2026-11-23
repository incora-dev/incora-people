> Historical source note. Start with [START_HERE](../START_HERE.md) for verified handoff instructions. Treat commands and release claims below as historical.

# INCORA People MVP definition of done

Status: complete for the internal pilot.

The MVP is the smallest production-hosted INCORA People release that supports
the company's daily people operations. It is not full PeopleForce feature
parity; the product roadmap tracks that wider scope separately.

## Included and complete

- Google sign-in, 30-day protected sessions, logout and pre-provisioned roles.
- Four linked super administrator profiles for Demo Person 4, Demo Person 2,
  Demo Person 3 and Demo Person 1.
- Employee directory, profiles, CSV import, editable organization units and
  organization chart.
- Leave balances, requests, guarded approval transitions, company holidays,
  shared availability and export.
- Global time tracker, manual entries, team review, period locking and
  holiday-aware expected time.
- Reimbursement requests for sport, health, education and other, configurable
  policy limits, receipt files and scoped approvals.
- Editable roles and access, tasks, onboarding/offboarding, notifications,
  audit history, private employee documents and manual JSON recovery export.
- Cloud deployment, reviewed database migrations, automated lint, type checks,
  integration tests and production smoke checks.
- Ukrainian is the default interface language; each user can switch their
  personal preference to English.
- Employees can submit a private screenshot and description as a bug report;
  super administrators can resolve or reopen the ticket and the reporter is
  notified.

## Pilot acceptance

- Users can sign in with Google and only receive permissions from an existing
  INCORA People account.
- The four named super administrators can administer the workspace.
- A manager or administrator can complete the core leave, time and
  reimbursement workflows without database access.
- Private files are served through authorized application routes.
- MVP progress is shown consistently as 100% in the global header and roadmap.

## Explicitly post-MVP

- Scheduled backups, automated restore drills and external disaster recovery.
- Overnight shift edge cases, payroll codes and payroll/accounting exports.
- Google Chat notification delivery.
- Advanced recruitment, performance, engagement, case management and
  PeopleForce-equivalent analytics.
- Full browser-level role matrix and visual regression automation.

These exclusions do not block the internal pilot. They remain visible in the
full product roadmap, currently tracked separately from MVP completion.
