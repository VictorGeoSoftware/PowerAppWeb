# Feature Implementation Spec: User data and activity reporting

## Source Feature

- `id`: user-activity-sync
- `area`: platform
- `depends_on`: access-gate (accepted)
- `status`: not_started
- `source`: `feature_list.json`

## Goal

The web client reports the same Broker activity as BmApp, so BmWeb's users page (`../BmWeb/src/app/dashboard/users/page.tsx`: Online/Offline badge, "Respuestas mensuales") counts web Brokers too:

- **online**: `POST user-activity/online` when the app becomes active (BmApp `MainActivity.onResume`);
- **offline**: `POST user-activity/offline` when it goes to the background or closes (BmApp `onStop`);
- **proposals-response**: `POST user-activity/proposals-response` once per study, when the received result is first shown in the comparator table. BmApp's `trackProposalResponseReceived` counts every publish instead; see Scenario 4.

User-data sync (`POST user-data`) already exists: `src/lib/auth/user-data-sync.ts` is the access check from `access-gate`. This feature does not change it. It only re-checks that the existing tests still cover it.

## Non-Goals

- No changes to `user-data`, to `auth/logout` (it already marks the Broker offline on manual logout) or to BmBackend.
- No UI. These are silent background calls.
- No analytics (`analytics-screen-tracking`) and no push notifications.
- No retry or queue for failed events. BmApp ignores the `Result` too.

## Job Story

When a Broker uses the web app instead of the Android app,
the administrator wants to see them online and count their proposal responses in BmWeb,
so usage reporting does not miss web Brokers.

## Users And Permissions

- Only a signed-in Broker whose access check passed (`AuthProvider` `status === "granted"`). The backend runs `requireGrantedFirebaseUser` and takes the name and email from the token, but BmApp still sends them in the body, so we send them too.
- `user-activity` is already in `ALLOWED_ROOTS` (`src/lib/server/backend-proxy.ts`).

## Acceptance Scenarios

### Scenario 1: Payload
Every event is `POST /api/bm/user-activity/<event>` with `Content-Type: application/json`, the Firebase Bearer token (cached, not force-refreshed), and the body `{"name", "email"}`:
- `email` is `user.email.trim()`. If it is blank, **no event is sent** (BmApp `return`).
- `name` is `displayName` when it is not blank, otherwise the part of the email before `@`.

### Scenario 2: Online
Given the access check has passed (`status` becomes `"granted"`)
Then one `online` event is sent.
When the tab becomes visible again after being hidden (`visibilitychange` → `visible`)
Then another `online` event is sent.

### Scenario 3: Offline
Given the Broker is granted and was reported online
When the tab is hidden (`visibilitychange` → `hidden`) or the page unloads (`pagehide`)
Then one `offline` event is sent with `fetch(..., { keepalive: true })`, so it survives the page closing.
Events are sent only on a state change: `hidden` followed by `pagehide` produces a single `offline`, and repeated `visible` events produce a single `online`.

### Scenario 4: Proposals response (the real event)
Given a study result has been received (a completed CUPS, PDF or photo job)
When the Broker first sees the comparator table for that job (`/proposals` rendered with at least one visible proposal)
Then one `proposals-response` event is sent.
It is counted **once per jobId**. Reloading, restoring the same study, silent refreshes (`consumption-report-refresh`), switching screens and coming back, or editing fixed amounts and visibility never count again. The counted jobId is kept in `localStorage["bm.proposalsResponseJobId"]` and cleared by `clearStudyStorage`.
A job that fails, or a study the Broker never opens on Proposals, is not counted.
This deviates from BmApp on purpose (user decision 2026-10-19): BmApp counts every report publish (job result, restore and push refresh). Record the deviation in `docs/domain-model.md`.

### Scenario 5: Failures are silent
Any network error or non-2xx response from an activity event is ignored: no notice, no retry, no sign-out. Activity calls go through `bmFetch` directly, not `useBmFetch`, so a 401 or 403 here never forces a logout. Access revocation is still handled by the existing access re-check.

### Scenario 6: Not when signed out
Nothing is sent while the user is signed out, still loading or verifying, denied, or after logout. The listeners are removed when `status` leaves `"granted"`.

## Repository Research

### Files Inspected
- `../BmApp/app/.../MainActivity.kt`: `onResume` sends online, `onStop` sends offline; `sendUserActivity` handles the name/email fallback and the blank-email return.
- `../BmApp/data/.../network/PriceTableApi.kt` (`setUserOnline`/`setUserOffline`/`incrementProposalResponseCounter`, `sendUserActivityEvent`) and `UserActivityEventDto(name, email)`.
- `../BmApp/data/.../repository/ConsumptionStudyRepositoryImpl.kt`: `publishReport` → `trackProposalResponseReceived` runs on job result, restore and refresh.
- `../BmBackend/.../routes/UserActivityRoutes.kt`: the three POST routes need a granted user and take the name and email from the token.
- `../BmWeb/src/app/dashboard/users/page.tsx`: `isOnline`, `monthlyUsageCount`.
- `src/components/auth/auth-provider.tsx`: `status`, `user`, existing `visibilitychange` re-check.
- `src/components/consumption/consumption-study-provider.tsx`: `publish` is called from `run` (job), `restore` and `doRefresh`. It is not used for counting.
- `src/components/proposals/proposals-table.tsx`, `src/lib/gate/storage.ts` (`clearStudyStorage`).
- `src/lib/api/bm-fetch.ts`, `src/lib/auth/logout.ts` (best-effort pattern), `src/lib/auth/user-data-sync.ts`, `src/lib/server/backend-proxy.ts`.
- `src/app/(app)/layout.tsx`: `RequireAuth` wraps every signed-in screen.

### Existing Patterns To Follow
- Best-effort backend calls follow `logoutFromBackend`: `try { await bmFetch(...) } catch {}`.
- Pure helpers go in `src/lib/<area>/` with Vitest. Provider logic is tested with RTL using injectable dependencies (as in `AuthProvider` `verifyAccess`).

### Current Gaps
- `bmFetch` passes `init` straight through (`{ ...init, headers }`), so `keepalive` works without changes. No activity helper exists yet.
- Whether `pagehide` + `keepalive` reliably delivers on iOS Safari is unverified and goes to `qa-real-device-checks`. `visibilitychange: hidden` is the main trigger because it fires earlier, while the page is still alive.

## Technical Approach

1. **`src/lib/auth/user-activity.ts`**:
   - `activityPayload(user)` returns `{name, email} | null`.
   - `sendUserActivity(user, event: "online" | "offline" | "proposals-response")` is best-effort and never throws. It uses `keepalive: true` and does not force a token refresh.
2. **`src/components/auth/user-activity-reporter.tsx`** (or a `useUserActivity()` hook): while `status === "granted"`, it sends online on mount and handles the visibility/`pagehide` transitions. A `lastSent` ref deduplicates them. On unmount or status change it removes the listeners. It does **not** send offline on logout, because `auth/logout` already does that and a forced logout has no token. Mount it once inside `RequireAuth` (in `src/app/(app)/layout.tsx`, or inside `AuthProvider` gated on status, whichever keeps tests simplest; document the choice).
3. **`ProposalsComparator`** (`src/components/proposals/proposals-table.tsx`): an effect runs when `session.jobId` exists and `visible.length > 0`. If the jobId differs from the stored `bm.proposalsResponseJobId`, it stores the jobId first (to avoid StrictMode/double-render duplicates), then calls `sendUserActivity(user, "proposals-response")`. Put the storage helpers in `src/lib/gate/storage.ts` and add the key to `clearStudyStorage`. The study provider is unchanged.

## Expected File Changes
- `src/lib/auth/user-activity.ts` and `.test.ts`: create.
- `src/components/auth/user-activity-reporter.tsx` and `.test.tsx`: create.
- `src/app/(app)/layout.tsx`: mount the reporter (modify).
- `src/components/proposals/proposals-table.tsx` and its test, `src/lib/gate/storage.ts` and its test: modify.
- `e2e/user-activity.spec.ts`: create.
- `docs/domain-model.md` and `docs/technical-discovery.md` (activity triggers, refresh deviation, keepalive); `feature_list.json`; `PROGRESS.md`.

## Visual Design Impact
- None. There is no UI. `DESIGN.md` is not needed.

## Durable Documentation Impact
- `docs/domain-model.md`: update with the activity events and their triggers, and the once-per-job, table-shown counting rule (deviation from BmApp).
- `docs/technical-discovery.md`: update with the web lifecycle mapping (`onResume`/`onStop` → `visibilitychange`/`pagehide`, keepalive).
- `AGENTS.md`, `DESIGN.md`, `ARCHITECTURE.md`, `CONSTRAINTS.md`: not needed.

## Implementation Plan
1. Helper and unit tests.
2. Reporter and RTL tests, using fake `document.visibilityState` and dispatched events.
3. Proposals-response wiring in the study provider and tests.
4. E2E, then a live check in BmWeb, then docs.

## Implementation Tasks
- [ ] Helper tests: displayName used; blank displayName → email local part; blank email → null and no request; `keepalive` set; errors swallowed (rejected fetch, 500).
- [ ] Reporter tests:
  - [ ] granted → one online;
  - [ ] hidden → offline;
  - [ ] hidden + pagehide → one offline;
  - [ ] visible → online;
  - [ ] repeated visible → no duplicate;
  - [ ] nothing while `verifying`/`signed-out`;
  - [ ] listeners removed after sign-out;
  - [ ] a failing call does not sign out.
- [ ] Comparator tests:
  - [ ] the first render with visible proposals → one proposals-response;
  - [ ] a re-render, remount or fixed-amount edit for the same jobId → none;
  - [ ] a new jobId → one more;
  - [ ] the empty state (no visible proposals) → none;
  - [ ] `clearStudyStorage` removes the key.
- [ ] E2E (android-chromium, real QA backend for `user-data`; record the `user-activity/*` requests with `page.on("request")` while routing them to 200):
  - [ ] after sign-in, `online` is posted with `{name, email}`;
  - [ ] emulate hide/show to get `offline` then `online`: dispatch `visibilitychange` after overriding `document.visibilityState` via `page.evaluate`, or use `page.context().newPage()` + `bringToFront` if that works in headless;
  - [ ] a mocked CUPS study completes: no `proposals-response` on `/current-conditions`; exactly one after reaching `/proposals`; none after going back to `/proposals` or reloading and returning.
- [ ] Live QA (manual): with the local QA stack, sign in on the web, check the user shows Online in BmWeb `/dashboard/users` (or `GET /api/v1/user-activity/users` with an admin token), close the tab → Offline, and run one study → "Respuestas mensuales" +1. Record the result.

## Verification Plan
- `./init.sh`: green.
- `npm run test:e2e:quick -- e2e/user-activity.spec.ts` while iterating.
- A full `npm run test:e2e` once at the end (android-chromium, 15-minute timeout, no piping). Existing specs must not break; they may need `user-activity/*` routed if strict request assertions exist.
- Manual check against the feature's verification: "Activity visible in BmWeb users page" (the live QA task above).

## Evidence To Capture
- Vitest count, focused and full E2E results, and the BmWeb/admin API before/after values (online flag and monthly count).

## Validator Checklist
- [ ] Payload and the name/email fallback match BmApp `MainActivity.sendUserActivity`.
- [ ] Online/offline follow the visibility lifecycle, are deduplicated, and only run while granted.
- [ ] Offline uses `keepalive`.
- [ ] proposals-response fires once per jobId, when the table is first shown; the deviation from BmApp is documented.
- [ ] Failures are silent and never sign out; `user-data` and `auth/logout` are unchanged.
- [ ] Docs, `feature_list.json` and `PROGRESS.md` are updated.
