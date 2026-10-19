# Feature Implementation Spec: Price Update Notifications delivered (web push)

## Source Feature

- `id`: web-push-price-updates
- `area`: pwa
- `depends_on`: web-push-registration (accepted)
- `status`: accepted (2026-10-19)
- `source`: `feature_list.json`

## Goal

When BmWeb changes the price proposals, every Broker who enabled notifications in PowerAppWeb gets a system notification. Tapping it opens PowerApp on Proposals, and an open app silently refreshes the active study, the same way BmApp does.

## Key Findings

- BmBackend sends `price_updates` as a **data-only FCM topic message** with only an `AndroidConfig` (`FirebasePriceUpdatesNotifier`), wrapped by `DebouncingPriceUpdatesNotifier` (upsert bursts are coalesced; deletes and clears pass through). Data: `type=price_updates`, `payload=<PriceUpdatesNotification JSON>` (`eventType` in `PRICE_PROPOSALS_UPSERTED|DELETED|CLEARED`, `changedIds`, `changedCount`, `timestamp`).
- BmApp shows **no** system notification for it. `BrielFirebaseMessagingService` → `PriceUpdatesNotifier.publishPriceUpdate()` → `AppShellViewModel` → `consumptionStudyRepository.refreshActiveStudy()`.
- Web tokens can't join topics from the browser, and stored tokens are not subscribed (`../BmBackend/docs/WEB_PUSH.md`, "Not done yet").
- On the web, every push **must** show a notification. iOS revokes the subscriptions of web apps that receive silent pushes, and Chrome shows a generic "site updated in the background" notification. So the web shows a notification, which BmApp doesn't (a deliberate, platform-forced deviation).

**Decision: send directly to the stored tokens (multicast), not to topics.** The `web_push_tokens` table stays the single source of truth: a deleted row (logout or grant wipe) stops delivery immediately, with no topic subscriptions to keep in sync, and dead tokens are pruned from the send results.

## Non-Goals

- No web force logout over push. Grant deletion wipes the account's tokens before the `force_logout` send, so there would be nothing to deliver to. The existing `/user-data` re-check on tab return stays.
- No change to the Android message, the topics or BmApp.
- No notification preferences, in-app inbox, or per-event-type text.
- No deployment work (Vercel is set up separately). Real-device delivery is checked after it (`qa-real-device-checks`).
- No foreground `onMessage` through the FCM SDK and no `firebase-messaging-sw.js`. `/sw.js` handles `push` itself.

## Job Story

When BmWeb publishes new tariffs while a Broker is out with a customer,
they want to be told on their phone and land on the updated comparison,
so they never quote stale prices.

## Users And Permissions

- Recipients: every row in `web_push_tokens`. Only granted Brokers can create rows, and grant deletion wipes them.
- The notification carries no customer or Broker data, only a generic text and the `/proposals` URL. The Proposals screen still goes through auth and the fee-first gate redirects.

## Acceptance Scenarios

### Scenario 1: Backend sends to web tokens
Given a price-table route calls `priceUpdatesNotifier.notify(n)` (after the debounce)
When the notification is flushed
Then the existing Android topic message is sent unchanged, **and** `WebPushPriceUpdatesNotifier` loads all tokens and sends FCM multicast in chunks of ≤ 500 (`sendEachForMulticast`), with:
- data `type=price_updates` and `payload=<same JSON>`;
- **no** `notification` block (the service worker builds it);
- `WebpushConfig` headers `Urgency: high` and `TTL: 86400`.

Failures in one channel never block the other, and errors are logged, never thrown.

### Scenario 2: Dead tokens are pruned
Given a send result for a token fails with `UNREGISTERED`, `SENDER_ID_MISMATCH`, or `INVALID_ARGUMENT`
Then that token row is deleted (`deleteByTokens`). Other errors (`UNAVAILABLE`, `INTERNAL`, `QUOTA_EXCEEDED`) keep the row. The log shows counts and masked tokens only (first 12 characters).

### Scenario 3: No tokens
Given `web_push_tokens` is empty
Then no FCM web call is made (no empty multicast).

### Scenario 4: Service worker `push`
Given `/sw.js` receives a push whose JSON (`event.data.json()`) has `data.type === "price_updates"` (FCM puts the data map under `data`; confirm the exact shape in the live check and record it)
Then inside `event.waitUntil` it:
1. posts `{type: "bm:price_updates"}` to every window client (`clients.matchAll({type: "window", includeUncontrolled: true})`);
2. **always** calls `registration.showNotification`, with:
   - title "Tarifas actualizadas";
   - body "Hay nuevos precios. Toca para ver tus propuestas.";
   - `icon: "/icons/icon-192.png"`;
   - `tag: "price_updates"` (a new one replaces the previous one);
   - `data: {url: "/proposals"}`.

A push that can't be parsed, or has any other type, still shows a notification: title "PowerApp", no body, opening `/`. Never stay silent (iOS rule).

### Scenario 5: Tapping the notification
Given the Broker taps the notification
Then it closes. If a PowerApp window client exists, the worker focuses it, navigates it to the `url`, and posts `bm:price_updates`. Otherwise it calls `clients.openWindow(url)`. A locked Proposals screen redirects through the existing gate.

### Scenario 6: In-app refresh
Given the app is open (visible or in the background), with a published study and no running job
When it receives `bm:price_updates` from the service worker
Then `ConsumptionStudyProvider` refreshes the study **ignoring the 60 s throttle**. This is BmApp parity: every event refreshes, and the backend already debounces. It uses the same silent `consumption-report-refresh` path and the same error handling. With no study, or with a running job, nothing happens. If a refresh is already in flight, it is not duplicated.

### Scenario 7: Docs say the channel is live
`../BmBackend/docs/WEB_PUSH.md` "Not done yet" is replaced by a "Delivery" section covering multicast, pruning, the data-only payload and the reasons.

## Repository Research

### Files Inspected
- BmBackend (`qa`, clean, `94788af web-push-registration feature (#65)`):
  - `services/{FirebasePriceUpdatesNotifier,DebouncingPriceUpdatesNotifier,FirebaseForceLogoutNotifier,WebPushTokensService}.kt`;
  - `repositories/WebPushTokensRepository.kt` and its port (`upsert`, `deleteByTokenForUid`, `deleteByEmail`);
  - `models/PriceTableModels.kt` (`PriceUpdatesNotification`);
  - `Application.kt:200` (`DebouncingPriceUpdatesNotifier(FirebasePriceUpdatesNotifier())`);
  - `routes/PriceTableRoutes.kt` (5 `notify` call sites);
  - `src/test/.../testing/InMemoryWebPushTokensRepository.kt`;
  - `docs/WEB_PUSH.md`.
- BmApp: `notifications/{BrielFirebaseMessagingService,NotificationHandler}.kt` and `ui/views/AppShellViewModel.kt`.
- Web:
  - `public/sw.js` (install/activate only);
  - `src/lib/pwa/push.ts` (token on the `/sw.js` registration, E2E seam);
  - `src/components/pwa/push-provider.tsx`;
  - `src/app/(app)/layout.tsx` (`PushProvider` > `FeeFirstGateProvider` > `ConsumptionStudyProvider`);
  - `src/components/consumption/consumption-study-provider.tsx` (`refreshStudy`, `REFRESH_THROTTLE_MS`, `doRefresh`, visibility trigger);
  - `src/lib/gate/fee-first.ts` (`ROUTES`);
  - `e2e/push-registration.spec.ts`.

### Patterns To Follow
- Notifier interface plus decorators (`DebouncingPriceUpdatesNotifier`); `runCatching` and logging in the Firebase notifiers; in-memory repositories in tests; masked tokens.
- Web: Spanish strings in `src/lib/pwa/messages.ts` (the service worker can't import them; keep a copy in `sw.js` and assert they are equal in a test).

### Gaps / Unknowns
- The FCM web push payload shape seen by a raw `push` handler (`{data: {...}, from, fcmMessageId, ...}`) comes from FCM docs and community practice, not a repo test. Verify it live and adjust the parser if needed.
- Playwright's incognito contexts have no Push API (noted in `web-push-registration`), so a real push is checked manually: a headed persistent-profile Chromium against local QA, then real phones after deployment.

## Technical Approach

### Backend (BmBackend, branch from `qa`, e.g. `feature/web-push-price-updates`)
1. Port: add `allTokens(): List<String>` and `deleteByTokens(tokens: Collection<String>): Int`, in Exposed and in the in-memory implementation.
2. `services/WebPushSender.kt`: an interface `sendMulticast(tokens, data, ttlSeconds): List<SendOutcome>`. `SendOutcome` holds the token and either success or an error code string. `FirebaseWebPushSender` uses `MulticastMessage` + `WebpushConfig` + `sendEachForMulticast`.
3. `services/WebPushPriceUpdatesNotifier.kt` (`PriceUpdatesNotifier`): chunks of 500, prunes the error codes from Scenario 2, logs counts.
4. `services/CompositePriceUpdatesNotifier.kt`: calls every delegate, isolating failures.
5. `Application.kt`: `DebouncingPriceUpdatesNotifier(CompositePriceUpdatesNotifier(listOf(FirebasePriceUpdatesNotifier(), WebPushPriceUpdatesNotifier(webPushTokensRepository, FirebaseWebPushSender()))))`. Move `webPushTokensRepository` above it.
6. Update `docs/WEB_PUSH.md`.

### Web
7. `public/sw.js`: `push` and `notificationclick` handlers (Scenarios 4 and 5). Plain JS, no imports, functions on `self` kept small.
8. `src/lib/pwa/sw-messages.ts`: `PRICE_UPDATES_MESSAGE = "bm:price_updates"` and an `onServiceWorkerMessage(type, cb)` helper (no-op without `navigator.serviceWorker`).
9. `ConsumptionStudyProvider`: add `refreshStudy({ force })` (force skips only the throttle) and subscribe to `PRICE_UPDATES_MESSAGE`.

## Expected File Changes
- BmBackend:
  - create `services/{WebPushSender,FirebaseWebPushSender,WebPushPriceUpdatesNotifier,CompositePriceUpdatesNotifier}.kt` and tests;
  - modify the token repository, its port and the in-memory implementation, `Application.kt`, and `docs/WEB_PUSH.md`.
- Web:
  - modify `public/sw.js`, `src/components/consumption/consumption-study-provider.tsx` and its test;
  - create `src/lib/pwa/sw-messages.ts`, `src/lib/pwa/sw.test.ts` (loads `public/sw.js` into a fake `self` via `new Function`), and `e2e/push-price-updates.spec.ts`.
- Docs: `docs/technical-discovery.md`, `docs/domain-model.md` (refresh trigger), `docs/risks-and-open-questions.md`, `DESIGN.md` (notification text and icon), `docs/after-qa-release-tasks.md`, `feature_list.json`, `PROGRESS.md`.

## Visual Design Impact
- A system notification only: Spanish title and body from Scenario 4, the `icon-192` brand icon, no actions. Record it in `DESIGN.md`. No new in-app UI.

## Durable Documentation Impact
- `docs/technical-discovery.md`: update with the delivery path (multicast, data-only, service worker notification, tap → `/proposals`, refresh message).
- `docs/domain-model.md`: update the refresh triggers (push → forced refresh, BmApp parity).
- `docs/risks-and-open-questions.md`: update with the payload shape confirmed live, iOS silent-push revocation, and no web force-logout push.
- `DESIGN.md`: update.
- BmBackend `docs/WEB_PUSH.md`: update.
- `AGENTS.md`, `ARCHITECTURE.md`, `CONSTRAINTS.md`: not needed.

## Implementation Plan
1. Backend: port additions, sender, notifier, composite and wiring, with tests. Run `./gradlew test`, then `../BmInfra/bm-local-qa rebuild-backend`.
2. Web: service worker handlers with the `sw.test.ts` harness.
3. Provider forced refresh and subscription, with RTL tests.
4. E2E, the live check, then docs.

## Implementation Tasks
- [x] Backend tests:
  - [x] multicast carries the data and has no notification block;
  - [x] 1,201 tokens are sent in 3 chunks;
  - [x] the prune codes delete the rows, other codes keep them;
  - [x] no tokens → no send;
  - [x] the composite still calls the web notifier when Android throws, and the reverse;
  - [x] the debouncer still coalesces (existing tests are green).
- [x] `sw.test.ts`:
  - [x] a `price_updates` push posts to the clients and shows the notification (title, body, tag, data);
  - [x] a bad JSON or unknown type push still shows the fallback;
  - [x] a click focuses and navigates an existing client and posts the message, otherwise opens a window;
  - [x] the strings equal `messages.ts`.
- [x] Provider tests:
  - [x] the message refreshes within the throttle window;
  - [x] no study → no call;
  - [x] a running job → no call;
  - [x] an in-flight refresh is not duplicated.
- [x] E2E (android-chromium), signed in with a published study (reuse the `proposals.spec.ts` fixtures and routes):
  - [x] dispatch a `MessageEvent` with `bm:price_updates` on `navigator.serviceWorker` → a POST to `consumption-report-refresh/<jobId>` happens even right after a previous refresh;
  - [x] the table shows the refreshed prices.
  - [x] Optionally try CDP `ServiceWorker.deliverPushMessage`. If the incognito context has no Push API, record that and rely on `sw.test.ts`.
- [x] Live (local QA):
  - [x] in a headed persistent-profile Chromium on the E2E production build, enable notifications (token row present);
  - [x] trigger a price upsert from BmWeb against local QA (or the route with an admin token);
  - [x] the notification shows within the debounce window, the tap opens `/proposals`, and the study refreshes;
  - [x] record the raw push JSON shape.
  - [x] Delete the token row manually and send again: no delivery and no errors. A row with a fake token is pruned.

## Verification Plan
- BmBackend: `./gradlew test`, then `../BmInfra/bm-local-qa rebuild-backend` (10-minute timeout).
- Web: `./init.sh`, then `npm run test:e2e:quick -- e2e/push-price-updates.spec.ts`, then a full `npm run test:e2e` once (15-minute timeout, no piping).
- Feature verification "Trigger from BmWeb; receive on installed iPhone and Android Chrome": the local desktop or Android live check now. The installed iPhone and Android Chrome checks after the deployment are in `docs/after-qa-release-tasks.md` and `qa-real-device-checks`.

## Evidence To Capture
- Gradle test count, the rebuild readiness, the Vitest count, focused and full E2E results, the live-check notes (payload shape, notification screenshot, refresh request, prune log line with masked token), and the real-device deferral.

## Validator Checklist
- [ ] The Android topic message is unchanged, and the web multicast is data-only, chunked and pruned on the right codes.
- [ ] Every web push shows a notification. A tap opens `/proposals` and posts the refresh.
- [ ] The forced refresh skips only the throttle, and keeps the no-study, running-job and in-flight guards.
- [ ] No force-logout push, no topic subscription, no SDK messaging service worker, no BmApp change.
- [ ] Backend on a branch from `qa` only. Docs, `feature_list.json` and `PROGRESS.md` are updated.

## Implementation Notes (2026-10-19)

- **Payload shape confirmed live** (desktop Chromium, real FCM): `{"data":{"type":"price_updates","payload":"<JSON>"},"priority":"high","from":"<sender>","fcmMessageId":"…"}`. The `data.type` parser needed no change.
- **E2E covers the real `/sw.js` push handler**: CDP `ServiceWorker.deliverPushMessage` works in normal (incognito) Playwright contexts, so `e2e/push-price-updates.spec.ts` delivers a push to the service worker and asserts the page refresh, in addition to the synthetic `MessageEvent` test.
- **Tap message**: the click posts `bm:price_updates` only for the `price_updates` tag (not for the fallback). `client.navigate` reloads the page; the restore path already refreshes once, so the posted message is best-effort.
- **Backend**: `WebPushSender.SendOutcome.errorCode` is the FCM `MessagingErrorCode` name (`UNKNOWN` when absent). A chunk that throws is logged and counted as failed; later chunks still go out. The message builder in `FirebaseWebPushSender` has no unit test (Admin SDK message classes are opaque); the data-only payload is asserted at the notifier boundary and in the live check.
- **Live trigger**: re-saving tax settings with unchanged values (`PATCH price-table-tax-settings`, admin) is a side-effect-free way to fire `PRICE_PROPOSALS_UPSERTED`. Note it also sends the Android topic message to QA devices.
