> Historical source note. Start with [START_HERE](../START_HERE.md) for verified handoff instructions. Treat commands and release claims below as historical.

# INCORA People platform test report

Date: 2026-07-27  
Scope: web application, Cloudflare Worker/D1 integration, role workflows,
Chrome extension package, mobile source, security controls and controlled load.

## Executive result

The stabilization sprint closed every code-level release blocker found in the
initial audit. Web, Android and iOS sources now build reproducibly; the quality
gate and production audits are green; extension access is pinned and
least-privileged; and concurrent timer commands are deterministic. The platform
is a **release candidate** pending authenticated staging load and physical-device
UAT.

## Second-wave QA/AQA and CTO verification

The client-specific audit added executable extension authentication tests and
repeated native bundling after the fixes. A final Mobile 1.0 pass then added the
remaining employee modules, role-aware mobile administration and push
infrastructure.

- 52/52 automated tests pass. Two tests execute extension sign-in storage,
  refresh-only browser restart, concurrent refresh serialization and logout
  revocation; the Mobile 1.0 structural test covers its screens, API routes,
  migrations, push registration and Android notification asset.
- Expo Doctor passes 19/19 applicable checks.
- Android and iOS Hermes production exports pass after adding the OAuth callback
  route, global session guard, required native dependencies and the complete
  Mobile 1.0 route set.
- Android release configuration no longer signs with the debug key.
- The Android push icon is a dedicated monochrome mask; launcher and splash
  assets remain fully branded.
- A full PKCE mobile session was exercised against the rebuilt local Worker:
  13 authenticated Mobile API GET routes and push-token registration/removal
  returned HTTP 200, revocation returned HTTP 200, and reuse after revocation
  returned HTTP 401.
- Ten authenticated responsive web routes were checked at a 390×844-class
  viewport: none had horizontal overflow or broken images.
- Nine authenticated web routes were checked at a 360 px viewport: no horizontal
  overflow, broken images, unnamed controls or visible error states.
- Leave `Requests` and `Approvals` tabs were clicked and verified to select and
  render distinct tab panels.
- Controlled Cloudflare load remained correct at 10, 25 and 50 concurrent
  clients:
  - `/login`: 340/340 HTTP 200, peak run 171.6 requests/s, 50-client p95 444 ms;
  - `/api/me`: 340/340 expected HTTP 401, peak run 309.7 requests/s,
    50-client p95 457 ms.
- Invalid OAuth redirect and refresh token requests returned 400/401; a foreign
  web origin received no CORS grant; the pinned extension origin received the
  expected preflight response.
- Local system startup now uses the same persisted D1 directory as migration and
  seed commands. After restart, primary pages and `/api/me` returned HTTP 200.

### New operational finding: local SSR is not load-safe

The laptop-hosted Wrangler server served API load successfully, but SSR page
load at 10 concurrent clients produced timeouts and one 500, then Wrangler
restarted. At 25 and 50 concurrent SSR clients the run could not complete.
Cloudflare production did not reproduce this behavior.

The local tunnel is therefore suitable for demos and low-volume fallback access,
not as a multi-user production server. Cloudflare remains the supported
deployment target. The external localhost.run tunnel also returned an empty
reply during this run even though both local services were active.

## Stabilization verification

- 52/52 automated tests pass, including migration and role-workflow integration
  tests.
- ESLint, Prettier and both web and mobile TypeScript checks pass.
- Web production build succeeds with 103 API routes.
- Android and iOS Hermes bundles export successfully from Expo SDK 57.
- Root and mobile production dependency audits report 0 known vulnerabilities.
- Chrome extension has a deterministic signed manifest ID; Worker CORS accepts
  only that ID, and extension bearer sessions are server-scoped to Time status,
  clock-in and clock-out.
- Browser mutations reject cross-site Origin/Sec-Fetch-Site requests, and
  authentication endpoints have burst limiting.
- Local migration, seed and production start use the same persistent D1 state.
- Twenty concurrent explicit clock-ins produced 1 `started` and 19
  `already_running` responses; twenty clock-outs produced 1 `stopped` and 19
  `already_stopped` responses, with no 409 or 500.
- The previously missing calendar label and Roadmap heading-order issue are
  corrected.

## Test evidence

### Passed

- Production build completed with all 101 API routes.
- TypeScript typecheck passed.
- 51 automated domain, migration, structure, client-auth and integration tests
  passed.
- D1 production migration history builds a constrained database.
- After applying migrations to the correct local persistence directory, 10
  primary pages and 3 API endpoints returned HTTP 200.
- Employee and manager identities were simulated against the same local D1:
  - employee created a leave request;
  - employee could not approve it (HTTP 403);
  - the direct manager approved it (HTTP 200);
  - the employee received the completion notification.
- Twelve concurrent manager approvals produced exactly one HTTP 200 and eleven
  HTTP 409 responses, with no 5xx result.
- Unauthenticated production endpoints fail closed with HTTP 401.
- Invalid client OAuth redirect URI is rejected with HTTP 400.
- Chrome-extension CORS is not granted to a normal web origin.
- Extension ZIP integrity and JavaScript syntax checks passed.
- Production response security headers include HSTS, frame denial, MIME
  sniffing protection, referrer policy and restricted device permissions.
- Production login page at a 390×844 viewport had no horizontal overflow.
- A static accessibility scan of 10 authenticated SSR pages found no unnamed
  interactive elements, missing image alt text or duplicate IDs.
- Controlled unauthenticated production load:
  - `/login`: 200 requests, concurrency 20, 126.4 requests/s, p95 435.6 ms,
    zero unexpected statuses;
  - `/api/me`: 200 requests, concurrency 20, 146.7 requests/s, p95 219 ms,
    all requests correctly returned HTTP 401.
- Sampled production Worker logs showed successful execution and expected 401
  outcomes, not Worker exceptions.

## Initial findings — resolved by the stabilization sprint

The descriptions below preserve the original failure evidence; each item is now
closed by the verification listed above.

### Resolved: mobile project could not be installed

`npm install --prefix apps/mobile` fails because
`expo-crypto@~57.0.3` does not exist in the configured registry. The mobile
project also has no lockfile, so dependency resolution is not reproducible.
Native Android and iOS builds cannot currently be certified.

### Resolved: Chrome-extension sessions were over-privileged

The server accepts any syntactically valid Chromium extension ID, and client
sessions carry only `clientType`, not an API scope. A Chrome-extension token can
therefore call the broader mobile `/api/v1` surface according to the user's
role, although the extension product is intended to have Time access only.
Pin the official extension ID and enforce a `time:read time:write` scope on the
server.

### Resolved: timer toggle was not concurrency-safe

Twenty concurrent local timer toggles resulted in:

- 3 × HTTP 201;
- 2 × HTTP 200;
- 14 × HTTP 409;
- 1 × HTTP 500.

The toggle operation can alternate between clock-in and clock-out when requests
from multiple tabs or clients overlap. Replace toggle semantics with explicit,
idempotent clock-in/clock-out commands and an idempotency key stored in D1.

### Resolved: production dependency vulnerability

`npm audit --omit=dev` reports two high-severity findings caused by the
`postcss` override at 8.5.14 (GHSA-r28c-9q8g-f849). Upgrade PostCSS to a
non-vulnerable compatible version and rerun the build and audit.

### Resolved: documented local database setup was broken

The documented `db:migrate:local:built` command writes local D1 state below the
generated `dist/server` directory, while `npm run dev` reads the repository
`.wrangler/state`. A clean documented startup therefore returns HTTP 500 with
`no such table: users`. The migration and seed scripts must pass one explicit,
shared `--persist-to` directory.

### Resolved: `npm start` did not start the production build

`vinext start` fails with `ERR_UNSUPPORTED_ESM_URL_SCHEME` for
`cloudflare:` imports. The supported local production command is currently
Wrangler against `dist/server/wrangler.json`; package scripts and documentation
need to reflect that.

### Resolved: repository quality gate failed

- ESLint: 12 errors and 1 warning, concentrated in mobile effects and one
  accessibility issue.
- Prettier: 3 files fail formatting.

The build succeeds because it does not enforce the complete quality gate.

### Medium: local SSR saturates under concurrency

The local Wrangler production build returned 32 HTTP 500 responses out of 250
home-page requests at concurrency 20. Local runtime throughput is not a Cloudflare
capacity benchmark, but the result demonstrates missing graceful overload
behaviour and makes an authenticated staging load test necessary.

### Resolved: missing baseline abuse and CSRF controls

No application rate limiter was found for OAuth, token or mutating APIs. Web
mutation routes rely on SameSite cookies without an explicit Origin/CSRF check.
This is especially relevant when deployments use a shared platform-owned parent domain.

### Resolved: accessibility structure

- `/calendar` contains one server-rendered select without an accessible label.
- `/roadmap` skips from `h1` to `h3`.

## Limits of this run

- No destructive or high-volume authenticated load was sent to production.
- Google login and the extension callback require a real interactive Google
  account and were not automated.
- Native Android/iOS bundles were validated, but physical-device UAT is still
  required.
- Authenticated full-page visual regression remains a staging/UAT task.

## Recommended release order

1. Publish this stabilized build to the existing Sites project.
2. Run authenticated staging load with synthetic 10/25/50-user ramps.
3. Complete Google OAuth, extension callback and physical Android/iOS UAT.
4. Pilot with a small internal cohort and monitor Worker errors and D1 latency.
