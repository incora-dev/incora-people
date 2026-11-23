# Verified architecture

INCORA People is a modular monolith: browser → one Worker → domain modules → D1 and R2. The Pages gateway is separate routing infrastructure, not a second application. See [production map](../infrastructure/PRODUCTION.md).

## Runtime and conventions

- npm lockfile at the root; Node minimum 22.13, verified on 22.22.2/npm 10.9.7. React and React DOM 19.2.8, RSC adapter 19.2.8, TypeScript 5.9.3, vinext 0.0.50, Vite 8.0.13, Cloudflare Vite plugin 1.37.1, Wrangler 4.92.0. The lockfile resolves Next 16.3.5; Next-compatible App Router APIs are implemented in the release through vinext, not a separate Next server.
- `app/` contains filesystem pages, RSC reads, layouts and `api/**/route.ts` HTTP adapters. Interactive client components live in `components/`, using typed DTOs and forms, fetch mutations and router refresh. Shared dialog/date/form controls live under `components/ui/`. Styles combine `app/globals.css` with utility styles and scoped CSS; CSS and components cover viewport responsiveness, not a native mobile release. Localization lives in `lib/i18n.ts` and server/client locale helpers.
- `worker/index.ts` handles request IDs, public paths, Google session gate, origin checks, extension CORS, View-as read-only enforcement, response security headers, images and scheduled execution; it delegates application routing to vinext. Do not treat the gateway or hidden UI as authorization.
- Domain persistence, authorization, calculations and side effects live in `modules/<domain>/`. API payload validation uses Zod; use existing `ApplicationError`/HTTP formats. `lib/` provides identity, privileges, runtime configuration and data facades. Request handlers and server queries each enforce relevant role, ownership and reporting scope.

## D1, R2 and data safety

D1 is SQLite under `DB`. Drizzle ORM 0.45.2 and Drizzle Kit 0.31.10 describe the data in `db/schema.ts`. Wrangler consumes ordered SQL under `migrations/`; `drizzle/` is parallel draft/Sites history and must not be blindly applied to D1. Employees relate to users, organizational units and reference catalogs; user/employee links are unique. History, leave ledger, stored-file metadata, session rows, deliveries and audit events have their own tables and scope rules. Use FK checks, checked transitions, uniqueness and D1 batches where atomic business changes span several tables. Generated local configuration comes from `vite.config.ts` and `.openai/hosting.json`.

Private attachments (employee and company documents, expense receipts, profile/media, compensation and bug reports) store bytes in `FILES` (R2) and metadata in `stored_files` (D1). Download authorization resolves ownership/access and scanner state through app routes, not a public R2 bucket. Upload and cleanup cross D1/R2 without a distributed transaction; use existing domain flows and handle failures explicitly.

## Identity and permissions

Google OAuth requests `openid email profile`; `lib/google-auth.ts` verifies an ID token/nonce and binds its verified normalized email to an admitted, enabled account and stable provider subject. There is no public account auto-provisioning. Callback uses incoming HTTPS origin. Web cookie is host-only, HTTP-only and SameSite=Lax, Secure on HTTPS; session ID and lifecycle are tracked in `web_sessions` (eight-hour max). Account revocation and security-sensitive actions have server-side checks. Cloudflare Access JWT is an alternate protected mode in code, not current production.

Application roles: Super Admin, HR Admin, Manager and Employee, further restricted by editable policy flags, ownership and organization/reporting scope. Super Admin operations also include protected-account safeguards, administrative access changes and permanent deletion of eligible synthetic/erroneous records with confirmation and audit. Do not confuse deletion, access disabling and employment termination. View as Employee is session-bound, time-limited and read-only; its server allowlist rejects writes and unapproved disclosure routes. Private fields and compensation have dedicated checks and audit paths.

## Integrations

- Resend sends invitation and announcement email through separate adapters. Announcement delivery stores requests/status in D1, claims work conditionally and avoids auto-cross-provider retries after an uncertain send. Google Chat is an optional webhook channel with separate state. Existing fallback configuration is secret-managed. See `modules/announcements/`.
- Admin test emails have separate routes/templates, a fixed recipient, explicit intent header, same-origin POST, Super Admin role, shared D1 audit cooldown and no production queue or invitation-history write.
- `worker/index.ts` runs a five-minute cron for configured announcement delivery. Code also contains versioned client OAuth/PKCE, a push outbox and Expo push adapter for deferred clients. Their presence is not a launch claim.
