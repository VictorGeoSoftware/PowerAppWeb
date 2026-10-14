# Feature Implementation Spec: Request consumption by typed CUPS

## Source Feature

- `id`: consumption-by-cups-manual
- `area`: consumption
- `depends_on`: fee-first-gate, backend-proxy (both `accepted`)
- `status`: not_started at planning time (2026-10-14)
- `source`: `feature_list.json`

## Goal

A signed-in Broker on `/fetch-consumption` types a CUPS. The web validates it exactly like BmApp, submits a Consumption Job through the proxy, polls until it finishes and publishes the Consumption Report into the Fee-First Gate session. The gate then moves to `CURRENT_CONDITIONS_REQUIRED` and the Broker lands on `/current-conditions`, which shows a short report summary. Polling resumes after the tab is backgrounded or reloaded. A completed study survives a reload for 1 h, like BmApp's `lastCompletedJobId`.

## Non-Goals

- PDF upload (`consumption-by-pdf`), camera OCR (`cups-camera-ocr`), photo (`consumption-by-photo`). Do not render their options, not even disabled.
- A retry button, the refresh endpoint, special handling for failed jobs: `consumption-job-refresh-errors`. Here an error is shown inline and the Broker can press Confirm again.
- The Current Conditions form and the collected-prices submit. `/current-conditions` only gets the summary on top of its placeholder.
- Showing proposals and making `ConsumptionSession` carry them through to the comparator. The `proposals` field is stored but not rendered.
- Analytics events.
- Backend changes.

## Job Story

When I am with a customer and have their CUPS code,
I want to type it and get their real consumption,
so I can move on to entering their current conditions.

## Users And Permissions

- A granted Broker (signed in, passed the access gate, bound device): may submit and read only their own jobs. The backend returns 404 for other users' jobs.
- On 401/403 from any job call, `useBmFetch` forces logout. This is the existing behaviour.

## Decisions (planner, 2026-10-14)

1. **Manual entry on the page itself.** BmApp only allows typing inside the scanner. On the web, `/fetch-consumption` gets an inline CUPS form under "ELIGE UN MÉTODO". The camera option arrives later with `cups-camera-ocr`.
2. **Send the corrected code.** Submit `fixOcrErrors(normalize(raw))`, not just `normalize(raw)`. This fixes a BmApp gap: today a typed `O` in the digits passes client-side validation but the backend rejects it with 400.
3. **No separate summary screen** (parity with BmApp). After success the gate redirects to `/current-conditions`. Its placeholder shows a `ConsumptionSummary` card, which `current-conditions-form` can reuse or replace.
4. **Resume.** The in-flight job is kept in `sessionStorage` under `bm.activeJob` as `{jobId, cups, attempts}`. It is resumed when the provider mounts and when the tab becomes visible. The completed job id goes to `localStorage` under `bm.lastCompletedJobId` as `{jobId, savedAt}` and is restored if it is less than 1 h old. Both keys are cleared on new study and on logout.
5. **Timeout.** 60 status attempts, 3 s apart. Attempts only count while polling actually runs; time spent in a background tab does not burn the budget.

## Acceptance Scenarios

### Scenario 1: Live validation
Given the Broker is on `/fetch-consumption`
When they type `es 0031 6075 1570 7001 rc`
Then the helper text reads "Formato válido" and "Confirmar" is enabled.
When they type `ES0031607515707001RD`
Then it reads "Formato no válido", the input has `aria-invalid`, and "Confirmar" is disabled.
With the field empty, the helper text reads "Introduce el CUPS que aparece en la factura".

### Scenario 2: Happy path
Given a valid CUPS
When the Broker presses "Confirmar"
Then the app sends POST `/api/bm/fetch-user-consumption-report-by-cups` with `{"cupsCode":"ES0031607515707001RC"}`.
The form is replaced by a spinner with the title "Obtener consumo" and the step messages in order: "Consultando CUPS..." → "Esperando en la cola..." (PENDING) / "Analizando tu factura..." (PROCESSING) → "Obteniendo resultados...".
On COMPLETED the result is fetched, the session is published, and the URL becomes `/current-conditions`. That page shows the CUPS, the tariff (`feeType`), the annual consumption per non-zero period P1..P6 in kWh, and the contracted power per non-zero period in kW, all with `es-ES` number formatting.

### Scenario 3: Job failed
Given status returns FAILED
Then the app shows the form again with the CUPS still filled in and the error "El procesamiento ha fallado. Inténtalo de nuevo." in `role="alert"`.

### Scenario 4: Submit, status, result and timeout errors
The form comes back with the matching message:
- Submit returns non-202 or the network fails → "No se pudo iniciar el estudio. Inténtalo de nuevo."
- Status call errors, including 404 (job lost) → "No se pudo comprobar el estado del estudio."
- Result call errors → "No se pudieron obtener los resultados del estudio."
- 60 attempts used up → "El estudio ha tardado demasiado. Inténtalo de nuevo."

In every case `bm.activeJob` is cleared. A 401/403 instead forces logout, which is the existing behaviour.

### Scenario 5: Resume after reload or background
Given a job is polling
When the page is reloaded, or the tab is hidden and then shown again
Then polling continues with the same jobId: no new submit, the spinner is visible, and it ends as in Scenario 2.

### Scenario 6: Restore a completed study
Given a study completed less than 1 h ago
When the app reloads
Then GET result is called with the stored id, the session is restored, and the gate shows `/current-conditions`.
If the stored id is more than 1 h old, or the result returns 404, the key is cleared and the Broker stays on `/fetch-consumption`.

### Scenario 7: Reset
"Nuevo estudio" or logout cancels any polling, clears `bm.activeJob` and `bm.lastCompletedJobId`, and returns the Broker to `/fetch-consumption` with an empty form.

### Scenario 8: Real QA
With a working QA backend (n8n reachable), a real CUPS returns a report and Scenario 2 holds end to end.

## Repository Research

### Files Inspected

- `../BmApp` (via subagent):
  - `app/.../ui/views/scanner/CupsCodeParser.kt` (rules, alphabet, OCR fixes)
  - `CupsScannerView.kt` (strings, live validation)
  - `fetchconsumption/FetchConsumptionScreen.kt`, `FetchConsumptionViewModel.kt`, `ConsumptionStudyMessages.kt`
  - `values-es/strings.xml`
  - `data/.../network/PriceTableApi.kt`
  - `data/.../repository/ConsumptionStudyRepositoryImpl.kt` (3000 ms × 60, failure mapping)
  - `ConsumptionSessionRepositoryImpl.kt`, `domain/.../ConsumptionReportModel.kt` (P1..P6, drop zeros, Int)
  - `LastCompletedJobIdLocalDataSource.kt` (1 h)
  - BmApp has no `CupsCodeParser` tests.
- `../BmBackend` (branch `qa`):
  - `routes/UserConsumptionRoutes.kt:184-338`
  - `models/CupsValidation.kt`, `CupsValidationTest.kt:42-78` (valid and invalid fixtures)
  - `models/ConsumptionReportModels.kt:66-110`
  - `services/JobService.kt` (in-memory jobs, 1 h expiry, owner check → 404)
  - `routes/FirebaseRouteAuth.kt`
  - `docker-compose.yml:52`
- PowerAppWeb:
  - `src/lib/server/backend-proxy.ts:7-19` (job roots already allowlisted)
  - `src/lib/api/bm-fetch.ts`, `use-bm-fetch.ts`
  - `src/components/auth/auth-provider.tsx:154-162` (stale-user TODO)
  - `src/lib/gate/fee-first.ts:8-11,29-41`, `storage.ts`
  - `src/components/gate/fee-first-gate-provider.tsx`
  - `src/app/(app)/fetch-consumption/page.tsx`, `src/components/shell/*`, `src/components/ui/*`
  - `e2e/fixtures.ts`
  - `vitest.config.ts`, `DESIGN.md`, `CONTEXT.md`, `docs/domain-model.md:19-35`

### Existing Patterns To Follow

- All backend calls go through `useBmFetch()` (relative path, Bearer token, `BmApiError`, forced logout). Never call `fetch` directly.
- Unit tests sit next to the code as `*.test.ts(x)`. E2E specs live in `e2e/<feature>.spec.ts` and use `useSignedInSession()` and `openSignedIn()`.
- Gate state is published with `useFeeFirstGate().setSession(...)`. `startNewStudy` and logout call `clearStudyStorage()`.
- `FullScreenSpinner`, `Input`, `Label`, `Button` come from shadcn. Titles are 22px/600. Touch targets are at least 44px and inputs at least 16px.

### Current Gaps / Risks

- **Local Docker QA probably cannot complete a CUPS job.** There is no n8n or Datadis mock, and `docker-compose.yml` sets `N8N_WEBHOOK_URL` while the code reads `N8N_FETCH_USER_CONSUMPTION_WEBHOOK_URL`. So E2E mocks the job endpoints with `page.route`, and Scenario 8 is a manual check that needs a working n8n. If it can't run, record it as PENDING; it does not block acceptance (same rule as login-google). Fixing the compose file is BmInfra/BmBackend work and stays out of scope.
- Backend jobs are kept in memory, so a backend restart loses them. Status 404 is handled as STATUS_CHECK_FAILED.
- The backend rate limit is a global 100 requests/min. One poll every 3 s is fine.
- `reportApiError` has no stale-user guard yet. This feature is its first consumer and must add one.

## Technical Approach

- **`src/lib/consumption/cups.ts`.** A 1:1 port of `CupsCodeParser`: `normalize`, `fixOcrErrors`, `isValidCups`, `computeControlCode`, `toSubmittableCups` (fix + normalize). Leave out the OCR candidate extraction; `cups-camera-ocr` will need it.
- **`src/lib/consumption/report.ts`.**
  - Types `ConsumptionReportResponse` and `JobStatus`.
  - `toConsumptionSession(report, jobId)`:
    - Copies `jobId`, `cups` (`userData.cups_code` or `consumptionData.cups`), `feeType`, `iva`, `electricTaxPercent`, `holderName`/`address` when present, and `proposals`.
    - `powerRows` and `energyRows` hold `{period, value}` for P1..P6. Drop zeros. Keep the raw number and do no Int rounding, which is a display concern.
    - Fill `powerPeriods` and `energyPeriods` from the period labels so `fee-first` keeps working.
  - Extend `ConsumptionSession` in `fee-first.ts`.
- **`src/lib/consumption/study.ts`.** A pure, testable runner: `runStudy({fetch, cups | resumeJobId, onStep, signal, sleep, maxAttempts=60, intervalMs=3000, startAttempts})`. It returns `{ok, report, jobId}` or `{ok:false, failure}`.
  - The failure codes and Spanish messages are in `messages.ts`.
  - It reports `attempts` so they can be persisted.
  - Submit success means status 202.
- **`src/components/consumption/consumption-study-provider.tsx`.** Mounted inside `FeeFirstGateProvider` in `(app)/layout.tsx`. It owns the state `{idle | running(step) | failed(message, cups)}`.
  - Starts studies.
  - Persists and clears `bm.activeJob`.
  - On mount and on `visibilitychange` → visible, resumes the active job or restores the last completed one.
  - While the document is hidden, pauses the loop: the sleep waits for visibility. This keeps attempts honest.
  - Aborts on `startNewStudy` and on logout. Hook it via the same clear path or a gate reset counter.
  - Guards against a stale user: if the uid changed, drop the results.
- **Storage.** Add `ACTIVE_JOB_KEY` and save/load helpers for the last completed job id (1 h expiry, using an injectable `now`) to `storage.ts`. Make `clearStudyStorage` remove the active job too.
- **`/fetch-consumption` page.**
  - Headline: "Selecciona primero una factura de luz para proceder al estudio"
  - Subtitle: "Necesitamos tu consumo real antes de introducir las condiciones actuales."
  - Label: "ELIGE UN MÉTODO"
  - Section "Introducir código CUPS" with `Input`: placeholder `ES0021000012345678XX`, `autoCapitalize="characters"`, `autoCorrect="off"`, `spellCheck={false}`, `autoComplete="off"`, `enterKeyHint="go"`, `maxLength=30`, 16px font.
  - Live helper text via `aria-describedby`.
  - "Confirmar" button as a full-width submit, h-12. Enter submits when valid.
  - While running, render the spinner block with "Obtener consumo" and the step text (`aria-live="polite"`).
  - The error sits above the form.
- **`/current-conditions` placeholder.** Render `ConsumptionSummary` (heading "Consumo obtenido", CUPS, Tarifa, rows "P1 · 1.234 kWh", "P1 · 4,6 kW") above the existing placeholder text.
- **`auth-provider.tsx`.** In `reportApiError`, ignore errors when the current user is not the one who made the call. Pass the user, or compare against a ref, the same way `verify` does. Remove the TODO.

## Expected File Changes

- `src/lib/consumption/cups.ts` + `cups.test.ts` — create
- `src/lib/consumption/report.ts` + `report.test.ts` — create
- `src/lib/consumption/study.ts` + `study.test.ts`, `messages.ts` — create
- `src/lib/gate/fee-first.ts`, `storage.ts` (+ tests) — modify: session type, keys, 1 h helpers
- `src/components/consumption/consumption-study-provider.tsx` (+ test) — create
- `src/components/consumption/cups-form.tsx`, `study-progress.tsx`, `consumption-summary.tsx` (+ tests) — create
- `src/app/(app)/layout.tsx`, `fetch-consumption/page.tsx`, `current-conditions/page.tsx` — modify
- `src/components/auth/auth-provider.tsx` (+ test) — modify: stale-user guard
- `e2e/consumption-cups.spec.ts` — create. `e2e/fee-first-gate.spec.ts` — modify only if its `/fetch-consumption` heading assertion changes.

## Visual Design Impact

- UI involved: yes.
- Design source: `DESIGN.md`, plus BmApp FetchConsumption and scanner strings.
- States to cover: empty, valid, invalid, running for each step, error, summary. All at 390px in light and dark.
- New design artifact: none.
- Error text: use `text-foreground` on `bg-destructive/10` with an icon, following the AA lesson from fee-first-gate.

## Durable Documentation Impact

- `ARCHITECTURE.md` / `CONSTRAINTS.md`: not needed. Neither file exists, and the patterns are already covered.
- `AGENTS.md`: not needed.
- `docs/domain-model.md`: update.
  - The job lifecycle: 202, polling 3 s × 60, failure messages.
  - The `bm.activeJob` and `bm.lastCompletedJobId` semantics.
  - Decisions 2 and 5.
- `docs/risks-and-open-questions.md`: add the local QA n8n gap (compose variable name).

## Implementation Plan

1. Write `cups.ts` with tests: the backend fixtures (valid `ES0031607515707001RC`, `…RC0F`, `…RC1P`, and the invalid examples from `CupsValidationTest`), the OCR fixes, spaces and dashes, lowercase input, length 21.
2. Write the report mapper and the session type with tests: zero periods dropped, `cups` fallback.
3. Write the study runner with fake fetch, sleep and abort. Test every failure mapping, step order, attempt limit, resume without submit, and abort.
4. Add the storage helpers (1 h expiry) and extend `clearStudyStorage`.
5. Build the provider, wire it into the layout, and add the stale-user guard.
6. Build the UI components and pages.
7. Write the E2E spec with mocked `/api/bm/*` job routes. Cover Scenarios 1–7. Include a reload mid-poll for Scenario 5 and a seeded `bm.lastCompletedJobId` for Scenario 6.
8. Update the docs and the evidence.

## Implementation Tasks

- [ ] cups port + tests
- [ ] report mapper + session type
- [ ] study runner + messages + tests
- [ ] storage keys/helpers + tests
- [ ] provider (resume, restore, abort, visibility pause) + tests
- [ ] stale-user guard in `reportApiError` + test
- [ ] CupsForm / StudyProgress / ConsumptionSummary + pages
- [ ] `e2e/consumption-cups.spec.ts`
- [ ] docs + `feature_list.json` + `PROGRESS.md`

## Verification Plan

- `./init.sh` green: lint, typecheck, vitest including the new tests. `npm run build` OK.
- `npm run test:e2e` with `E2E_EMAIL`/`E2E_PASSWORD`. All existing tests plus `consumption-cups.spec.ts` pass on iphone-webkit and android-chromium. Job endpoints are mocked; auth and user-data are real.
- Mobile check: screenshots at iPhone 13 and Pixel 7 of the empty, invalid, running, error and summary states, in light and dark. Confirm the iOS keyboard does not auto-correct.
- Manual Scenario 8 against QA with a working n8n. If unavailable, record it as PENDING with the reason.

## Evidence To Capture

- Test counts, build output, the E2E pass count per project, screenshot paths, the Scenario 8 result or PENDING note. Record all of these in `feature_list.json`, and add a session entry to `PROGRESS.md`.

## Validator Checklist

- [ ] CUPS rules match `CupsCodeParser` (alphabet, regex, OCR fixes). The corrected code is what gets submitted.
- [ ] Polling parameters, step strings and failure strings match BmApp exactly.
- [ ] Only the CUPS method is shown. No PDF/camera, retry button or refresh.
- [ ] Resume and restore work with no duplicate submit. Reset and logout clear both keys.
- [ ] Every call goes through `useBmFetch`. The stale-user guard is present.
- [ ] Gate moves to `/current-conditions` and the summary shows.
- [ ] E2E added. Mobile screenshots reviewed. Docs updated.
- [ ] `feature_list.json` and `PROGRESS.md` updated. No unrelated changes.
