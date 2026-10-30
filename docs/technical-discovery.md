# Technical Discovery

## Product Surface
Mobile-first responsive web app, installable PWA. Primary targets: iOS Safari (16.4+ for Web Push) and Android Chrome.

## Candidate Stack
Same pattern as `../BmWeb`: Next.js (App Router), React, Tailwind, shadcn/ui, Firebase JS SDK. Server-side route handlers proxy calls to BmBackend.
Pinned at bootstrap: Next 15.5, React 19.1, Tailwind 4, shadcn (base-nova), Vitest 2, ESLint 9 flat config. Dev port 9003 (BmWeb uses 9002).

### Backend proxy convention
- Browser code calls only same-origin `/api/bm/<path>`; `src/app/api/bm/[...path]/route.ts` forwards to `${BM_BACKEND_URL}/api/v1/<path>` with the caller's Bearer token (status/body/content-type passed through).
- Server-only env `BM_BACKEND_URL` (see `.env.example`; dev defaults to QA). Never `NEXT_PUBLIC_`.
- Allowlist `ALLOWED_ROOTS` in `src/lib/server/backend-proxy.ts`; extend it when a feature needs a new Broker endpoint. Admin endpoints stay out. `me` is allowed for `GET /me/access` (tier + capabilities, read by `ReportAccessProvider`).
- Preferred dev backend: local Docker QA stack from `../BmInfra` (`../BmInfra/bm-local-qa up`) → `BM_BACKEND_URL=http://localhost:9081` in `.env.local`. It runs the BmBackend source with the same Firebase project, so real Broker tokens work. Also exposes Postgres (127.0.0.1:15433), n8n (6678), Docling (5000), price-agent (5002).
- Remote QA VPS (`217.154.181.175:9081`) is blocked from the Volvo corporate network.

## Data and Storage
No own database. All data via BmBackend. Client keeps only session and current-flow state.

## Integrations
- BmBackend `/api/v1` endpoints used by BmApp (price-table-results, consumption report jobs, comparator-pdf, collected-prices, user-data, user-activity, auth/logout).
- Firebase Auth (project `brielmarnysos-1dc68`, shared with Android). Web app registered; public config from `NEXT_PUBLIC_FIREBASE_*` env vars (`src/lib/firebase/config.ts`); the web API key is restricted by HTTP referrer in Google Cloud and shared with BmWeb, so every BmWeb/PowerAppWeb origin (incl. localhost:9002/9003) must be listed. Firebase JS SDK pinned to v11 (v12 requires Node ≥24).
- Web Push via FCM for web (service worker) — backend stores web tokens (`POST`/`DELETE /api/v1/push/web-tokens`, table `web_push_tokens`, `web-push-registration`).
- In-browser OCR for CUPS: Tesseract.js (v5, dynamic import, default CDN) over `getUserMedia`; photo upload as fallback. Real-device Android testing via `adb reverse tcp:9003 tcp:9003` (phone loads `http://localhost:9003`, a secure context, so no HTTPS needed).
- Comparator PDF delivery (`src/lib/pdf/share-file.ts`, web adaptation of BmApp `ComparatorPdfShareManager`): if `navigator.canShare({files})` is true, `navigator.share({files:[pdf], title:"Comparador de propuestas"})`; `AbortError` (user closed the sheet) does nothing; `NotAllowedError` (user activation expired during the backend call, expected on iOS Safari) shows an "Informe listo" panel whose "Compartir PDF" / "Descargar" buttons run on a fresh tap; no file-share support or any other share error → download via an object-URL `<a download>` (URL revoked after 1 s). Real-device share behaviour is checked in `qa-real-device-checks`.
- Bill photos: `POST /api/v1/fetch-user-consumption-report` accepts JPEG/PNG as well as PDF (same 202 job contract); BmBackend wraps the image into a one-page PDF before Docling (`backend-bill-photo-extraction`).

## Authentication and Authorization
Firebase ID token → `Authorization: Bearer`. Backend enforces `granted_users`, Tier, and Bound Device (one device total; browser counts as a device, needs a stable browser device id).

Session end (`logout-force-logout`):
- Manual logout: best-effort `POST /auth/logout` (marks offline), then Firebase sign-out. The Bound Device id is kept.
- Forced logout (local sign-out + notice on `/login`, no `/auth/logout`): 403 → backend message; 401 → "Tu sesión ha caducado…"; revoked Firebase session (`auth/user-token-expired`, `user-disabled`, `user-not-found`, `invalid-user-token`; BmWeb grant deletion revokes refresh tokens) → "Tu acceso ha sido revocado…". Network/5xx never sign out.
- No force-logout push channel on web: access is re-checked via `/user-data` when the tab becomes visible (throttled to 60 s). Grant deletion wipes the account's web push tokens before the `force_logout` send, so there is nothing to deliver to.
- User activity (`src/components/auth/user-activity-reporter.tsx`, mounted in `src/app/(app)/layout.tsx`): BmApp `onResume`/`onStop` map to `visibilitychange` (`visible`/`hidden`) and `pagehide`; events use `bmFetch` directly with `keepalive: true` (not `useBmFetch`, so a 401/403 there never forces logout). Headless browser closes and some mobile kills may not deliver `offline`; iOS `pagehide` delivery is checked in `qa-real-device-checks`.
- Exception (report-web-export): `POST reports/premium-pdf` uses `bmFetch` directly so a 403 with `code: "premium_required"` (Premium capability lost) does not sign out: it shows "El informe completo requiere el plan Premium.", hides "Informe completo" and forces a `me/access` re-check. 401, 403 without that code and revoked Firebase sessions are passed to `reportApiError` (forced logout as before). `BmApiError.code` carries the backend `ReportErrorResponse.code`; the client maps by status/code and never shows the backend message. Requests send `Accept: application/pdf, application/json` (with only `application/pdf` the backend answers its JSON errors with 406).
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

- Gate (BmApp `AnalyticsCollectionPolicy`): collection only when `NEXT_PUBLIC_ANALYTICS_ENABLED` is exactly `true`, `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` is set and `isSupported()` resolves true. Otherwise the tracker is a no-op and `firebase/analytics` is never loaded (E2E asserts no GA traffic). Only the production deployment sets the flag; the deployment config is not in this repo yet (open item for deployment / `pwa-installable`).
- `initializeAnalytics(app, { config: { send_page_view: false } })`; one `screen_view` (`firebase_screen` = `firebase_screen_class`) per screen entry, names hard-coded in `src/lib/analytics/screens.ts` (BmApp `BmAppRouteAnalytics.kt`): `auth_login`, `fetch_consumption`, `cups_scanner`, `current_conditions`, `proposals`, `configuration`. Sent only when the screen renders (never on gate redirects); the CUPS scanner overlay reports `cups_scanner`, closing it reports `fetch_consumption` again.
- Privacy: no user id/properties, no identifying params (contract in `src/lib/analytics/tracker.ts`). Action events (login, CUPS scan, fetch, PDF…) are not implemented yet.
- DebugView: build with `NEXT_PUBLIC_ANALYTICS_ENABLED=true NEXT_PUBLIC_ANALYTICS_DEBUG=true` (adds `debug_mode` to every event), walk the screens, check Firebase console > Analytics > DebugView.

## PWA
- `src/app/manifest.ts` (`/manifest.webmanifest`): standalone, portrait, `start_url`/`scope` `/`, theme/background `#F8FAFC`; icons in `public/icons/` (see `DESIGN.md`). `layout.tsx` adds the Apple web-app meta, the 180px apple-touch-icon and the light/dark theme colour.
- `public/sw.js`: only `install` (skipWaiting) and `activate` (clients.claim); **no fetch handler**, no caching (online-only). Registered by `ServiceWorkerRegistrar` in production builds only; served with `Cache-Control: no-cache` and `Service-Worker-Allowed: /`. `web-push-registration` uses this registration for FCM (no `firebase-messaging-sw.js`). `web-push-price-updates` adds `push` and `notificationclick` handlers (below).
- Install UX (`InstallProvider` in the root layout): captures `beforeinstallprompt` early; iOS is detected by UA (`iPhone|iPad|iPod`, or iPadOS as Mac with touch), not by browser, because every iOS browser installs through Share on 16.4+. Standalone = `navigator.standalone` or `display-mode: standalone`.
- Web Push token registration (`web-push-registration`): FCM JS SDK (`firebase/messaging`, lazy-loaded) issues a token on `/sw.js` with the public VAPID key `NEXT_PUBLIC_FIREBASE_VAPID_KEY` (empty = feature hidden). `src/lib/pwa/push.ts` + `PushProvider` (signed-in layout): support is `unsupported` / `needs-install` (iOS tab: Safari exposes push only to installed PWAs, 16.4+) / `available`. Permission is requested only from a tap (menu "Activar notificaciones" or the one-time card on `/fetch-consumption`). The token is POSTed to `push/web-tokens` with `platform` (`ios`/`android`/`desktop`) and kept as `bm.pushToken` `{uid, token}`; each signed-in start with permission already granted re-posts only if token or uid changed. Manual logout DELETEs it (before `auth/logout`) and calls FCM `deleteToken`; forced logout is local only and the backend grant wipe removes the rows.
- Why the backend stores tokens: BmApp subscribes to the `price_updates`/`force_logout` topics from the device, but the FCM JS SDK cannot subscribe to topics from a browser. Instead of subscribing web tokens to topics server-side, the backend sends to the stored tokens directly (see BmBackend `docs/WEB_PUSH.md`).
- Price-update delivery (`web-push-price-updates`): after the existing 5 s debounce, BmBackend sends the Android topic message unchanged **and** a data-only FCM multicast to every `web_push_tokens` row (chunks of 500, `Urgency: high`, `TTL: 86400`, data `type=price_updates` + `payload`, no `notification` block). `UNREGISTERED`/`SENDER_ID_MISMATCH`/`INVALID_ARGUMENT` tokens are pruned. Raw shape seen by `/sw.js` (live, 2026-10-19): `{"data":{"type":"price_updates","payload":"<JSON>"},"priority":"high","from":"<sender id>","fcmMessageId":"…"}`. `/sw.js` **always** shows a notification (iOS revokes silent push subscriptions; Chrome shows a generic one): "Tarifas actualizadas" / tag `price_updates` / `data.url=/proposals`; anything else shows "PowerApp" opening `/`. It also posts `{type:"bm:price_updates"}` to every window client. A tap focuses an open window and navigates it to the URL (or opens one) and posts the same message. `ConsumptionStudyProvider` listens (`src/lib/pwa/sw-messages.ts`) and refreshes the published study ignoring the 60 s throttle (BmApp parity). No force logout over web push: grant deletion wipes the tokens first.
- Playwright note: browser contexts are incognito, where Chrome disables the Push API, and headless Chromium reports `Notification.permission === "denied"` even after `grantPermissions`. E2E stubs FCM through `window.__bmPushTestToken` (only in builds with `NEXT_PUBLIC_E2E=1`, set by `scripts/e2e.sh`) and stubs the permission; a real token needs a persistent, headed profile. A push event itself can be delivered to `/sw.js` in normal E2E contexts with CDP `ServiceWorker.deliverPushMessage` (`e2e/push-price-updates.spec.ts`).
- Installability check: `e2e/pwa.spec.ts` asserts `Page.getInstallabilityErrors` is empty (Lighthouse 12 has no PWA audit).

## Constraints
- Backend currently plain HTTP on a bare IP → the server proxy avoids mixed content/CORS.
- iOS: push only in installed PWA (final stage); Android push works without install; no auto install prompt (show an "Add to Home Screen" hint); camera via HTTPS only.
