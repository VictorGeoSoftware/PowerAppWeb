# Feature Implementation Spec: Web Push token registration

## Source Feature

- `id`: web-push-registration
- `area`: pwa
- `depends_on`: pwa-installable (accepted)
- `status`: accepted (feature-validator, 2026-10-19)
- `source`: `feature_list.json`

## Goal

A Broker can turn on notifications in the web app. The browser asks for permission, Firebase Cloud Messaging (FCM, JS SDK v11) issues a web push token on the existing `/sw.js` registration, and the token is stored in BmBackend (new `web_push_tokens` table, `qa` branch). Logging out removes the token. Deleting a grant also wipes the account's tokens.

This feature **only registers tokens**. Sending, topic subscription and notification display belong to `web-push-price-updates`.

## Key Finding (why the backend needs changes)

BmApp does not store tokens. `BrielApp.initializeFcm()` calls `subscribeToTopic("price_updates")` and `subscribeToTopic("force_logout")` on the device, and BmBackend sends to those **topics** (`FirebasePriceUpdatesNotifier`, `FirebaseForceLogoutNotifier`; data-only messages with only an `AndroidConfig`). The FCM JS SDK **cannot subscribe to topics from the browser**. A web token reaches a topic only through Admin SDK `subscribeToTopic(tokens, topic)` on the server, so the backend must receive and keep the web tokens. That is the purpose of this feature.

## Non-Goals

- **No topic subscription and no sending.** Tokens are stored but not subscribed to `price_updates`/`force_logout` yet. Reason: `/sw.js` has no `push` handler until `web-push-price-updates`. Chrome would show a generic "site updated in the background" notification for every push, and iOS revokes subscriptions whose pushes don't display a notification.
- No `push`/`notificationclick` handlers and no foreground `onMessage` (`web-push-price-updates`).
- No change to BmApp or to the Android topics.
- No in-app notification centre or preferences.

## Job Story

When a Broker uses PowerApp as an installed app,
they want to allow notifications once,
so they can be told about price updates like BmApp users (delivered by the next feature).

## Users And Permissions

- Granted Brokers only. The backend route uses `requireGrantedFirebaseUser`; the uid and email come from the token, never from the body.
- On iOS, web push exists only in an **installed** PWA on iOS 16.4+. In Safari tabs the option is hidden (Scenario 2).

## Acceptance Scenarios

### Scenario 1: Support detection
`pushSupport()` returns `"unsupported" | "needs-install" | "available"`:
- `"unsupported"`: no `Notification`, `serviceWorker` or `PushManager`, or FCM `isSupported()` is false, or `NEXT_PUBLIC_FIREBASE_VAPID_KEY` is empty;
- `"needs-install"`: iOS (`src/lib/pwa/platform.ts` `isIos`) and not `isStandalone`;
- otherwise `"available"`.
Push is never offered in dev builds (`/sw.js` registers in production only). This does not affect E2E, which uses a production build.

### Scenario 2: Entry points (permission only on a user tap)
When the support is `"available"` and `Notification.permission === "default"`:
- The hamburger menu shows **"Activar notificaciones"** above "Instalar aplicación" / "Cerrar sesión".
- A one-time dismissible card on `/fetch-consumption`: "Activa las notificaciones para enterarte de las nuevas tarifas" with "Activar" and ×. Dismissing sets `localStorage["bm.pushPromptDismissed"]="1"`, which is kept on logout like `bm.installHintDismissed`.

When the support is `"needs-install"`, the menu entry reads "Activar notificaciones" and opens the existing iOS install sheet with the line "En iPhone, las notificaciones requieren instalar la app".
When the permission is `"denied"`, the menu shows a disabled row "Notificaciones bloqueadas" with the hint "Actívalas en los ajustes del navegador".
`Notification.requestPermission()` is called **only** from these taps, never on load. Chrome penalises prompts without a user gesture and iOS rejects them.

### Scenario 3: Register
When the Broker taps "Activar" and permission becomes `"granted"`:
- `getToken(messaging, { vapidKey, serviceWorkerRegistration: await navigator.serviceWorker.ready })`;
- `POST /api/bm/push/web-tokens` with `{"token", "platform": "ios"|"android"|"desktop"}` (from `platform.ts`, no user agent string);
- on success, store `localStorage["bm.pushToken"] = JSON.stringify({uid, token})`, remove the entry point and show the status pill "Notificaciones activadas" (the existing `role="status"` pattern, 2.5 s);
- on failure (token error, network, non-2xx): show "No se pudieron activar las notificaciones." and keep the entry point. 401/403 go through `useBmFetch`.

### Scenario 4: Keep the token fresh
On every signed-in app start (status `granted`) with `Notification.permission === "granted"` and support `"available"`: silently call `getToken`. If the token or uid differs from `bm.pushToken`, POST it again (this upsert covers rotation and a different Broker on the same browser). It is best-effort and silent.

### Scenario 5: Logout
On a manual logout, **before** `auth/logout` and Firebase `signOut`, while the ID token is still valid and only if `bm.pushToken` exists:
- `DELETE /api/bm/push/web-tokens` with `{"token"}`, best-effort;
- then `deleteToken(messaging)`, best-effort;
- clear `bm.pushToken` in `clearLocalSessionData`.

On a forced logout: no backend call (BmApp parity, local only). Run `deleteToken` and clear the key; the server-side wipe (Scenario 7) removes the row.

### Scenario 6: Backend API (BmBackend `qa` branch)
- `POST /api/v1/push/web-tokens` (granted user), body `{token: String (1..4096), platform: "ios"|"android"|"desktop"}`. It upserts by `token`, setting `uid`, `email`, `platform` and `updated_at` (a token that moves to another account is reassigned). Responses: `200 {"success":true}`; 400 on a blank or too-long token or an unknown platform.
- `DELETE /api/v1/push/web-tokens` (granted user), body `{token}`. Deletes the row only if it belongs to the caller's uid. Returns `200` even when there was nothing to delete.
- Migration `V14__web_push_tokens.sql`: `web_push_tokens(id SERIAL PK, token TEXT UNIQUE NOT NULL, uid VARCHAR(128) NOT NULL, email VARCHAR(255) NOT NULL, platform VARCHAR(16) NOT NULL CHECK (platform IN ('ios','android','desktop')), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`, plus an index on `email`. Comment header in the style of V11.
- Never log the full token; mask it to its first 12 characters, like BmApp.

### Scenario 7: Grant deletion wipes tokens
`GrantedUsersService.deleteGrant` also runs `webPushTokensRepository.deleteByEmail(email)` inside the same transaction as the existing wipe.

## Repository Research

### Files Inspected
- `../BmApp/app/.../BrielApp.kt` (`initializeFcm`: token plus topic subscriptions; no backend call) and `notifications/BrielFirebaseMessagingService.kt` (`onNewToken` only logs; data types `price_updates`/`force_logout`).
- `../BmBackend/.../services/{FirebasePriceUpdatesNotifier,FirebaseForceLogoutNotifier,DebouncingPriceUpdatesNotifier,GrantedUsersService}.kt`, `routes/{UserDataRoutes,UserActivityRoutes}.kt` (route style, `requireGrantedFirebaseUser`), `Application.kt` (route wiring), migrations up to `V13__price_table_results_source_versioning.sql`, and `V11__collected_prices.sql` (header style). The test folders `src/test/kotlin/.../routes/` and `testing/InMemory*` set the testing pattern. BmBackend is on `qa` and clean.
- `public/sw.js` (install/activate only), `src/components/pwa/*` (install provider, iOS sheet and banner), `src/lib/pwa/platform.ts`, `src/components/shell/app-menu.tsx`, `src/lib/auth/logout.ts`, `src/components/auth/auth-provider.tsx` (`signOutUser`, `forceSignOut`), `src/lib/server/backend-proxy.ts` (`ALLOWED_ROOTS` has no `push`), `.env.example`, `package.json` (`firebase` ^11.10, which includes `firebase/messaging`).

### Existing Patterns To Follow
- Best-effort calls (`logoutFromBackend`, `sendUserActivity`); `useBmFetch` for calls the user starts; Spanish strings in `src/lib/pwa/messages.ts`; injectable browser APIs in pure helpers; BmBackend in-memory repositories for route tests.

### Current Gaps
- **The VAPID key is needed**: Firebase console → Project settings → Cloud Messaging → Web Push certificates → generate a key pair. Put the public key in `NEXT_PUBLIC_FIREBASE_VAPID_KEY` (`.env.local`, the deployment env, and `.env.example` with an empty value). The user must do this; until then support is `"unsupported"` and the UI stays hidden.
- FCM `getToken` needs network access to `fcmregistrations.googleapis.com`. Check it from the dev Mac (corporate network). If it is blocked, live verification moves to the QA deployment.
- In Playwright Chromium the permission can be granted (`context.grantPermissions(["notifications"])`), but a real FCM token needs that network access. E2E mocks `firebase/messaging` through the test seam (see Tasks).

## Technical Approach

### Web
1. `src/lib/pwa/push.ts`:
   - `pushSupport(env)`;
   - `requestAndGetToken()`, which dynamic-imports `firebase/messaging`;
   - `registerToken(fetch, token, platform)`;
   - `unregisterToken(...)`;
   - storage helpers for `bm.pushToken`.

   Allow a test override, `window.__bmPushTestToken`, used only when `process.env.NEXT_PUBLIC_E2E === "1"`. `scripts/e2e.sh` builds `.next-e2e` with only `NEXT_PUBLIC_E2E_POLL_INTERVAL_MS=750` today: add `NEXT_PUBLIC_E2E=1` to that build line (the stamp logic then rebuilds once). Production and dev builds never set it, so the override is dead code there.
2. `src/components/pwa/push-provider.tsx` (next to the install provider): exposes `{support, permission, enable(), enabling}` and runs the silent refresh from Scenario 4.
3. UI:
   - `push-menu-entry.tsx` (in `AppMenu`);
   - `push-prompt-card.tsx` (in the fetch-consumption page);
   - reuse the iOS install sheet with an extra line.
4. Logout: `signOutUser` awaits `unregisterPush(user)` before `logoutFromBackend`. `clearLocalSessionData` removes `bm.pushToken`. `forceSignOut` runs `deleteToken` best-effort.
5. Add `"push"` to the proxy's `ALLOWED_ROOTS`, and add a test.

### Backend (BmBackend `qa` only)
6. Migration V14, `WebPushTokensRepository` (port, Exposed implementation and in-memory test double), `WebPushTokensService`, `webPushRoutes` wired in `Application.kt`, the deletion added to `deleteGrant`, and a short `docs/WEB_PUSH.md` explaining why topics are subscribed server-side. Rebuild with `../BmInfra/bm-local-qa rebuild-backend`.

## Expected File Changes
- Web:
  - create `src/lib/pwa/push.ts` and test, `src/components/pwa/{push-provider,push-menu-entry,push-prompt-card}.tsx` and tests, and `e2e/push-registration.spec.ts`;
  - modify `scripts/e2e.sh` (`NEXT_PUBLIC_E2E=1` on the build), `src/components/shell/app-menu.tsx`, the fetch-consumption page, `src/app/layout.tsx` (provider), `src/components/auth/auth-provider.tsx`, `src/lib/auth/logout.ts` and test, `src/lib/server/backend-proxy.ts` and test, `src/lib/pwa/messages.ts`, `.env.example`.
- Backend:
  - create `src/main/resources/db/migration/postgres/V14__web_push_tokens.sql`;
  - create `repositories/WebPushTokensRepository.kt` and its port;
  - create `services/WebPushTokensService.kt`;
  - create `routes/WebPushRoutes.kt`;
  - create the tests and `docs/WEB_PUSH.md`;
  - modify `Application.kt`, `GrantedUsersService.kt` and its test.
- Docs: `docs/technical-discovery.md`, `docs/risks-and-open-questions.md`, `DESIGN.md`, `README.md` (VAPID env), `docs/after-qa-release-tasks.md`, `feature_list.json`, `PROGRESS.md`.

## Visual Design Impact
- UI is involved: a menu entry (normal, iOS install hint and disabled variants), a dismissible card (`bg-card` with a border, an "Activar" primary button of at least 44 px, close ×), and the status pill and error alert. Add these to `DESIGN.md`.

## Durable Documentation Impact
- `docs/technical-discovery.md`: update with the token flow, VAPID, the iOS installed-only rule, and why topics are subscribed server-side.
- `docs/risks-and-open-questions.md`: update with the FCM network reachability, the VAPID key, and topic subscription deferred to `web-push-price-updates`.
- `DESIGN.md`: update with the new UI pieces.
- `README.md`: update with `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.
- BmBackend `docs/WEB_PUSH.md`: create.
- `AGENTS.md`, `ARCHITECTURE.md`, `CONSTRAINTS.md`: not needed.

## Implementation Plan
1. Backend: migration, repository, service, routes and wipe, with tests. Rebuild local QA and check with curl.
2. Web: proxy root, push lib with tests.
3. Provider, UI and logout wiring, with RTL tests.
4. E2E, a live check against local QA (if FCM is reachable and the VAPID key is set), then docs.

## Implementation Tasks
- [x] Backend tests:
  - [x] POST upsert (new token; same token, other uid → reassigned);
  - [x] 400 cases;
  - [x] DELETE own token removes it; another uid's token is untouched; a missing token → 200;
  - [x] non-granted → 403;
  - [x] `deleteGrant` removes tokens;
  - [x] the migration applies (`./gradlew test` and the local QA rebuild logs).
- [x] Web unit tests:
  - [x] `pushSupport` matrix (no API, no VAPID, iOS tab, iOS standalone, Android);
  - [x] storage helpers;
  - [x] refresh only re-posts on a token or uid change;
  - [x] logout order (DELETE before `auth/logout`) and the forced logout makes no DELETE;
  - [x] the proxy allows `push`.
- [x] RTL tests:
  - [x] the menu entry states (default, needs-install → sheet, denied → disabled, granted → hidden);
  - [x] `requestPermission` is called only on a click;
  - [x] success pill and error alert;
  - [x] the card dismissal persists and survives logout.
- [x] E2E (android-chromium):
  - [x] `grantPermissions(["notifications"])` plus the test token seam;
  - [x] tap "Activar notificaciones" → POST `push/web-tokens` with the body `{token, platform:"android"}` (mocked 200) → status pill; the entry is gone;
  - [x] reload → no second POST (same token);
  - [x] logout → DELETE with `{token}` before `auth/logout`;
  - [x] in a context without the permission, the denied state shows the disabled row.
- [x] Live QA (manual):
  - [x] with the VAPID key set and a local production build, enable notifications in desktop or Android Chrome (`adb reverse`);
  - [x] confirm the row in the local QA Postgres (`psql -h 127.0.0.1 -p 15433 … -c "select left(token,12), platform, email from web_push_tokens"`);
  - [x] log out and confirm the row is gone.

  If FCM or the VAPID key is not available, record the blocker and defer it to the QA deployment.

## Verification Plan
- BmBackend: `./gradlew test`, then `../BmInfra/bm-local-qa rebuild-backend` (10-minute timeout).
- Web: `./init.sh` and `npm run test:e2e:quick -- e2e/push-registration.spec.ts`, then a full `npm run test:e2e` once (15-minute timeout, no piping).
- Feature verification "Token visible in QA DB": the live QA psql check above. On a real iPhone (installed), the check is in `docs/after-qa-release-tasks.md`.

## Evidence To Capture
- Backend test results, the rebuild readiness, the web Vitest count, focused and full E2E results, and the psql output (masked tokens) or a recorded deferral.

## Validator Checklist
- [x] Permission is requested only on a user tap; iOS tabs get the install hint, not a prompt.
- [x] Token register, refresh and delete behaviour as specified; full tokens are never logged.
- [x] Backend: granted-only, owner-checked delete, grant wipe included; migration V14; changes on `qa` only.
- [x] No topic subscription, push handler or sending (left for `web-push-price-updates`).
- [x] VAPID env documented; docs, `feature_list.json` and `PROGRESS.md` are updated.

## Implementation Notes (2026-10-19)

Deviations from the plan above, all deliberate:

- **Support detection order**: the VAPID check comes first, then the iOS tab check, then the API/`isSupported()` check. Safari does not expose `PushManager`/`Notification` in iOS tabs, so checking APIs first would hide the install hint from Scenario 2.
- **`PushProvider` location**: in `src/app/(app)/layout.tsx` (inside `RequireAuth`), not the root layout. It needs the granted Broker and only signed-in screens show the entry points.
- **Start-up refresh** runs against the permission read at app start only. Otherwise a tap that grants permission would trigger both `enable()` and the refresh, posting twice (caught by E2E; RTL regression added).
- **Error feedback** is a `role="alert"` pill (2.5 s) next to the status pill; the entry point stays.
- **E2E**: headless Chromium reports `Notification.permission === "denied"` even after `grantPermissions`, and Playwright contexts are incognito (Chrome disables the Push API there). The spec stubs the permission with an init script plus the `__bmPushTestToken` seam. `e2e/app-shell.spec.ts` removes `PushManager` in its exact-menu test so the browser-dependent push row does not change its list.
- **Backend**: `WebPushTokensDb` Exposed table + `upsert`; `PostgresSmokeTest` table list updated; Postgres contract test `WebPushTokensRepositoryTest`.

## Evidence (2026-10-19)

- BmBackend (`qa`, uncommitted): `./gradlew test` 172 tests, 0 failures, 0 skipped (incl. `WebPushRoutesTest` 5, `WebPushTokensRepositoryTest` 3 on Postgres, `GrantedUsersServiceTest` 10, `PostgresSmokeTest` 2). `../BmInfra/bm-local-qa rebuild-backend` healthy; Flyway at V14; unauthenticated `POST /api/v1/push/web-tokens` → 401.
- Web: `./init.sh` green (635 vitest). `npm run test:e2e -- e2e/push-registration.spec.ts` 4/4 incl. setup. Full `npm run test:e2e` (android-chromium): 82 passed.
- Live (feature verification "Token visible in QA DB"): temporary headed, persistent-profile Chromium spec against the `.next-e2e` production build (real FCM, real VAPID key, local QA backend). After sign-in and app start: `web_push_tokens` = `cd3-_Q2CVOIT|android|<QA account>|142`; after "Cerrar sesión": empty. Temporary spec removed.
- Mobile viewport (Pixel 7) screenshots reviewed: card on `/fetch-consumption`, menu row, success pill.
- Deferred to `qa-real-device-checks` / `docs/after-qa-release-tasks.md`: real Android Chrome and installed iPhone PWA prompt + row.
