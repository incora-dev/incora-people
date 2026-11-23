# INCORA People Mobile

> Deferred / archived; outside the current web release scope. See [deferred work](../../docs/roadmap/DEFERRED_AND_ARCHIVED.md).

Native shared codebase for Android and iOS, built with Expo and React Native.

## What is working now

- system-browser Google sign-in through INCORA People API v1 and PKCE;
- encrypted device session storage through iOS Keychain / Android Keystore;
- refresh-token rotation and server-enforced eight-hour session limit;
- mobile Time screen with authoritative start / stop actions;
- Ukrainian-first native tabs with an English interface option;
- full employee Mobile 1.0 screens for the directory, leave, calendar, tasks,
  announcements, documents, reimbursements, assets and knowledge base;
- manager/HR task creation and leave, reimbursement and time approvals;
- native reimbursement requests with receipt files and a separate bug-report
  flow with screenshot history;
- configurable Expo push notifications for approvals, tasks, announcements and
  issue-resolution updates;
- photo selection is explicit: the app never accesses a device gallery until a
  person presses an attachment action.

All displayed data is fetched from API v1 after the server verifies the bearer
token. The application does not embed the web bundle, database credentials, or
other employees' unfiltered data.

## Start locally

Install dependencies in this directory with `npm ci`, then start with
`npm run start`. The checked-in lockfile includes the native gesture, reanimated
and worklets peers required by Expo SDK 57. Expo Go is sufficient for checking
the visual shell, but
Google sign-in requires a development or internal build because it must return
to the registered `incora-people://` app scheme. The first APK and iOS internal
build are created through EAS after app signing is configured.

Set `EXPO_PUBLIC_INCORA_API_ORIGIN` only to override the deployed INCORA People
URL. Push notifications use the EAS project ID linked in `app.json`;
`EXPO_PUBLIC_EAS_PROJECT_ID` can override it when needed. Without either value,
the rest of the application works normally and push registration is skipped.

`eas.json` already defines two internal channels: `preview` produces an Android
APK; `ios-internal` produces an iOS internal-distribution build. iOS still
requires an Apple Developer account and registered test devices or TestFlight.

## Verify before creating an internal build

After installing dependencies, run `npm run typecheck` and `npx expo-doctor`.
Build an Android APK
with `npx eas build --platform android --profile preview`; iOS internal builds
use `npx eas build --platform ios --profile ios-internal`. The target Worker
must already have migrations `0020_client_api_sessions.sql` and
`0021_mobile_push_tokens.sql`, API v1 routes and the
`incora-people://auth/callback` redirect registered.

## Required server state

The Worker migrations `0020_client_api_sessions.sql`,
`0021_mobile_push_tokens.sql` and
`0052_refresh_token_replay_and_rate_limit.sql`, plus API v1 routes, must be
deployed before all Mobile 1.0 features can work. The custom URL scheme is
`incora-people://auth/callback`; it must remain registered in `app.json` and
accepted by the Worker.
