# Production deployment — explicit authorization required

No deploy was performed for the handoff. Production is the Worker in [production infrastructure](../infrastructure/PRODUCTION.md); the Pages gateway is a separate deploy target. Never seed production.

1. Reconcile the portable working-tree copy with the authorized private repository and original migration files. The share-safe copies of legacy migrations preserve names/schema but redact data literals; they are not a source of truth for remote application. Review exact patch, base, dependency lock, prior version, and restore/rollback plan.
2. Use your own authorized Wrangler identity (`npx wrangler whoami`), verify account, Worker, D1, R2, hostname, OAuth config and non-secret build vars. Keep the existing canonical URL and secret bindings. Do not print values. Do not build from the demo example expecting a production target.
3. In an authorized deployment shell set `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, `APP_MODE=protected`, `AUTH_PROVIDER=google`, `ALLOWED_EMAIL_DOMAIN='*'`, verified `GOOGLE_CLIENT_ID`, `CHROME_EXTENSION_ID`, `PUBLIC_APP_URL` to the live values reviewed by the owner. Obtain approved values from owner/secret manager, not from archived chats.

```bash
npm ci
npm run quality
npm run build
npx wrangler deployments list --name incora-people
npx wrangler d1 migrations list incora-people --remote -c dist/server/wrangler.json
npx wrangler deploy -c dist/server/wrangler.json --dry-run
```

Verify generated `dist/server/wrangler.json` before any remote action. Inspect binding names via Wrangler with output kept private; verify protected configuration, exact Worker name and database/bucket IDs. Do not set replacement secrets unless separately approved.

- **Template/code-only release, no pending schema work:** use `npx wrangler deploy -c dist/server/wrangler.json --message "Reviewed release description"` after approval and checks. This does not apply SQL.
- **Authorized schema release:** take and verify a private fresh D1 export, restore readiness/R2 plan, confirm the exact approved migration list and backward compatibility, and follow the migration-specific release plan. `npm run deploy:cloudflare` wraps quality/build/guards **and applies remote migrations**; use only when that behavior is authorized. Never run remote seed. If migration applies and deploy fails, stop and report partial state; do not restore speculatively.

Record previous/current version, approved source manifest, migration/backup evidence and outcome. Safe smoke: both allowed hosts, `/login` 200, protected `/` redirect, `/api/me` 401 unauthenticated, static logo and public legal pages; check expected callback generation without publishing tokens. Use an authorized signed-in session for read-only smoke if available. No test announcements, real employee mutations, notification calls, or destructive tests in production unless specifically authorized.
