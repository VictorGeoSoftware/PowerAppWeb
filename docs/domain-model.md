# Domain Model

Mirrors BmApp (`../BmApp/domain`). PowerAppWeb adds no new domain concepts.

## Core Concepts
- Broker (Granted User, Tier, Bound Device)
- Consumption Job → Consumption Report
- Current Conditions
- Proposal (from backend `price-table-results`), visibility configured per Broker
- Comparison → Comparator PDF
- Collected Prices (supplier, tariff, power/energy prices, extra services; no CUPS/holder/address). Sent in the background when the Broker leaves Current Conditions for the proposals, once per consumption job; 2.0TD and blank tariffs are excluded; failures are silent.

## Relationships
- A Broker has exactly one Bound Device (Android phone OR browser).
- A comparison session = one Consumption Report + one Current Conditions + visible Proposals.
- Tier decides which Comparator PDF variants are available.

## States and Lifecycles
- Fee-First Gate: `CONSUMPTION_REQUIRED` → (Consumption Report ready) → `CURRENT_CONDITIONS_REQUIRED` → (conditions valid) → `UNLOCKED`. Blocked routes redirect to the current step.
  - Conditions valid = supplier name not blank + a price > 0 for every power and energy period of the Consumption Report (comma or dot decimals; extra services optional; prices for other periods ignored). Code: `src/lib/gate/fee-first.ts` (port of BmApp `EvaluateFeeFirstGateUseCase`).
  - Form (`src/components/conditions/current-conditions-form.tsx`, port of BmApp `CurrentUserConditions`): no Save button, every change that passes `^\d*([.,]\d{0,8})?$` (`src/lib/conditions/decimal-input.ts`) is stored raw; invalid keystrokes are silently ignored. No tax inputs. Holder/address edits live in the in-memory session only (not persisted, lost on reload).
  - Routes: `/fetch-consumption` only at `CONSUMPTION_REQUIRED`; `/current-conditions` from `CURRENT_CONDITIONS_REQUIRED`; `/proposals`, `/configuration` only `UNLOCKED`. Fallback: fetch step, else Current Conditions.
  - Storage: Consumption Report session in memory (rebuilt on reload from the last completed job, see below); Current Conditions in `localStorage["bm.currentConditions"]`; `localStorage["bm.lastCompletedJobId"]` and `sessionStorage["bm.activeJob"]`. New study and logout (manual or forced) clear all of them and keep `bm.deviceId`. Unlike BmApp, the in-memory session never outlives logout.
- Consumption Job (code: `src/lib/consumption/study.ts`, port of BmApp `ConsumptionStudyRepositoryImpl`): POST `fetch-user-consumption-report-by-cups` `{"cupsCode"}` ("Consultando CUPS..."), or POST `fetch-user-consumption-report` multipart with one `file` part whose filename ends in `.pdf` (backend 400 otherwise; web falls back to `factura.pdf`) ("Subiendo factura..."; Docling extraction on the backend). Before a PDF upload the web client rejects non-PDF files (MIME `application/pdf` or `.pdf` name, since iOS may report an empty type) and files > 50 MB (nginx limit), with no request sent → only 202 + jobId counts as submitted → GET `consumption-report-status/{jobId}` every 3 s, max 60 attempts (PENDING "Esperando en la cola...", PROCESSING "Analizando tu factura...") → COMPLETED → GET `consumption-report-result/{jobId}` (200 only) → report published to the gate. Failures (Spanish strings in `messages.ts`, identical to BmApp): submit, processing (FAILED), status check (any error incl. 404 = job lost; backend jobs are in memory, owner-checked, 1 h), result, timeout. 401/403 force logout. Refresh `consumption-job-refresh-errors`: POST `consumption-report-refresh/{jobId}` only for a COMPLETED, owned job; the backend recalculates `proposals`, `iva`, `impuestoElectrico` from the stored consumption (never re-runs the job; 404 missing/expired/foreign, 409 not completed). Web triggers (substitute for BmApp push): once after a restore, and on tab return when a study is published and no job runs, at most once per 60 s since the last publish/refresh. Silent: 200 replaces the session (same jobId, conditions kept) and renews `bm.lastCompletedJobId`; 404 clears the id (session stays); other errors are ignored. Retry ("Reintentar" in the failure alert) always submits a new job with the same CUPS, or the same PDF/photo while the `File` is still in memory in this tab (not after a reload; never for local file-check errors).
  - CUPS: validated like BmApp `CupsCodeParser` (`src/lib/consumption/cups.ts`); the web submits the OCR-corrected code (`fixOcrErrors(normalize(raw))`) so a typed `O` among the digits isn't rejected by the backend (deliberate fix of a BmApp gap).
  - Photo source (web-only, no BmApp equivalent; `consumption-by-photo`): "Foto de la factura" row, `<input accept="image/jpeg,image/png">` without `capture` (native camera or library). Same `fetch-user-consumption-report` multipart `file` part, filename kept if it ends in `.jpg/.jpeg/.png`, else `factura.jpg`/`factura.png` by MIME (backend picks type by extension). Client rejects non-JPEG/PNG (incl. HEIC) with "Selecciona una foto JPG o PNG." and > 50 MB, no request. No client resize/convert (backend downscales to 2000 px). The photo must show the bill page with the CUPS.
  - Resume: `sessionStorage["bm.activeJob"] = {jobId, source: "cups" | "pdf" | "photo", cups?, attempts}` while polling (entries without or with an unknown `source` are CUPS jobs; a PDF/photo resume never re-uploads, it only needs the jobId); resumed (no new submit) on reload and when the tab becomes visible. Attempts only count while the tab is visible (polling pauses in a hidden tab), so a background tab does not burn the 60-attempt budget.
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
