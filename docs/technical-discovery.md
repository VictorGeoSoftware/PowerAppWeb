# Technical Discovery

## Product Surface
Mobile-first responsive web app, installable PWA. Primary targets: iOS Safari (16.4+ for Web Push) and Android Chrome.

## Candidate Stack
Same pattern as `../BmWeb`: Next.js (App Router), React, Tailwind, shadcn/ui, Firebase JS SDK. Server-side route handlers proxy calls to BmBackend.
Pinned at bootstrap: Next 15.5, React 19.1, Tailwind 4, shadcn (base-nova), Vitest 2, ESLint 9 flat config. Dev port 9003 (BmWeb uses 9002).

### Backend proxy convention
- Browser code calls only same-origin `/api/bm/<path>`; `src/app/api/bm/[...path]/route.ts` forwards to `${BM_BACKEND_URL}/api/v1/<path>` with the caller's Bearer token (status/body/content-type passed through).
- Server-only env `BM_BACKEND_URL` (see `.env.example`; dev defaults to QA). Never `NEXT_PUBLIC_`.
- Allowlist `ALLOWED_ROOTS` in `src/lib/server/backend-proxy.ts`; extend it when a feature needs a new Broker endpoint. Admin endpoints stay out.
- Preferred dev backend: local Docker QA stack from `../BmInfra` (`../BmInfra/bm-local-qa up`) → `BM_BACKEND_URL=http://localhost:9081` in `.env.local`. It runs the BmBackend source with the same Firebase project, so real Broker tokens work. Also exposes Postgres (127.0.0.1:15433), n8n (6678), Docling (5000), price-agent (5002).
- Remote QA VPS (`217.154.181.175:9081`) is blocked from the Volvo corporate network.

## Data and Storage
No own database. All data via BmBackend. Client keeps only session and current-flow state.

## Integrations
- BmBackend `/api/v1` endpoints used by BmApp (price-table-results, consumption report jobs, comparator-pdf, collected-prices, user-data, user-activity, auth/logout).
- Firebase Auth (project `brielmarnysos-1dc68`, shared with Android). Web app registered; public config from `NEXT_PUBLIC_FIREBASE_*` env vars (`src/lib/firebase/config.ts`); the web API key is restricted by HTTP referrer in Google Cloud and shared with BmWeb, so every BmWeb/PowerAppWeb origin (incl. localhost:9002/9003) must be listed. Firebase JS SDK pinned to v11 (v12 requires Node ≥24).
- Web Push via FCM for web (service worker) — backend must store web tokens.
- In-browser OCR for CUPS (e.g. Tesseract.js over `getUserMedia`); photo upload as fallback.
- New backend capability: accept bill photos (image) for consumption/CUPS extraction.

## Authentication and Authorization
Firebase ID token → `Authorization: Bearer`. Backend enforces `granted_users`, Tier, and Bound Device (one device total; browser counts as a device, needs a stable browser device id).

Session end (`logout-force-logout`):
- Manual logout: best-effort `POST /auth/logout` (marks offline), then Firebase sign-out. The Bound Device id is kept.
- Forced logout (local sign-out + notice on `/login`, no `/auth/logout`): 403 → backend message; 401 → "Tu sesión ha caducado…"; revoked Firebase session (`auth/user-token-expired`, `user-disabled`, `user-not-found`, `invalid-user-token`; BmWeb grant deletion revokes refresh tokens) → "Tu acceso ha sido revocado…". Network/5xx never sign out.
- No push channel on web yet: access is re-checked via `/user-data` when the tab becomes visible (throttled to 60 s). Instant force logout arrives with web push.
- Signed-in features MUST call the backend through `useBmFetch()` (`src/lib/api/use-bm-fetch.ts`) so 401/403 from any call ends the session; per-session local data must be cleared in `clearLocalSessionData()` (`src/lib/auth/logout.ts`).

## Deployment and Operations
Development targets BmBackend QA (`qa` branch, port 9081).
Same setup as BmWeb, hosted at IONOS. Must be HTTPS (required for camera, service worker, push). Details at implementation time.

## Testing and Verification
- Unit tests for ported comparator calculations against golden cases from Android.
- E2E: `npm run test:e2e` (device id pinned via `E2E_DEVICE_ID`, default `web-e2e-playwright`; runs bind the test account in local QA) (Playwright, projects `iphone-webkit` and `android-chromium`; starts/reuses dev server on :9003). Signed-in tests need `E2E_EMAIL`/`E2E_PASSWORD` env vars (QA account; never committed). Not part of `init.sh`.
- Manual check on real iPhone and Android devices.

## Observability
Firebase Analytics (web) for screen tracking, parity with Android events; backend logs with `X-Request-Id`.

## Constraints
- Backend currently plain HTTP on a bare IP → the server proxy avoids mixed content/CORS.
- iOS: push only in installed PWA (final stage); Android push works without install; no auto install prompt (show an "Add to Home Screen" hint); camera via HTTPS only.
