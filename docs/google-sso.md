> Historical source note. Start with [START_HERE](../START_HERE.md) for verified handoff instructions. Treat commands and release claims below as historical.

# Google SSO activation

## Intended identity model

INCORA People accepts a verified Google identity from any email domain. Google
proves who the user is; INCORA People decides what that identity may access.
Email suffixes never grant a role.

The database pre-provisions these protected super administrators:

- `person023@example.test`
- `person005@example.test`
- `person012@example.test`
- `person003@example.test`

Every other authenticated but unknown address receives an unlinked employee
identity with the minimum access policy. An administrator must link the account
to an employee profile or assign a different access group before it can use
employee-specific workflows.

## Direct Google OAuth setup

The current Sites hostname uses direct Google OAuth because the application
cannot attach a separate Cloudflare Access policy to a platform-owned hostname.

1. Create a Google Cloud OAuth consent screen with an external audience.
2. Create a Web application OAuth client.
3. Add the INCORA People origin to **Authorized JavaScript origins**.
4. Add `<origin>/api/auth/callback/google` to **Authorized redirect URIs**.
5. Store the client secret and a random application session secret as protected
   deployment variables.

## Application variables

```dotenv
APP_MODE=protected
AUTH_PROVIDER=google
ALLOWED_EMAIL_DOMAIN=*
GOOGLE_CLIENT_ID=<oauth-client-id>
GOOGLE_CLIENT_SECRET=<secret>
AUTH_SECRET=<random-high-entropy-secret>
```

The authorization flow uses PKCE, state and nonce validation, Google ID-token
signature verification and an 8-hour signed HttpOnly session cookie.
Secrets belong in the deployment secret store and never in this repository.

Before enabling protected mode, test every super-administrator account, one
ordinary pre-provisioned account and one unknown external Google account.

## Google Chat integration

Google Chat replaces Slack and Microsoft Teams in the integration roadmap. The
first delivery increment will use an incoming webhook for one-way approval and
reminder notifications. The webhook URL is a secret and must be stored as a
runtime secret. Interactive approvals in Chat require a Google Chat app and are
planned after the transactional outbox is in place.
