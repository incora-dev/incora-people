# Production infrastructure — verified 2026-11-20

Latest applied D1 migration observed: `0071_employee_invitations.sql`
(preceded by `0070_hr_1on1_inventory_v2.sql`). No pending migrations.

| Layer                                  | Verified identity / behavior                                                                                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare account                     | `87141852539c2ba1a67eb86d696bc9be`                                                                                                                                                                                        |
| Application Worker                     | `incora-people`; 100% Worker version `1bc89de0-6e7b-4670-95ec-8227b448f510`, deployed 2026-11-19 08:03:35 UTC                                                                                                             |
| Configured canonical email/link origin | `https://incora-people.incora-people.workers.dev` (`PUBLIC_APP_URL`). Do not silently redirect or replace it.                                                                                                             |
| User-facing custom host                | `https://people.incora.software`, active HTTPS                                                                                                                                                                            |
| Pages                                  | `incora-people-gateway`; production upload `bc9c0400-1b3d-46b6-a273-5f0c437ecada`, no Git provider in project list; associated with both Pages and custom host                                                            |
| Service routing                        | Advanced-mode `cloudflare/pages-gateway/public/_worker.js` passes the original request to `INCORA_PEOPLE`; config names the production Worker. Public route signatures and callback origin confirm pass-through behavior. |
| Database                               | `DB` → D1 `incora-people`, ID `fc3d9a5b-c9e2-4b43-b5c8-50b610b4ca91`; no pending migrations observed                                                                                                                      |
| Storage                                | `FILES` → private R2 `incora-people-files`                                                                                                                                                                                |
| Auth / cron                            | `APP_MODE=protected`, `AUTH_PROVIDER=google`, `ALLOWED_EMAIL_DOMAIN=*` (still requires admitted account), Worker cron `*/5 * * * *`                                                                                       |
| Staging / plan                         | No independent stage target established by the inspected project configuration. The Pages hostname uses production; do not use it as staging. Cloudflare plan/billing not verified.                                       |

```text
Route 53 authoritative DNS (incora.software)
  people.incora.software -- CNAME --> incora-people-gateway.pages.dev

Browser -- HTTPS custom host --> Cloudflare edge / Pages gateway
                                        |
                                        v INCORA_PEOPLE service binding
Browser -- HTTPS workers.dev --> incora-people Worker + static assets
                                        |
              +-------------------------+----------------------+
              |                         |                      |
           D1 (DB)                R2 (FILES)          Google OAuth / Resend /
        app + delivery state      private files       Google Chat
```

DNS lookup returned **CNAME** `people.incora.software.` → `incora-people-gateway.pages.dev.` (TTL 300 in one answer). Authoritative NS: `ns-342.awsdns-42.com.`, `ns-612.awsdns-12.net.`, `ns-1369.awsdns-43.org.`, `ns-1768.awsdns-29.co.uk.`. AWS dashboard not accessed; record evidence is externally observable. Cloudflare edge serves HTTPS for the Pages hostname and custom host. DNS aliasing is not an HTTP redirect: each of the three hostnames returned an HTTP 302 **to its own** `/login` for an unauthenticated request to `/`; `/login` and `/privacy` returned 200 and `/api/me` 401.

`/api/auth/google` generated a Google callback on the **requested** hostname (`/api/auth/callback/google`). Cookie attributes observed for the OAuth-state response had no Domain attribute; authenticated session cookies are host-only in source. This does not verify Google Console registration or finish a Google login on every hostname. A signed-in session on one host is not necessarily shared with another. OAuth allowlist, Search Console ownership and full signed-in custom-host smoke were not inspected in this handoff.

Read-only evidence: DNS `dig`, HTTPS with redirects disabled, Wrangler Pages list/deployment list, Worker deployment/version metadata, and D1 migration list. No production data or secrets were exported and no infrastructure was modified. See [Cloudflare Pages custom-domain documentation](https://developers.cloudflare.com/pages/configuration/custom-domains/).
