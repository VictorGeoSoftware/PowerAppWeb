# Feature Implementation Spec: Logout and forced logout

## Source Feature
- `id`: logout-force-logout · `area`: auth · `depends_on`: access-gate (accepted)
- `status`: not_started (at planning time) · `source`: `feature_list.json`

## Goal
A Broker can log out on purpose. A Broker whose access is taken away during a session is signed out with a clear Spanish message. Access counts as taken away when the grant is revoked in BmWeb, the backend returns 401/403, or Firebase rejects the session. Until now this was only detected by the `/user-data` check when the app loads.

## Decisions
- **Manual logout follows BmApp `AuthRepositoryImpl.logout()`.**
  - Call `POST /auth/logout` with the current ID token, without forcing a refresh and with no body.
  - The call is best-effort: ignore any failure or status and always continue.
  - Then call Firebase `signOut()`.
  - Do not show a notice after a manual logout.
- **No separate `user-activity/offline` call.** `/auth/logout` already marks the user offline on the backend. Activity reporting belongs to `user-activity-sync`.
- **Keep the Bound Device id.** `localStorage["bm.deviceId"]` must survive logout, as in BmApp `DeviceIdLocalDataSource` and `device-binding-basic`.
- **Forced logout does not call `/auth/logout`.** In BmApp the account's data is already deleted by then. Forced logout only signs out locally and sets the notice.
- **Forced-logout triggers and messages:**
  - **403 from any backend call:** show the backend `message`. If it's empty, fall back to `ACCESS_DENIED_MESSAGE`. This covers a revoked grant ("no autorizada…") and a device mismatch ("ya está vinculada…").
  - **401 from any backend call:** show `SESSION_EXPIRED_MESSAGE`.
  - **Firebase token errors while getting the ID token:** show the new constant `ACCESS_REVOKED_MESSAGE` = "Tu acceso ha sido revocado. Contacta con el equipo de administración." The text matches the BmApp `AuthViewModel` constant. The codes are `auth/user-token-expired`, `auth/user-disabled`, `auth/user-not-found` and `auth/invalid-user-token`. When BmWeb deletes a grant, the backend revokes the Firebase refresh tokens, so refreshing the token fails with one of these codes. Today that error ends on the retry screen; it must sign the Broker out instead.
  - **Network errors, 5xx and 502 from the proxy:** do not sign out. The existing behavior stays: the retry screen during the access check, and the caller's own error handling elsewhere.
- **Detecting a revocation without push.** The web has no FCM `force_logout` listener; that comes with the `web-push-*` features. To keep the "next call signs out" behavior even before feature screens exist, re-run the `/user-data` access check when the tab becomes visible (`visibilitychange` → `visible`). Throttle it to at most once every 60 s, and run it only while the status is `granted`. During this background check, keep `granted` while the request runs; don't switch to `verifying` or the screen would flash. A non-authorization failure in the background check is ignored and the Broker stays signed in.
- **Local data to clear:** none exists yet, because customer conditions and the last job id arrive with later features. Add a single `clearLocalSessionData()` hook that runs on both logout paths, so later features have one place to register their cleanup.

## Non-Goals
- The app shell and drawer (`app-shell-navigation`). For now the logout button lives on the home placeholder; the drawer will move it later.
- Push-based force logout (FCM topic `force_logout`). That belongs to the web push features.
- Calling `verifyIdToken(checkRevoked)` on the backend, and any other BmBackend change.
- Clearing or resetting the device binding.
- Analytics events for logout (`analytics-screen-tracking`).

## Job Story
When I finish working, or my account is revoked by the admin,
I want the app to sign me out cleanly and tell me why when it wasn't my choice,
so nobody keeps using a revoked or shared account on this browser.

## Users And Permissions
- Granted Broker: can log out.
- Broker whose grant was revoked, whose token is invalid, or whose device is rejected: signed out automatically with a message on `/login`.

## Acceptance Scenarios

### Scenario 1: Manual logout
Given a granted Broker on `/`
When they tap "Cerrar sesión"
Then `POST /api/bm/auth/logout` is sent with a Bearer token
And Firebase signs out, the app lands on `/login` with no notice, and `/` redirects to `/login`
And `localStorage["bm.deviceId"]` is unchanged.

### Scenario 2: Logout works when the backend fails
Given `/auth/logout` returns 500 or the network fails
When the Broker taps "Cerrar sesión"
Then they are still signed out and land on `/login`.

### Scenario 3: 403 during a session
Given a granted Broker
When any `bmFetch` call, or the access check that runs when the tab becomes visible again, returns 403 with a message
Then the Broker is signed out, `/auth/logout` is NOT called, and `/login` shows that message as `role="alert"`.

### Scenario 4: 401 during a session
Same as Scenario 3, but the status is 401 and the message shown is "Tu sesión ha caducado. Inicia sesión de nuevo."

### Scenario 5: Revoked refresh token
Given getting the ID token fails with `auth/user-token-expired`, or another code from the list in Decisions
When the access check or any `bmFetch` runs
Then the Broker is signed out with "Tu acceso ha sido revocado. Contacta con el equipo de administración." The retry screen is not shown.

### Scenario 6: Temporary failures keep the session
Given a granted Broker
When the background check gets a 5xx or a network error
Then the Broker stays on `/` and is still signed in.

### Scenario 7: Real revocation (manual, QA)
Given the E2E QA account is signed in on the web
When an admin removes its grant in BmWeb QA and the tab is hidden and shown again (more than 60 s after the last check)
Then the web signs out with a message. Restore the grant and the device binding afterwards.

## Repository Research

### Files Inspected
- `src/components/auth/auth-provider.tsx`
  - `verify()` at `:55-73` handles 403 and 401 only for the `/user-data` check.
  - `signOutUser` at `:96` calls only Firebase `signOut`.
  - The messages are at `:18-21`.
  - The `currentUid` ref throws away results that arrive after the user has changed.
- `src/components/auth/guards.tsx`: `AccessCheckError` has the only "Cerrar sesión" button today, at `:18`.
- `src/app/page.tsx`: the signed-in home placeholder.
- `src/app/login/page.tsx:23-34`: shows `notice` as an alert and clears it when a new login starts.
- `src/lib/api/bm-fetch.ts:14-40`: `bmFetch`, `BmApiError(status, message)`. It has no global error hook.
- `src/lib/auth/user-data-sync.ts:33`: forces a token refresh.
- `src/lib/auth/device-id.ts:15`: the device id is kept across logouts.
- `src/lib/server/backend-proxy.ts:18`: `auth` is already on the proxy's allowed list.
- Tests:
  - Unit: `auth-provider.test.tsx` mocks `firebase/auth` and injects `verifyAccess`. `bm-fetch.test.ts` stubs `fetch`.
  - E2E: `e2e/fixtures.ts` and `e2e/access-gate.spec.ts`, which use `page.route` mocks with the real QA login.
- BmApp:
  - `AuthViewModel.kt:178-245,293-296`
  - `AuthRepositoryImpl.kt:56-67`
  - `AuthApi.kt:42-59`
  - `BrielFirebaseMessagingService.kt:68-96`
- BmBackend:
  - `AuthRoutes.kt:18-51`: `/auth/logout` marks the user offline. It returns 200, 400, 401, 403 or 500.
  - `FirebaseRouteAuth.kt`: returns 401 for a bad or missing token and 403 when the user isn't granted. Revocation of the ID token is not checked.
  - `GrantedUsersService.deleteGrant`: revokes the refresh tokens, deletes the data and sends the FCM message.

### Gaps
- No central handler for 401/403 outside `verify()`.
- Firebase token errors are treated as temporary.
- No logout call to the backend.

## Technical Approach
1. **`src/lib/auth/session-errors.ts`** (new). Add `classifySessionError(error): { kind: "forced"; message: string } | { kind: "transient" }`:
   - A `BmApiError` with status 403 maps to the backend message, or `ACCESS_DENIED_MESSAGE` if that's empty.
   - A `BmApiError` with status 401 maps to `SESSION_EXPIRED_MESSAGE`.
   - A Firebase error whose `code` is in the revoked list maps to `ACCESS_REVOKED_MESSAGE`.
   - Anything else is transient.
   - Move the message constants here and re-export them from `auth-provider.tsx`, so existing imports keep working.
2. **`src/lib/auth/logout.ts`** (new):
   - `logoutFromBackend(user)`: `bmFetch(user, "auth/logout", { method: "POST" })` inside try/catch. It never throws.
   - `clearLocalSessionData()`: does nothing for now and is documented as the cleanup hook. It must not touch `bm.deviceId`.
3. **`AuthProvider`**:
   - **Forced logout:** add an internal `forceSignOut(message)` that sets the notice, runs `clearLocalSessionData()` and calls Firebase `signOut`.
   - **Access check:** `verify()` uses `classifySessionError`.
   - **Manual logout:** `signOutUser()` sets status to `loading` (to avoid flashes), calls `logoutFromBackend`, runs `clearLocalSessionData()`, then `signOut`.
   - **Error reporting:** expose `reportApiError(error): boolean` in the context. It forces logout and returns true for forced errors, and returns false for transient ones.
   - **Tab-visible re-check:** add the background re-check on `visibilitychange`, as described in Decisions. Use a `lastVerifiedAt` ref and remove the listener on cleanup. Keep the stale-uid guard.
4. **`src/lib/api/use-bm-fetch.ts`** (new). A `useBmFetch()` hook returns `(path, init) => bmFetch(user, path, init)`. On error it calls `reportApiError` and then rethrows. Later features must use this hook. `bmFetch` itself stays a plain function.
5. **`src/app/page.tsx`**: add a "Cerrar sesión" `Button` (variant `outline`) that calls `signOutUser`. Add a short code comment that it moves to the drawer in `app-shell-navigation`.
6. **E2E** (`e2e/logout.spec.ts`, new):
   - Scenario 1: check that `/auth/logout` is sent with `Authorization` by observing the real request with `page.waitForRequest`. Also check that `bm.deviceId` is unchanged.
   - Scenario 2: mock `/auth/logout` to return 500.
   - Scenario 3: mock `/user-data` to return 403, then fire `visibilitychange` (e.g. `page.evaluate` overriding `document.visibilityState` and dispatching the event). Check the alert message, and check that `/auth/logout` was not requested.
   - Allow the test to bypass the 60 s throttle with an injectable interval prop on `AuthProvider` (`recheckIntervalMs`). For E2E, set it to 0 via `NEXT_PUBLIC_ACCESS_RECHECK_MS` only when that variable is set; otherwise the default is 60000. Document the variable in `.env.example` as dev/test only.

## Implementation Notes
- E2E bypasses the 60 s throttle with Playwright `page.clock.fastForward` instead of a `NEXT_PUBLIC_ACCESS_RECHECK_MS` override, so no test-only setting reaches the app; `.env.example` is unchanged. `recheckIntervalMs` remains an `AuthProvider` prop for unit tests.
- `useBmFetch` passes every error to `reportApiError`, which decides (transient errors are a no-op returning false).
- Found in the manual revocation test: the Firebase SDK signs the user out on its own when it gets `auth/user-token-expired`, before rejecting. The stale-user guard therefore treats a `null` current user as current for forced errors, so the notice is kept. Transient errors after sign-out are ignored.

## Expected File Changes
- `src/lib/auth/session-errors.ts`, `session-errors.test.ts`: create
- `src/lib/auth/logout.ts`, `logout.test.ts`: create
- `src/lib/api/use-bm-fetch.ts`, `use-bm-fetch.test.tsx`: create
- `src/components/auth/auth-provider.tsx`, `auth-provider.test.tsx`: modify
- `src/app/page.tsx`, `src/app/page.test.tsx`: modify (logout button)
- `e2e/logout.spec.ts`: create
- `.env.example`: add `NEXT_PUBLIC_ACCESS_RECHECK_MS` (optional, commented)
- `docs/technical-discovery.md`: add a short "Session end" paragraph covering the triggers, the messages, the no-push limitation, and the requirement that features must use `useBmFetch`
- `feature_list.json`, `PROGRESS.md`: update status and evidence

## Visual Design Impact
- UI involved: yes, minimal. A secondary "Cerrar sesión" button on the placeholder home. It must be at least 44 px tall and full-width up to 640 px, per `DESIGN.md`.
- The notice reuses the existing alert on `/login`. No new design artifact is needed.

## Durable Documentation Impact
- `docs/technical-discovery.md`: update (session-end rules and the `useBmFetch` convention for later features).
- `docs/domain-model.md`: already says "Grant revoked mid-session → 403 → signed out". Add the refresh-token revocation case in one line.
- `ARCHITECTURE.md` / `CONSTRAINTS.md`: not needed (not created in this repo).
- `AGENTS.md`: not needed.
- `README.md`: not needed, unless the new env var needs a mention next to E2E. If it's used by `test:e2e`, add one line.

## Implementation Tasks
- [ ] `session-errors.ts` + unit tests: 403 with and without a message, 401, each revoked Firebase code, a network `TypeError`, 500.
- [ ] `logout.ts` + unit tests: logout is sent as POST with a token; 500 and network failures are swallowed; the device id is untouched.
- [ ] `AuthProvider`: `forceSignOut`, `signOutUser` with the backend call, `reportApiError`, the throttled visibility re-check, `recheckIntervalMs`.
- [ ] `AuthProvider` tests:
  - manual logout calls the backend, then `signOut`, with no notice;
  - a forced 403 does not call the backend;
  - a revoked Firebase code ends in signed-out with the revoked message, not `error`;
  - the visibility re-check runs only when `granted` and respects the throttle;
  - a 5xx during the re-check keeps `granted`.
- [ ] `useBmFetch` hook + tests: a forced error is reported and rethrown; a transient error is not reported.
- [ ] Logout button on the home placeholder + update `page.test.tsx`.
- [ ] `e2e/logout.spec.ts` covering Scenarios 1–3 on android-chromium and iphone-webkit.
- [ ] Docs, then `feature_list.json` (`passing` plus evidence) and `PROGRESS.md`.

## Verification Plan
- `./init.sh` green (lint, typecheck, unit tests) and `npm run build` OK.
- `E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e`: the full suite passes, including the new logout spec. Credentials come from the Keychain (`bm-e2e-email` / `bm-e2e-password`) and must never be committed.
- Mobile viewport check of `/` at 390×844 with the logout button.
- Manual Scenario 7 against the QA backend with BmWeb QA: revoke the grant, show the tab again, see the message. Then restore the grant and the device binding. Record the result. If it can't be run, say so explicitly in the evidence.

## Evidence To Capture
- Test counts from `./init.sh` and `test:e2e`.
- The request observed for `/auth/logout` in the E2E test.
- The Scenario 7 outcome, or the reason it was skipped.

## Validator Checklist
- [ ] Manual logout calls `/auth/logout` best-effort, then `signOut`, and keeps `bm.deviceId`.
- [ ] Forced logout never calls `/auth/logout` and always shows a Spanish notice.
- [ ] 401, 403 and revoked Firebase codes sign out; 5xx and network errors don't.
- [ ] The background re-check is throttled, runs only when `granted`, and causes no UI flash.
- [ ] `useBmFetch` exists and the docs say later features must use it.
- [ ] There are no backend changes, no push work and no drawer.
- [ ] E2E covers Scenarios 1–3. The throttle override is used only in tests.
