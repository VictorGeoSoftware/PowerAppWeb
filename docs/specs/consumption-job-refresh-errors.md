# Feature Implementation Spec: Job failure and refresh handling

## Source Feature

- `id`: consumption-job-refresh-errors
- `area`: consumption
- `depends_on`: consumption-by-cups-manual (`accepted`)
- `status`: not_started at planning time (2026-10-16)
- `source`: `feature_list.json`

## Goal

This feature adds two things to the Consumption Job:

1. **Retry.** When a study fails, the error box on `/fetch-consumption` gets a "Reintentar" button. It starts the same study again: the same CUPS, or the same PDF file while that file is still in memory.
2. **Refresh.** A completed study refreshes its proposals and tax values through `POST consumption-report-refresh/{jobId}`. This runs on restore and when the tab becomes visible again, so the Broker sees current prices without starting a new study.

The feature entry says "refresh endpoint re-runs a job". That is wrong. In BmBackend (`qa`), `UserConsumptionRoutes.kt:340-386`, the endpoint only accepts COMPLETED jobs owned by the caller:

- It recalculates `proposals`, `iva` and `impuestoElectrico` from the consumption data already stored.
- It stores the result and returns `200 ConsumptionReportResponse`.
- It returns 404 for a missing, expired or foreign job, 409 for a job that is not completed, and 500 if the calculation fails.

A failed job is never re-run on the backend. Retry always creates a new job.

## Non-Goals

- Push-triggered refresh (BmApp `priceUpdatesNotifier`). This belongs to `web-push-price-updates`, which will call the same `refreshStudy()`.
- A manual "Actualizar precios" button, and refresh while a job is still polling.
- Retry for client-side file checks (non-PDF, > 50 MB). No request is sent in those cases and a retry would fail the same way.
- Keeping the PDF `File` across reloads (IndexedDB etc.).
- Proposals UI (`proposals-table`), camera and photo methods, backend changes.
- Changing failure codes or Spanish failure strings. They stay identical to BmApp.

## Job Story

When a study fails because of a network problem or a backend error,
I want to retry it with one tap without retyping the CUPS or picking the file again,
so I can keep going with the customer.

When I come back to the app later in the same study,
I want the proposals to use today's prices,
so I don't quote stale offers.

## Users And Permissions

- **Granted Broker.** The backend checks the grant and the job owner. 401/403 force a logout through `useBmFetch` (existing behaviour). A refresh 404 is treated as "job expired".

## Decisions (planner + user, 2026-10-16)

1. **Retry button.**
   - Shown only on study failures. That means `state.kind === "failed"`: SUBMIT_FAILED, PROCESSING_FAILED, STATUS_CHECK_FAILED, RESULT_FETCH_FAILED or TIMEOUT.
   - Never shown for `fileError`.
   - Label "Reintentar". It is inside the error alert, a secondary button at least 44px tall.
   - **CUPS failure:** resubmit `state.cups` as a new job (`startCups`).
   - **PDF failure:** re-upload the same `File`. The provider keeps it in a ref (`lastPdf`) only for the lifetime of the provider. Expose `canRetry` in the failed state. For PDF it is `true` only if the ref still holds the file. When it is `false`, the button is hidden and the alert stays as it is today.
   - The ref is cleared on success, reset ("Nuevo estudio"), logout (unmount), and when a CUPS study starts.
2. **Refresh triggers (web substitute for push).**
   - **(a) Restore.** After `restore(lastId)` publishes a session, chain one refresh. This follows BmApp: the push trigger keeps prices current there, and on web the restore is the realistic moment prices may have changed.
   - **(b) Tab visible.** On `visibilitychange` → visible, if a session exists and no job is running, refresh.
   - **Throttle.** At most one refresh per 60 s, measured from the last successful report publish or refresh attempt. This matches the access re-check throttle in `auth-provider.tsx`.
   - **Never refresh** right after a study completes inside this tab, because the throttle starts at publish.
3. **Refresh is silent.**
   - No spinner, no state change while it runs.
   - **200:** `setSession(toConsumptionSession(report, jobId))` with the same jobId, so the conditions are kept, and `saveLastCompletedJobId(jobId)` to extend the 1 h window.
   - **404:** `clearLastCompletedJobId()` and keep the current session (BmApp parity: no UI change).
   - **409, 5xx or network error:** ignore and keep the session (BmApp logs a non-fatal error; web has no crash reporter yet, so `console.warn` is enough).
   - **Ignore the response** if the session jobId changed, a reset happened, or the user changed.
4. Add `refreshPath(jobId)` and `refreshReport(fetch, jobId)` in `study.ts`. 200 is the only success; any other status throws.

## Acceptance Scenarios

### Scenario 1: Retry CUPS after FAILED
Given a CUPS study whose status returns `FAILED`
Then the alert shows "El procesamiento ha fallado. Inténtalo de nuevo." with a "Reintentar" button.
When the Broker taps it
Then a new POST `fetch-user-consumption-report-by-cups` is sent with the same `cupsCode`, the progress shows, and on COMPLETED the URL becomes `/current-conditions`.

### Scenario 2: Retry PDF
Given a PDF study fails (for example a submit 500)
When the Broker taps "Reintentar"
Then a new multipart POST is sent with the same filename, without opening the picker.

### Scenario 3: No retry when the file is gone or the error is local
- A PDF failure shown after a reload (job resumed, then failed) shows no "Reintentar".
- A local "Selecciona un archivo PDF." or 50 MB error shows no "Reintentar".

### Scenario 4: Retry hidden while running; reset clears it
While the retry runs, the methods and alert are replaced by the progress view (existing behaviour). "Nuevo estudio" leaves an empty form with no alert.

### Scenario 5: Refresh on restore
Given `bm.lastCompletedJobId` is less than 1 h old
When the app loads
Then it gets the result and then POSTs `consumption-report-refresh/{jobId}` once. The session shows the refreshed proposals and IVA, and conditions are unchanged.

### Scenario 6: Refresh on tab return (throttled)
Given a session exists
When the tab becomes visible more than 60 s after the last publish or refresh
Then exactly one refresh POST is sent. A second visibility change within 60 s sends none.

### Scenario 7: Refresh failures are silent
- Refresh 404: `bm.lastCompletedJobId` is removed, and the session and screen stay.
- 409, 500 or network error: no UI change, and the stored id is kept.
- 401/403: forced logout (existing `useBmFetch`).

### Scenario 8: No regressions
All existing `e2e/consumption-cups.spec.ts` and `consumption-pdf.spec.ts` tests pass. The failure strings are unchanged.

## Repository Research

### Files Inspected

- `src/lib/consumption/study.ts`: `runStudy`, `fetchResult`, path helpers.
- `src/lib/consumption/messages.ts`: failure strings (BmApp parity).
- `src/lib/consumption/report.ts`: `toConsumptionSession` includes `proposals`, `iva` and `impuestoElectrico`.
- `src/components/consumption/consumption-study-provider.tsx`: `run`, `restore`, `resumeOrRestore` on visibility, reset effect, `StudyState`.
- `src/app/(app)/fetch-consumption/page.tsx`, `cups-form.tsx`: the error alert lives in `CupsForm` through the `error` prop.
- `src/lib/gate/storage.ts`: active job and last completed id helpers.
- `src/components/gate/fee-first-gate-provider.tsx`: `setSession` only replaces the session, so conditions are kept.
- `src/lib/server/backend-proxy.ts`: `consumption-report-refresh` is already in `ALLOWED_ROOTS`.
- `src/components/auth/auth-provider.tsx`: 60 s visibility throttle pattern.
- `e2e/`: `consumption-cups.spec.ts`, `consumption-pdf.spec.ts`, `fixtures.ts` (`page.route` mocks).
- `../BmBackend/.../routes/UserConsumptionRoutes.kt:340-386`, `services/UserConsumptionService.kt:71-77`.
- `../BmApp`:
  - `ConsumptionStudyRepositoryImpl.kt:150-185` (`refreshActiveStudy`: 404 clears the id)
  - `AppShellViewModel.kt:38-48` (push → refresh)
  - `PriceTableApi.kt:190-211`
  - `FetchConsumptionScreen.kt:138-144` (no retry button)

### Existing Patterns To Follow

- All calls go through `useBmFetch`, which throws `BmApiError` with `.status` on non-2xx.
- Use the stale guards `ctrl.signal.aborted || uidRef.current !== uid`.
- Error box: `role="alert"`, `bg-destructive/10`, `text-foreground`, red icon.
- Provider tests inject `sleep`. E2E mocks the job endpoints with `page.route` on a real signed-in session.

### Current Gaps

- `StudyState.failed` has no `canRetry`, and no file is kept.
- There is no refresh client and no refresh trigger.

## Technical Approach

- **`study.ts`.** Add `refreshPath` and `refreshReport(fetch, jobId)`: POST, then return the parsed body if the status is 200, else throw.
- **Provider.**
  - `lastPdf = useRef<File | null>(null)`. Set it in `startPdf`. Clear it in `startCups`, on success and on reset.
  - Failed state: `{kind:"failed", message, source, cups, canRetry}`, where `canRetry = source === "cups" ? cups !== "" : lastPdf.current != null`.
  - Add `retry()` to the context: it calls `startCups(state.cups)` or `startPdf(lastPdf.current)`.
  - `lastRefreshAt = useRef(0)`. Set it on every publish (study success, restore, refresh).
  - `refreshStudy()`:
    - It is a no-op when there is no session, a job is running, or less than 60 s have passed since `lastRefreshAt`.
    - Otherwise it calls `refreshReport` with stale guards (session jobId and reset count) and handles 200 / 404 / other as in Decision 3.
    - The throttle interval is injectable as a prop for tests (`refreshThrottleMs`, default 60 000).
  - Expose `refreshStudy` on the context for `web-push-price-updates`.
  - In `restore`, after a successful publish, call the refresh directly, ignoring the throttle.
  - In the visibility handler: if there is a session, `refreshStudy()`; else `resumeOrRestore()`.
  - A session ref is needed for the jobId.
- **UI.**
  - `CupsForm` gets an optional `onRetry` prop. When it is set, a "Reintentar" button (`variant="outline"`, `h-11`, `RotateCcw` icon) renders inside the alert.
  - `page.tsx` passes `onRetry={state.kind === "failed" && state.canRetry && !fileError ? retry : undefined}`.

## Expected File Changes

- `src/lib/consumption/study.ts`: modify; add refresh path and client.
- `src/lib/consumption/study.test.ts`: modify; cases for 200, 404 and 409.
- `src/components/consumption/consumption-study-provider.tsx`: modify; retry, `canRetry`, `refreshStudy`, triggers, throttle.
- `src/components/consumption/consumption-study-provider.test.tsx`: modify; retry for CUPS and PDF, no retry after a resume, refresh on restore, visibility throttle, 404 clears the id, 500 is silent, stale responses are ignored.
- `src/components/consumption/cups-form.tsx`: modify; `onRetry` button.
- `src/app/(app)/fetch-consumption/page.tsx`: modify; wire `retry`.
- `e2e/consumption-errors.spec.ts`: create; Scenarios 1, 2, 3 (local error), 5 and 7 (404) with route mocks.
- `docs/domain-model.md`: update; describe the real refresh semantics, triggers and retry.
- `feature_list.json`: update; correct the `user_visible_behavior` wording, add evidence.
- `PROGRESS.md`: update.

## Visual Design Impact

- UI involved: yes, only the error alert on `/fetch-consumption`.
- Design source: `DESIGN.md` for tokens, button variants and the 44px minimum target.
- States affected: the failed alert with and without "Reintentar". The refresh has no visual state.
- New design artifact required: no.

## Durable Documentation Impact

- `ARCHITECTURE.md`: not needed. No new layer, because the refresh is inside the existing provider.
- `CONSTRAINTS.md`: not needed.
- `AGENTS.md`: not needed.
- `docs/domain-model.md`: update the Consumption Job paragraph. Refresh applies only to a completed job's proposals and taxes, 404 clears the id, and the web triggers are restore and visibility (push comes later). Retry creates a new job.
- `CONTEXT.md`: add "Refresh (study)" only if the glossary lists job terms. Check during implementation.

## Implementation Plan

1. Add the refresh client in `study.ts`, with unit tests.
2. Add retry state and the `lastPdf` ref in the provider, with tests.
3. Add `refreshStudy`, the throttle, and the restore and visibility triggers, with tests.
4. Add the `CupsForm` `onRetry` button and the page wiring. Check it on a mobile viewport in light and dark.
5. Add the E2E spec and run the full gate.
6. Update the docs, `feature_list.json` and `PROGRESS.md`.

## Implementation Tasks

- [ ] `refreshPath` and `refreshReport`, with tests.
- [ ] `canRetry`, `lastPdf` ref and `retry()` in the provider, with tests.
- [ ] `refreshStudy`, the 60 s throttle, chaining after restore and the visibility trigger, with tests (fake timers or injected throttle).
- [ ] `CupsForm` `onRetry` and page wiring.
- [ ] `e2e/consumption-errors.spec.ts`.
- [ ] Docs and harness updates.

## Verification Plan

- `./init.sh`: lint, typecheck and vitest all green.
- `npm run build`: OK.
- `npm run test:e2e` with `E2E_EMAIL`/`E2E_PASSWORD`: all tests pass, including the new ones.
- Manual check on a mobile viewport (WebKit iPhone 13), light and dark: the failed alert with "Reintentar" looks right and the button is at least 44px tall.
- Manual check on local QA (`../BmInfra/bm-local-qa up`):
  - Complete a CUPS study, reload, and watch DevTools/proxy logs for one refresh POST with 200.
  - Switch tabs before 60 s: no POST. Switch after 60 s: one POST.
  - Stop the backend, submit and get SUBMIT_FAILED, start the backend again, tap "Reintentar": success.

## Evidence To Capture

- Test counts (vitest and E2E), screenshots of the failed alert with retry, and log lines from the manual refresh. Record them in `feature_list.json` `evidence` and in `PROGRESS.md`.

## Validator Checklist

- [ ] Retry appears only for study failures, never for local file errors, and is hidden for PDF failures after a reload.
- [ ] Retry starts a new job with the same input, and failure strings are unchanged.
- [ ] Refresh runs on restore and on throttled visibility only. It is silent; 404 clears the id and other errors are ignored.
- [ ] Refresh keeps the conditions and the jobId, and ignores stale responses.
- [ ] No push, manual refresh button, or proposals UI was added.
- [ ] E2E added; `./init.sh`, build and E2E are green; mobile check done.
- [ ] `docs/domain-model.md`, `feature_list.json` and `PROGRESS.md` updated, including the corrected feature wording.
