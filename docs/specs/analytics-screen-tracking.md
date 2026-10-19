# Feature Implementation Spec: Firebase Analytics screen tracking

## Source Feature

- `id`: analytics-screen-tracking
- `area`: platform
- `depends_on`: app-shell-navigation (accepted)
- `status`: not_started
- `source`: `feature_list.json`

## Goal

Port BmApp's analytics foundation to the web:
- a tracker module that sends nothing unless collection is allowed (BmApp `AnalyticsCollectionPolicy` + `NoOpAnalyticsTracker`);
- one GA4 `screen_view` per screen the Broker actually sees, with the exact BmApp screen names (`BmAppRouteAnalytics.kt`).

Firebase Analytics collection is off in dev, QA, E2E and tests, and on only in the production deployment.

## Non-Goals

- **No action/outcome events** (`login_*`, `cups_scan_*`, `consumption_fetch_*`, `proposals_generated`, `proposal_pdf_*`, `proposal_visibility_changed`). The tracker exposes `track(event)` so they can be added later. Recommended follow-up feature: `analytics-events` (depends on this one; see Output Notes).
- No Crashlytics equivalent, no user id or user properties, no consent banner (nothing identifying is sent; see Privacy).
- No backend changes.

## Job Story

When the product owner looks at Firebase Analytics,
they want web screen views under the same names as Android,
so funnels compare both clients without mapping tables.

## Users And Permissions

- No access rules. Signed-in screens are tracked only once the guards let them render.

## Acceptance Scenarios

### Scenario 1: Collection gate
Given `NEXT_PUBLIC_ANALYTICS_ENABLED` is not exactly `"true"`, or `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` is empty, or `isSupported()` from `firebase/analytics` resolves false
Then the tracker is a no-op: `firebase/analytics` is never initialized, and no request goes to `google-analytics.com` or `googletagmanager.com`.
Only the production deployment sets `NEXT_PUBLIC_ANALYTICS_ENABLED=true`. `.env.example` documents it as `false`. E2E and Vitest run with it unset.

### Scenario 2: Initialization when allowed
Given collection is allowed
Then analytics is initialized lazily with `initializeAnalytics(app, { config: { send_page_view: false } })`, so the automatic URL-based page_view does not double count. It is created once per page load.
`NEXT_PUBLIC_ANALYTICS_DEBUG=true` additionally adds `debug_mode: true` to every event, so the events show in Firebase DebugView. It is used only for the manual verification.

### Scenario 3: Screen names (BmApp parity)
| Web screen | `firebase_screen` |
|---|---|
| `/login` (signed out) | `auth_login` |
| `/fetch-consumption` | `fetch_consumption` |
| CUPS scanner open (overlay on fetch-consumption) | `cups_scanner` |
| `/current-conditions` | `current_conditions` |
| `/proposals` | `proposals` |
| `/configuration` | `configuration` |

Each one is sent as `logEvent(analytics, "screen_view", { firebase_screen: name, firebase_screen_class: name })`. Names are hard-coded in one map, never derived from paths, following the BmApp rule: "these names must survive refactors".

### Scenario 4: Only screens actually seen, once per visit
- A screen is reported when it renders its content: inside `FeeFirstGateGuard`, only when there is no redirect target (BmApp `stage.canReach(currentRoute)`), and on `/login` only when the login form shows. A redirect bounce, such as a cold `/proposals` without a study, never reports `proposals`.
- One event per entry into a screen. Re-renders, StrictMode double effects and state changes on the same screen do not re-send (BmApp keys on the resolved route).
- Opening the CUPS scanner reports `cups_scanner`. Closing it reports `fetch_consumption` again, because BmApp navigates back to that route and it emits again.
- Navigating A → B → A reports A twice.

### Scenario 5: Privacy
The params are only `firebase_screen`, `firebase_screen_class` and optionally `debug_mode`. There is no user id, email, CUPS or query string. The web routes contain no identifiers, so the automatic `page_location` is acceptable. Write a short privacy contract in `src/lib/analytics/` that mirrors the BmApp `AnalyticsEvent` comment, for future events.

## Repository Research

### Files Inspected
- `../BmApp/domain/.../monitoring/{AnalyticsTracker,AnalyticsEvent,AnalyticsFailureReason}.kt`: the contract, privacy rules and future event catalog.
- `../BmApp/analytics/.../{FirebaseAnalyticsTracker,NoOpAnalyticsTracker,AnalyticsCollectionPolicy}.kt`: `SCREEN_VIEW` + `SCREEN_NAME`, name sanitizing, and the release-only gate.
- `../BmApp/app/.../ui/navigation/BmAppRouteAnalytics.kt` (the names), `MainStructureView.kt:70-83` (keyed on the route, skips unreachable routes), `MainActivity.kt:95-99` (login screen).
- `src/lib/firebase/{config,client}.ts`: `measurementId` already read from `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`; `getFirebaseApp()`. `firebase` v11 is installed and includes `firebase/analytics`.
- `src/components/gate/fee-first-gate-provider.tsx` (`FeeFirstGateGuard`, `gateRedirect`), `src/app/(app)/layout.tsx`, `src/app/login/page.tsx`, `src/components/consumption/cups-scanner-option.tsx` (`open` state).
- `.env.example`, `.env.local` (keys only).

### Existing Patterns To Follow
- Lazy, injectable Firebase access (`getFirebaseAuth()`); env vars read literally for Next inlining (`config.ts`).
- Pure modules in `src/lib/<area>/` with Vitest; components inject or mock lib modules in tests.

### Current Gaps
- There is no analytics code yet. Production deployment config (where `NEXT_PUBLIC_ANALYTICS_ENABLED` is set) is not in this repo. Record this in `docs/technical-discovery.md` and as an open item for `pwa-installable` / deployment.

## Technical Approach

1. **`src/lib/analytics/policy.ts`**: `isAnalyticsAllowed(env)` is pure and covers Scenario 1 apart from `isSupported`.
2. **`src/lib/analytics/tracker.ts`**: `AnalyticsTracker = { trackScreen(name), track(name, params) }`. `getAnalyticsTracker()` returns the no-op unless allowed. The Firebase implementation dynamic-imports `firebase/analytics` (keeping it out of the main bundle when disabled), awaits `isSupported()`, initializes once, and queues calls made before init. `track` sanitizes names like BmApp (≤ 40 chars, `[A-Za-z0-9_]`, starts with a letter) and drops non-primitive params.
3. **`src/lib/analytics/screens.ts`**: the `ScreenName` union plus the `SCREEN_BY_PATH` map for the routed screens.
4. **`src/components/analytics/use-track-screen.ts`**: `useTrackScreen(name | null)`. An effect keyed on `name` sends once per change, with a ref guard against StrictMode double effects; `null` means not visible.
5. Wiring:
   - `FeeFirstGateGuard` (or a small `<ScreenTracker />` rendered only in its non-redirect branch) calls `useTrackScreen(SCREEN_BY_PATH[pathname])`, and passes `null` while the scanner is open.
   - The `/login` page calls `useTrackScreen("auth_login")` only when the form renders.
   - `CupsScannerOption` reports `cups_scanner` while `open`. Use a small context or callback so `fetch_consumption` is re-sent when the scanner closes.

## Expected File Changes
- `src/lib/analytics/{policy,tracker,screens}.ts` and tests: create.
- `src/components/analytics/use-track-screen.ts` and test: create.
- `src/components/gate/fee-first-gate-provider.tsx`, `src/app/login/page.tsx` (or `login-form.tsx`), `src/components/consumption/cups-scanner-option.tsx`: modify.
- `.env.example`: add `NEXT_PUBLIC_ANALYTICS_ENABLED=false` and `NEXT_PUBLIC_ANALYTICS_DEBUG=false`.
- `e2e/analytics.spec.ts`: create.
- `docs/technical-discovery.md` (Observability), `README.md` (env vars), `feature_list.json`, `PROGRESS.md`.

## Visual Design Impact
- None. `DESIGN.md` is not needed.

## Durable Documentation Impact
- `docs/technical-discovery.md`: update the Observability section with the gate, the screen names, the DebugView procedure and where production sets the flag.
- `README.md`: update with the two new env vars.
- `docs/domain-model.md`, `AGENTS.md`, `DESIGN.md`, `ARCHITECTURE.md`, `CONSTRAINTS.md`: not needed.

## Implementation Plan
1. Policy and screen map, with tests.
2. Tracker (no-op, Firebase with mocked `firebase/analytics`, queue, sanitizing), with tests.
3. Hook and wiring, with RTL tests.
4. E2E (gate off), then a manual DebugView check, then docs.

## Implementation Tasks
- [ ] Policy tests: the flag missing, `"false"`, `"TRUE"` (not exactly `true`) or without a measurement id → not allowed; `"true"` with an id → allowed.
- [ ] Tracker tests (mock `firebase/analytics`):
  - [ ] disabled → `initializeAnalytics` is never called;
  - [ ] `isSupported` false → no-op;
  - [ ] enabled → initialized once with `send_page_view:false`;
  - [ ] a `trackScreen` sent before init is delivered after it;
  - [ ] params are exactly `{firebase_screen, firebase_screen_class}`, plus `debug_mode` only when the debug flag is set;
  - [ ] name sanitizing.
- [ ] Hook/wiring tests:
  - [ ] the guard redirect branch → nothing;
  - [ ] a rendered `/proposals` → one `proposals`;
  - [ ] a re-render → no extra event;
  - [ ] a path change → a new event;
  - [ ] scanner open → `cups_scanner`, close → `fetch_consumption`;
  - [ ] login → `auth_login`.
- [ ] E2E (android-chromium, flag unset as in the standard script), in `e2e/analytics.spec.ts`: sign in, visit `/fetch-consumption`, `/current-conditions` and `/proposals` with mocked study routes, and assert **zero** requests to `google-analytics.com`/`googletagmanager.com` (record them with `page.on("request")`). Positive delivery cannot be asserted in E2E without enabling collection, so it is covered by unit tests and DebugView.
- [ ] Manual DebugView: run a local build with `NEXT_PUBLIC_ANALYTICS_ENABLED=true NEXT_PUBLIC_ANALYTICS_DEBUG=true` (a build on a port other than 9003/9004, or ask the user to run it). Walk login → fetch → scanner → current conditions → proposals → configuration, and confirm the names in Firebase DebugView. The user may need to do this step (Firebase console access). Record the result or the deferral.

## Verification Plan
- `./init.sh`: green.
- `npm run test:e2e:quick -- e2e/analytics.spec.ts` while iterating.
- A full `npm run test:e2e` once at the end (android-chromium, 15-minute timeout, no piping).
- Feature verification: unit tests (gate, screen names, init, once-per-entry) and the E2E "no GA traffic" check. The manual DebugView check is deferred to `qa-real-device-checks` (user decision, 2026-10-19).

## Evidence To Capture
- Vitest count, focused and full E2E results, the DebugView screenshot or user confirmation (or a recorded deferral), and a note on the production flag location.

## Validator Checklist
- [ ] Screen names match `BmAppRouteAnalytics.kt` exactly and live in one hard-coded map.
- [ ] Redirected or unreachable screens are never reported; there are no duplicates on re-render.
- [ ] With the flag off: no Firebase Analytics init and no GA network traffic (E2E proves it).
- [ ] No identifying params; automatic page_view disabled.
- [ ] Action events are not implemented (they stay a separate follow-up feature).
- [ ] Docs, `.env.example`, `feature_list.json` and `PROGRESS.md` are updated.

## Output Notes
- Recommended follow-up feature entry, to be added only with the user's approval: `analytics-events` ("Track BmApp analytics events (login, CUPS scan, consumption fetch, proposals generated, PDF export, visibility changed) with the same names, params and failure reasons", depends_on `analytics-screen-tracking`). Several specs already point here for those events (`comparator-pdf-share`, the `cups-scanner.tsx` comment).
