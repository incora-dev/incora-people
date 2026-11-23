> Historical source note. Start with [START_HERE](../START_HERE.md) for verified handoff instructions. Treat commands and release claims below as historical.

# CTO audit: Chrome extension and mobile clients

Date: 2026-07-27  
Scope: Chrome timer extension, Expo/React Native mobile application, client
OAuth, API v1 boundaries, Android native project and release readiness.

## Executive assessment

The client architecture is directionally sound: web, extension and mobile use
one server-side authorization model; the extension is restricted to Time APIs;
mobile uses PKCE, bearer sessions and SecureStore; and business rules remain on
the backend. The clients are not a duplicated web bundle.

The audit did find release-critical implementation gaps typical of a fast alpha:
Expo standalone dependencies were incomplete, Android release used the debug
signing key, mobile launcher assets were placeholders, client logout did not
revoke server sessions, and refresh-token rotation could race between concurrent
client requests. These findings were corrected in this stabilization pass.

Current verdict: **sound release-candidate architecture with remaining UAT and
maintainability work**, not production-certified native software yet.

## Mobile 1.0 completion update

The employee-facing Mobile 1.0 scope is now implemented as native Expo Router
screens on both Android and iOS:

- home, people and employee profiles;
- leave requests, balances and manager approvals;
- time tracking, breaks, manual entries, corrections and team timesheets;
- calendar, tasks, announcements and notifications;
- company and personal documents;
- reimbursements with receipt photos and approval flow;
- organization, assets, knowledge base and bug reporting;
- personal settings, Ukrainian/English localization and role-aware
  administration.

Push-token registration and revocation are server-side scoped to mobile
sessions. Approval, task, announcement and bug-resolution events can send Expo
push notifications. Android uses a dedicated monochrome status-bar icon.

## Corrected in this pass

### Client session lifecycle

- Extension access tokens now live in `chrome.storage.session`; the rotating
  refresh token remains in `chrome.storage.local`.
- Extension refresh is serialized with a Web Lock across popup and service
  worker contexts.
- Extension and mobile logout call `/api/v1/auth/revoke` before clearing local
  credentials.
- Mobile refresh is single-flight, preventing simultaneous screen requests from
  racing a rotating refresh token.
- Client JWT signing is domain-separated from web-session signing.
- Network calls now have bounded timeouts instead of leaving a permanent
  loading state.
- A global mobile session gate redirects expired sessions to sign-in instead of
  leaving individual screens stuck.
- The custom-scheme OAuth callback now has a dedicated Expo Router route.

### Mobile native readiness

- Missing `expo-constants` and `expo-linking` peer dependencies were added.
- Expo config schema is valid; Android-only unnecessary permissions are blocked.
- Branded launcher, adaptive launcher and splash assets replace the generated
  placeholder.
- Android release no longer silently uses the public debug key. A release must
  be signed explicitly in Android Studio or by EAS credentials.
- Server and client minimum-version policy now agree on `0.1.0`, and mobile
  rejects obsolete versions with a clear upgrade message.
- Time status refreshes when the screen regains focus or the app returns to the
  foreground.

## Architecture strengths

1. Authorization and role checks are server-side and reused by all clients.
2. Extension tokens are path-scoped to status, clock-in, clock-out and revoke.
3. OAuth authorization codes are one-time, short-lived and PKCE-protected.
4. Refresh tokens are stored only as hashes on the server and rotated
   atomically.
5. Time clock commands are explicit and semantically idempotent.
6. Mobile credentials use Android Keystore / iOS Keychain via SecureStore.
7. Private files remain behind authorized R2-backed API routes.
8. Dependency versions and mobile installs are reproducible through lockfiles.

## Remaining engineering risks

### High: physical-device authentication and distribution UAT

Android and iOS JavaScript bundles can be produced, but real Google callback,
file picker, camera/gallery, deep link, background/resume, slow network and
process-kill behavior still require physical devices. This cannot be certified
from source-only testing.

### Medium: mobile API client concentration

`apps/mobile/lib/api.ts` is a large domain-spanning module. It is typed, but
response bodies are trusted after JSON parsing rather than validated at runtime.
Split it by domain and introduce shared Zod DTO contracts before the next large
mobile feature wave.

### Medium: no automated native UI suite

Current automation covers TypeScript, Expo bundling, configuration, API
contracts and server workflows. Add Maestro or Detox smoke flows for Android
and iOS, plus a small React Native component test suite.

### Medium: no automated extension browser E2E

Static checks, package integrity and server-side restrictions are automated.
Google OAuth and popup behavior still need a Chrome profile test with the packed
extension installed. Add a controlled Playwright/Chrome enterprise test profile
after the extension ID and test Google identity are stable.

### Medium: rate limiting is isolate-local

OAuth burst limiting reduces accidental abuse but is stored in Worker memory.
It is not a globally consistent security boundary. Production abuse controls
should move to Cloudflare rate-limit rules or a durable shared mechanism.

### Low: checked-in native Android and Expo config drift

The Android Studio folder is intentionally included for handoff. This makes the
repository a native-project workflow rather than pure Expo CNG. Any future
change to icon, scheme, plugins or permissions must be followed by controlled
prebuild synchronization and review of the native diff. The corresponding Expo
Doctor warning is intentionally disabled because the native folder is a
required deliverable; native configuration is covered by repository tests.

## Recommended next sequence

1. Build and sign an internal Android APK in Android Studio.
2. Perform real-device UAT on one current Android, one older Android and two
   iPhone sizes.
3. Automate five native critical paths: login, clock-in/out, leave request,
   file upload and logout/relogin.
4. Run authenticated staging load at 10, 25 and 50 simulated users.
5. Split the mobile API module and introduce shared runtime-validated DTOs.
6. Keep the shared Ukrainian/English copy reviewed as new manager and
   administrator features are added.
