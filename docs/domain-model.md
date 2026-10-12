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
- Consumption Job: submitted (202 + jobId) → processing → completed | failed; refresh allowed on existing job.
- Session: signed out → signed in & granted → (revoked / device reset / force logout) → signed out.

## Important Scenarios
- iPhone Broker scans CUPS with live camera OCR, confirms code, gets report.
- Broker uploads photo of a bill; backend extracts CUPS/consumption.
- Broker shares Comparator PDF via native share sheet.

## Edge Cases
- Camera permission denied or OCR fails → fall back to manual entry / photo upload.
- Account already bound to Android → web login rejected with clear message (admin reset required).
- Grant revoked mid-session → 403 → signed out.
- Polling interrupted (tab backgrounded on iOS) → resume by jobId.
