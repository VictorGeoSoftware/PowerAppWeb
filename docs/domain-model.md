# Domain Model

Mirrors BmApp (`../BmApp/domain`). PowerAppWeb adds no new domain concepts.

## Core Concepts
- Broker (Granted User, Tier, Bound Device)
- Consumption Job → Consumption Report
- Current Conditions
- Proposal (from backend `price-table-results`), visibility configured per Broker
- Comparison → Comparator PDF
- Collected Prices (submitted to backend when Broker enters Current Conditions)

## Relationships
- A Broker has exactly one Bound Device (Android phone OR browser).
- A comparison session = one Consumption Report + one Current Conditions + visible Proposals.
- Tier decides which Comparator PDF variants are available.

## States and Lifecycles
- Fee-First Gate: `CONSUMPTION_REQUIRED` → (Consumption Report ready) → `CURRENT_CONDITIONS_REQUIRED` → (conditions valid) → `UNLOCKED`. Blocked routes redirect to the current step.
  - Conditions valid = supplier name not blank + a price > 0 for every power and energy period of the Consumption Report (comma or dot decimals; extra services optional; prices for other periods ignored). Code: `src/lib/gate/fee-first.ts` (port of BmApp `EvaluateFeeFirstGateUseCase`).
  - Routes: `/fetch-consumption` only at `CONSUMPTION_REQUIRED`; `/current-conditions` from `CURRENT_CONDITIONS_REQUIRED`; `/proposals`, `/configuration` only `UNLOCKED`. Fallback: fetch step, else Current Conditions.
  - Storage: Consumption Report session in memory (rebuilt on reload from the last completed job, see below); Current Conditions in `localStorage["bm.currentConditions"]`; `localStorage["bm.lastCompletedJobId"]` and `sessionStorage["bm.activeJob"]`. New study and logout (manual or forced) clear all of them and keep `bm.deviceId`. Unlike BmApp, the in-memory session never outlives logout.
- Consumption Job (code: `src/lib/consumption/study.ts`, port of BmApp `ConsumptionStudyRepositoryImpl`): POST `fetch-user-consumption-report-by-cups` `{"cupsCode"}` ("Consultando CUPS..."), or POST `fetch-user-consumption-report` multipart with one `file` part whose filename ends in `.pdf` (backend 400 otherwise; web falls back to `factura.pdf`) ("Subiendo factura..."; Docling extraction on the backend). Before a PDF upload the web client rejects non-PDF files (MIME `application/pdf` or `.pdf` name, since iOS may report an empty type) and files > 50 MB (nginx limit), with no request sent → only 202 + jobId counts as submitted → GET `consumption-report-status/{jobId}` every 3 s, max 60 attempts (PENDING "Esperando en la cola...", PROCESSING "Analizando tu factura...") → COMPLETED → GET `consumption-report-result/{jobId}` (200 only) → report published to the gate. Failures (Spanish strings in `messages.ts`, identical to BmApp): submit, processing (FAILED), status check (any error incl. 404 = job lost; backend jobs are in memory, owner-checked, 1 h), result, timeout. 401/403 force logout. Refresh on an existing job: `consumption-job-refresh-errors`.
  - CUPS: validated like BmApp `CupsCodeParser` (`src/lib/consumption/cups.ts`); the web submits the OCR-corrected code (`fixOcrErrors(normalize(raw))`) so a typed `O` among the digits isn't rejected by the backend (deliberate fix of a BmApp gap).
  - Resume: `sessionStorage["bm.activeJob"] = {jobId, source: "cups" | "pdf", cups?, attempts}` while polling (entries without `source` are CUPS jobs; a PDF resume never re-uploads, it only needs the jobId); resumed (no new submit) on reload and when the tab becomes visible. Attempts only count while the tab is visible (polling pauses in a hidden tab), so a background tab does not burn the 60-attempt budget.
  - Restore: `localStorage["bm.lastCompletedJobId"] = {jobId, savedAt}`; on load, if < 1 h old, the result is fetched again and the session restored; older or 404 → key cleared (BmApp `LastCompletedJobIdLocalDataSource`).
- Session: signed out → signed in & granted → (revoked / device reset / force logout) → signed out.

## Important Scenarios
- iPhone Broker scans CUPS with live camera OCR, confirms code, gets report.
- Broker uploads photo of a bill; backend extracts CUPS/consumption.
- Broker shares Comparator PDF via native share sheet.

## Edge Cases
- Camera permission denied or OCR fails → fall back to manual entry / photo upload.
- Account already bound to Android → web login rejected with clear message (admin reset required).
- Grant revoked mid-session → 403, or revoked Firebase refresh token (BmWeb grant deletion) → signed out with a notice.
- Polling interrupted (tab backgrounded on iOS) → resume by jobId.
