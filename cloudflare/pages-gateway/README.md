# INCORA People Pages gateway

> Historical deployment guide. The custom hostname is now attached; see [verified production routing](../../docs/infrastructure/PRODUCTION.md) for current evidence. Do not repeat the setup steps below.

This isolated Cloudflare Pages Advanced Mode project forwards the original
incoming `Request` to the existing `incora-people` Worker through the
`INCORA_PEOPLE` Service Binding. It contains no application source, D1/R2
binding, credentials, external origin request, or custom-domain setup.

The gateway does not rewrite the request URL or headers. The downstream app
therefore derives host-sensitive behavior (including the Google OAuth callback
origin and host-only session cookies) from the public host used by the caller.
All normal responses retain their status, headers and streamed body, including
`Set-Cookie`; cache-control headers are set to `private, no-store` for safety.

Deploy from this directory with Wrangler Pages after confirming the target
account. The Pages project name is `incora-people-gateway`; the configured
service binding targets the production Worker named `incora-people`.

## Domain and OAuth limitations

The existing application forms its Google OAuth callback from the request
origin. A request through the `pages.dev` gateway will consequently request a
callback on the gateway's `pages.dev` hostname; a request through
`people.incora.software` will request that hostname instead. The currently
documented OAuth callback is on `incora-people.incora-people.workers.dev`, so
Google OAuth is not yet validated/compatible on either new host until the
corresponding exact callback URI is approved and registered in Google OAuth.
The application `PUBLIC_APP_URL` must also be changed to the custom hostname
for links generated from configured runtime URLs (for example invitations).

The pages.dev technical validation does not make this project production-ready.
Before custom-domain cutover:

1. In Cloudflare Workers & Pages, open this Pages project, choose **Custom
   domains**, and complete **Set up a domain** for `people.incora.software`.
2. Keep DNS authoritative at AWS Route 53. After Pages associates/validates the
   hostname, add the Route 53 CNAME `people` →
   `incora-people-gateway.pages.dev`. Do not change `incora.software`
   nameservers. Cloudflare's Pages docs support a subdomain CNAME from an
   external DNS provider; the domain must first be associated in Pages.
3. Add the exact Google OAuth redirect URI
   `https://people.incora.software/api/auth/callback/google` to the existing
   OAuth client. Keep the current Worker callback until the cutover/rollback
   period is complete.
4. Coordinate a separate production Worker configuration change so
   `PUBLIC_APP_URL` uses `https://people.incora.software`; otherwise generated
   invitation links can continue pointing to the prior Worker hostname.
5. Validate OAuth end-to-end, session-cookie behavior, authenticated APIs,
   assets, and uploads through the custom hostname before declaring production
   readiness.

No custom domain, DNS record, Google setting, or Worker configuration was
changed as part of this Pages-only validation deployment.
