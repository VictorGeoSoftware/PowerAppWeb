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
  - Storage: Consumption Report session in memory (lost on reload/logout); Current Conditions in `localStorage["bm.currentConditions"]`; last job id `bm.lastCompletedJobId`. New study and logout (manual or forced) clear both keys and keep `bm.deviceId`. Unlike BmApp, the in-memory session never outlives logout.
- Consumption Job: submitted (202 + jobId) → processing → completed | failed; refresh allowed on existing job.
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
