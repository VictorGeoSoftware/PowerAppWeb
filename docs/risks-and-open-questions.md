# Risks and Open Questions

## Blocking Next Phase
- None.

## Implementation-Time Questions
- Backend `/user-data` checks device binding only when `phoneUuid` is sent; a client omitting it bypasses the one-device rule. Web must always send it (`device-binding-basic`); consider making it mandatory server-side before PROD.
- Real-phone testing before hosting: add the Mac's LAN IP to Firebase Auth authorized domains, or test on the hosted HTTPS URL.
- IONOS hosting details, domain, and TLS setup (same as BmWeb).
- Comparator calculation: port `ProposalCalculationHelper` to TypeScript, or move it to the backend so both clients share it?
- Backend changes: bill photo upload + extraction, web push token registration, device binding for web client type.
- Firebase web app registration in project `brielmarnysos-1dc68`.

## Later / Not MVP
- Pre-PROD: Bound Device hardening. Goal: prevent Brokers sharing accounts (Android and web). Problem: iOS may evict browser storage, losing the device id and causing false binding conflicts. Decide strategy before PROD release.
- Final stage: PWA install + Web Push.
- Offline support.
- Additional languages.

## Assumptions
- Development runs against BmBackend QA; all backend changes go to the `qa` branch.
- Until hardening, a simple persisted browser device id is acceptable in QA.
- Backend API contract used by Android is reusable as-is for web, except the items above.
- Brokers accept "one device total"; switching Android ↔ web needs an admin reset in BmWeb.

## Risks
- Dev machine on Volvo corporate network cannot reach BmBackend QA ("Application Blocked"); mitigated by the local Docker QA stack (`../BmInfra/bm-local-qa`, localhost:9081).
- Live in-browser CUPS OCR accuracy is lower than ML Kit; mitigated by photo-upload and manual-entry fallbacks.
- iOS PWA limitations (push only when installed, storage eviction, background tab throttling during polling).
- Calculation drift between Android and web if logic is duplicated.

## Research Tasks
- Spike: Tesseract.js CUPS OCR on iPhone Safari with real bills.
- Verify backend `/user-data` and device binding do not assume Android-only fields.
