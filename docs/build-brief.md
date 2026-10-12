# Build Brief

## Problem
BmApp is Android-only. iPhone Brokers cannot use it, and new Brokers face install friction (Play Store/APK distribution).

## Current Workaround / Existing System
- `../BmApp`: native Android (Kotlin, Compose) tariff comparator.
- `../BmBackend`: Ktor REST API (`/api/v1`), Firebase bearer auth + `granted_users`.
- `../BmWeb`: admin back-office (Next.js); manages Granted Users and Proposals. Not user-facing.

## Target Users
Brokers (existing and new), on smartphones — iOS Safari and Android Chrome first; tablet/desktop must work but are secondary. UI in Spanish.

## Goals
- Full functional parity with BmApp in a zero-install, installable PWA.
- Same accounts, Tier rules, and Fee-First Gate as Android.
- Reuse BmBackend without forking business logic where possible.

## Non-Goals
- Replacing the Android app.
- Self-signup; access stays via admin allowlist in BmWeb.
- Admin features (remain in BmWeb).
- Offline mode.
- Languages other than Spanish.
- New audience types beyond Brokers (e.g. end customers).

## MVP Slice (full parity)
1. Login (Google + email/password, Firebase project `brielmarnysos-1dc68`); non-granted users are signed out and shown the backend's "no autorizada" message on login (BmApp parity); Bound Device enforcement.
2. Fetch Consumption: by CUPS (manual entry or live in-browser camera OCR), by bill PDF upload, or by bill photo upload; async job polling.
3. Current Conditions form (gate step).
4. Proposals / Comparator table, Configuration of visible Proposals.
5. Comparator PDF generation and sharing (Web Share API, download fallback); PREMIUM comprehensive PDF.
6. Analytics parity (screen tracking) and forced logout handling.

### Final stage (before PROD, not blockers)
7. Installable PWA (manifest, icons, iOS "Add to Home Screen" hint) + Web Push Price Update Notifications. iOS needs home-screen install for push; Android Chrome does not.
8. Bound Device hardening against account sharing (see risks).

## Validation Plan
- Pilot with a few Brokers on iPhone (Safari, installed PWA) and Android (Chrome).
- Same CUPS/bill produces the same comparison numbers as the Android app (golden cases from `ProposalCalculationHelper`).

## Success Criteria
- A Broker on iPhone completes login → consumption → conditions → shared PDF without assistance.
- Comparator results match Android for the golden test cases.
- (Final stage) Push notification received on an installed iOS PWA and on Android Chrome.

## Notes
- Backend changes are delivered on BmBackend `qa` branch; the project runs against QA during development.
- Account sharing between colleagues must be prevented on both clients (Bound Device purpose).
Stack/hosting details: `docs/technical-discovery.md`. Visual direction: `DESIGN.md`.
