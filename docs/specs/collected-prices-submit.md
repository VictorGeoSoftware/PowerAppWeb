# Feature Implementation Spec: Submit collected prices

## Source Feature

- `id`: collected-prices-submit
- `area`: conditions
- `depends_on`: current-conditions-form (accepted)
- `status`: not_started
- `source`: `feature_list.json`

## Goal

When the Broker taps "Ir a las propuestas de precios" on Current Conditions, send the customer's current prices to BmBackend `POST /api/v1/collected-prices`, the same way BmApp does (`CurrentUserConditionsViewModel.onNavigateToProposalsClicked`). The request runs in the background: it never blocks, delays or fails navigation to `/proposals`. It is sent at most once per consumption job, and never for 2.0TD or a blank tariff.

## Non-Goals

- No offline outbox or retries. A failed send is lost, as in BmApp.
- No UI feedback for the send: no toast, spinner or error message.
- No backend changes. The endpoint, 2.0TD exclusion and normalization already exist in BmBackend.
- No `/proposals` content (`proposals-table`) and no copy-from-proposal sheet.
- No customer personal data in the payload: no CUPS, holder or address.

## Job Story

When I finish typing my customer's current prices and go to the proposals,
I want those prices to be collected in the background,
so the business can analyse market prices without slowing me down.

## Users And Permissions

- Broker (granted account): may submit. The backend checks `requireGrantedFirebaseUser`. The proxy already allows `collected-prices` (`src/lib/server/backend-proxy.ts`).

## Acceptance Scenarios

### Scenario 1: 3.0TD study is submitted
Given an unlocked 3.0TD study with job `J`, supplier " Iberdrola ", P1..P6 power/energy prices (some with a comma) and extra services "12,5"
When the Broker taps "Ir a las propuestas de precios"
Then the app navigates to `/proposals` right away
And it sends one `POST /api/bm/collected-prices` with the Firebase Bearer token and the JSON body `{companyName:"Iberdrola", tariffType:"3.0TD", powerPrices:{P1:…,…}, energyPrices:{…}, extraServices:12.5}`. Prices are numbers, and the keys are only the session's periods.

### Scenario 2: Once per job
Given scenario 1 already submitted for job `J`
When the Broker goes back to Current Conditions, changes a price and taps the CTA again (including after a page reload)
Then no second POST is sent for `J`.

### Scenario 3: 2.0TD and blank tariff are excluded
Given a study whose `feeType` canonicalizes to `20TD` ("2.0TD", "2.0 td", …), or is blank or missing
When the Broker taps the CTA
Then no POST is sent, and navigation still happens.

### Scenario 4: Nothing worth sending
Given a blank supplier, or no price that parses
Then no POST is sent. This cannot happen in practice once the gate is unlocked, but the build function must return `null`.

### Scenario 5: Backend failure is invisible
Given the POST returns 4xx/5xx or the network fails
Then the Broker stays on `/proposals` with no error UI, and is not signed out. Do not route the error through `reportApiError`.

### Scenario 6: New study resets the guard
Given job `J` was submitted and the Broker starts a new study, which produces job `K`
When they tap the CTA for `K`
Then `K` is submitted.

## Repository Research

### Files Inspected
- `../BmApp/.../CurrentUserConditionsViewModel.kt`: trigger order: mark job → should collect → build → fire-and-forget.
- `../BmApp/domain/.../BuildCollectedPricesUseCase.kt`: build rules: trim supplier, only session periods, parse comma decimals, return null when empty.
- `../BmApp/domain/.../ShouldCollectPricesUseCase.kt` and `TariffCanonicalForm.kt`: canonical form is uppercase with non-alphanumerics removed. `20TD` and blank are excluded.
- `../BmApp/data/.../CollectedPricesMapper.kt` and `CollectedPricesRequest.kt`: wire format `{companyName, tariffType, powerPrices, energyPrices, extraServices?}`.
- `../BmApp/data/.../PriceTableApi.kt` (`submitCollectedPrices`): any 2xx counts as success. 204 is returned for an excluded tariff.
- `../BmApp/data/.../ConsumptionSessionRepositoryImpl.kt`: `markCollectedPricesSubmitted`. This is a per-job set that is cleared when the session is cleared.
- `../BmApp/.../ConsumptionSessionRepositoryImpl.kt:59`: `tariffName = report.consumptionData.feeType`.
- `../BmBackend/.../routes/CollectedPricesRoutes.kt` and `models/CollectedPriceSubmitRequest.kt`: 201 Stored / 204 Excluded / 400 for invalid keys (`^P[1-6]$`) or empty maps.
- `src/components/conditions/current-conditions-form.tsx`: the hook point is `onGoToProposals`.
- `src/lib/gate/fee-first.ts`: `ConsumptionSession` (`jobId`, `feeType`, periods), `CurrentConditions` (string maps), `isFilledPrice`.
- `src/lib/gate/storage.ts`: `clearStudyStorage()`.
- `src/components/gate/fee-first-gate-provider.tsx`: `startNewStudy` calls `clearStudyStorage`.
- `src/lib/api/bm-fetch.ts`: `bmFetch(user, path, init)`. It throws `BmApiError` on non-2xx responses.
- `src/components/auth/auth-provider.tsx`: `useAuth().user`.
- `e2e/current-conditions.spec.ts`: job-mocking pattern with `page.route`.

### Existing Patterns To Follow
- Pure logic in `src/lib/<area>/*.ts` with colocated Vitest `*.test.ts`. Components stay thin.
- Storage keys use the `bm.*` prefix in `src/lib/gate/storage.ts`.
- E2E mocks job endpoints with `page.route("**/api/bm/...")`. Auth is real QA.

### Current Gaps
- There is no tariff canonical helper or collected-prices module yet.
- The web app has no persistent repository singleton like BmApp's. A guard held only in memory would forget on reload, so this spec uses `sessionStorage`. This is a deliberate improvement on BmApp, which loses the guard on process death.

## Technical Approach

1. Create `src/lib/conditions/collected-prices.ts` with pure functions:
   - `canonicalTariff(raw: string): string`: uppercase, then keep only Unicode letters and digits (`/[^\p{L}\p{N}]/gu`).
   - `shouldCollectPrices(tariff?: string | null): boolean`: true when the canonical form is non-blank and not `"20TD"`.
   - `parsePrice(v?: string): number | undefined`: trim, replace `,` with `.`, `Number`. Accept finite numbers only, and treat `""` as undefined. Like Kotlin `toDoubleOrNull`, zero is allowed here; only the gate requires values > 0.
   - `buildCollectedPrices(session, conditions): CollectedPricesRequest | null`: return null if either is missing or the trimmed supplier is blank. Include only `session.powerPeriods` and `session.energyPeriods` keys whose value parses. Return null if both maps are empty. Set `tariffType = session.feeType ?? ""`. Include `extraServices` only when it parses; omit the key otherwise.
   - `markCollectedPricesSubmitted(jobId): boolean`: a JSON array of job ids in `sessionStorage` under `bm.collectedPricesJobIds`. Return true only the first time for each id.
   - `submitCollectedPrices(user, body)`: call `bmFetch(user, "collected-prices", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body)})`, then `.catch(() => {})`.
2. Add the order-preserving trigger `collectPricesOnNavigate(user, session, conditions)`. If `session.jobId` is missing, do nothing. Then, in order: mark the job, check the tariff, build the body, and submit without awaiting.
3. In `onGoToProposals`, read `user` from `useAuth()`. If it exists, call the trigger, then `router.push(ROUTES.proposals)` synchronously. Never await the send.
4. In `clearStudyStorage()`, also remove `bm.collectedPricesJobIds` from `sessionStorage`. That covers both new studies and logout, if logout uses it; check this and add it there if not.

## Expected File Changes
- `src/lib/conditions/collected-prices.ts`: create.
- `src/lib/conditions/collected-prices.test.ts`: create; unit tests for every rule.
- `src/components/conditions/current-conditions-form.tsx`: modify `onGoToProposals`.
- `src/lib/gate/storage.ts` (+ `storage.test.ts`): modify; clear the guard key.
- `e2e/current-conditions.spec.ts`: modify; add submit scenarios, or create `e2e/collected-prices.spec.ts` if that reads better.
- `feature_list.json`, `PROGRESS.md`: evidence.

## Visual Design Impact
- UI involved: no visible change. Navigation behavior is unchanged.

## Durable Documentation Impact
- `ARCHITECTURE.md` / `CONSTRAINTS.md`: not needed; neither file exists and there is no new boundary.
- `AGENTS.md`: not needed.
- `docs/domain-model.md`: update the Collected Prices line. The data is submitted when the Broker leaves Current Conditions for the proposals, once per job, with 2.0TD excluded and no personal data.

## Implementation Plan
1. Pure module and unit tests.
2. Storage guard cleanup.
3. Wire into the form.
4. E2E and docs.

## Implementation Tasks
- [ ] `canonicalTariff`/`shouldCollectPrices`: tests for "3.0TD", "3.0 td", "2.0TD", "2.0 TD ", "", undefined, and "6.1TD".
- [ ] `buildCollectedPrices`: tests for comma parsing, trimmed supplier, extra periods in conditions ignored, unparseable values dropped, extraServices omitted when blank, and null cases.
- [ ] Guard tests: first call true, then false; a different job is true; false after `clearStudyStorage()`.
- [ ] Trigger tests (mock `bmFetch`/fetch): excluded tariff → no call; rejected promise swallowed; missing jobId → no call.
- [ ] Wire `onGoToProposals` and keep the push synchronous.
- [ ] E2E (android-chromium). Change the mocked report to `feeType/tarifa "3.0TD"`, or add a second fixture. Intercept `**/api/bm/collected-prices` with `route.fulfill({status:201})` and record requests, so nothing is written to the QA DB. Assert one POST with the expected body after the CTA, `/proposals` URL, and no second POST after going back and tapping again. A 2.0TD case asserts zero POSTs. A 500 response still lands on `/proposals` with no error text.
- [ ] Update `docs/domain-model.md`.

## Verification Plan
- `./init.sh`: lint, typecheck and vitest are green.
- `npm run test:e2e:quick -- e2e/current-conditions.spec.ts` (plus the new spec, if created) while iterating.
- Full `npm run test:e2e` once at the end (android-chromium; 15-minute timeout; no piping).
- Feature verification "Proxy log/QA DB shows entry": one manual live check against local QA. `../BmInfra/bm-local-qa ready`, then on `npm run dev` (user, port 9003) run a 3.0TD study and tap the CTA. Confirm that the backend log shows a 201 for `POST /api/v1/collected-prices` and that a new row appears in `collected_prices`, through the BmWeb dashboard or `psql`. Mocked E2E does not cover this check.

## Evidence To Capture
- Vitest count, the focused and full E2E results, and the live QA row or log line (supplier, tariff, timestamp) in `PROGRESS.md` and `feature_list.json`.

## Validator Checklist
- [ ] Payload matches the BmApp `CollectedPricesRequest` field names and types exactly. It contains no CUPS, holder or address.
- [ ] Order is mark → should → build → send, and navigation is never awaited or blocked.
- [ ] 2.0TD variants and blank tariff send nothing. Failures are silent and do not sign the Broker out.
- [ ] The once-per-job guard survives a reload and is cleared by a new study.
- [ ] E2E mocks the POST, so the automated suite writes nothing to QA. The live QA entry is evidenced manually.
- [ ] `feature_list.json` and `PROGRESS.md` are updated. No unrelated changes.
