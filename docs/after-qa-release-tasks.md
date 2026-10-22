# After QA Release Tasks

Checks that cannot be done from the development Mac. The Volvo VPN blocks the remote QA VPS and phones cannot reach the local stack over HTTPS. Run them once PowerAppWeb is deployed to the QA environment (HTTPS), using the user's real iPhone and Android devices.

This list feeds `qa-real-device-checks` in `feature_list.json`. When a feature defers a check, add it here. When a check is done, tick it, add the date and result, and copy the evidence into `qa-real-device-checks`.

Devices: **iPhone** = Safari and Home Screen (standalone) once `pwa-installable` exists. **Android** = Chrome.

## 1. Environment and backend

- [x] BmBackend `qa` with bill photo extraction (merged, #64) deployed. Without it, photo uploads return 400 ("No se pudo iniciar el estudio") (`consumption-by-photo`). — done 2026-10-22 (power-app-web.vercel.app).
- [x] QA web origin added to the Firebase authorized domains and to the Google Cloud API-key HTTP referrers (`login-google`, `docs/technical-discovery.md`). — done 2026-10-22 (power-app-web.vercel.app).
- [x] Live proxy call from outside the corporate network: `Bearer x` returns the backend's 401 (`backend-proxy`). — done 2026-10-22 (power-app-web.vercel.app).
- [x] BmBackend `qa` with `V14__web_push_tokens` (`web-push-registration`) and the web multicast sender (`web-push-price-updates`) deployed; `NEXT_PUBLIC_FIREBASE_VAPID_KEY` set in the QA web deployment env (empty = no notifications UI). — done 2026-10-22 (power-app-web.vercel.app).
- [x] Docling time on the real QA VPS stays within the ~3 min poll budget, for a 2.0TD and a 3.0TD bill PDF (`consumption-by-pdf`; the local baseline is 54 s / 37 s). — done 2026-10-22 (power-app-web.vercel.app).
- [x] CUPS job end to end with real n8n/Datadis on a real customer CUPS (`consumption-by-cups-manual` Scenario 8). — done 2026-10-22 (power-app-web.vercel.app).

## 2. Auth and shell

- [x] Google sign-in completes on iPhone and Android (`login-google`). Check that the redirect flow works where Safari blocks the popup. — done 2026-10-22 (power-app-web.vercel.app) iOS needed the auth handler served from the app origin: `next.config.ts` rewrites `/__/auth/*` and `/__/firebase/*` to Firebase, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=power-app-web.vercel.app` (Vercel, type Config), redirect URI `https://power-app-web.vercel.app/__/auth/handler` on the OAuth web client.
- [x] iPhone with a notch, portrait and landscape, in Safari and standalone: the top bar sits below the status bar, and the menu and content are not hidden by the notch or home indicator (`app-shell-navigation` Scenario 7). — done 2026-10-22 (power-app-web.vercel.app).
- [x] `iphone-webkit` E2E (`npm run test:e2e:all`) on a Mac running macOS 13 or later. This Mac is now on macOS 26.6 (WebKit installed 2026-10-22); needs the local QA stack running (`../BmInfra/bm-local-qa start`). — done 2026-10-22: `npm run test:e2e:all` 163 passed, 5 skipped (iPhone project blocks service workers; Android-only/CDP tests skipped on WebKit).

## 3. Consumption study

- [x] iOS Safari CUPS camera OCR spike, with the same rules as the Android gate: at least 5 real paper bills from at least 2 retailers, including one 22-character CUPS; at least 80% detected within 10 s; zero false-valid codes. If it fails, reopen `cups-camera-ocr` (`cups-camera-ocr`). — done 2026-10-22, passed on Android Chrome and iPhone (power-app-web.vercel.app).
- [x] iPhone: the Files picker accepts a bill PDF even when the provider reports an empty MIME type (`consumption-by-pdf`). — done 2026-10-22, passed on Android Chrome and iPhone (power-app-web.vercel.app).
- [x] iPhone: camera photo of a paper bill reaches the report, and the upload is JPEG, not HEIC, in the network log (`consumption-by-photo`). — done 2026-10-22, passed on Android Chrome and iPhone (power-app-web.vercel.app).
- [x] Silent refresh returns 200 against a real completed job after a reload, the 60 s tab-return refresh works in a real browser, and "Reintentar" works after a backend restart (`consumption-job-refresh-errors`). — done 2026-10-22, passed on Android Chrome and iPhone (power-app-web.vercel.app).
- [x] iOS keyboard: no autocorrect or capitalisation on the CUPS field (`consumption-by-cups-manual`). — done 2026-10-22, passed on Android Chrome and iPhone (power-app-web.vercel.app).

## 4. Current conditions and comparator

- [x] iPhone: price fields open the decimal keypad and accept a comma (`current-conditions-form`). — done 2026-10-22, passed (power-app-web.vercel.app).
- [x] Side-by-side parity with BmApp on the same CUPS and prices: the customer total, each proposal total, each difference and percentage, and the "Mejor opción" card (`proposals-table`, `comparator-calculation`). — done 2026-10-22, passed (power-app-web.vercel.app).
- [x] Same study in BmApp and on the web: the same proposals are auto-hidden as uncompetitive (`proposals-configuration`). — done 2026-10-22, passed (power-app-web.vercel.app).
- [x] The copy-prices sheet fits on a small iPhone, with Cancelar and Copiar visible (`conditions-copy-from-proposal`). — done 2026-10-22, passed (power-app-web.vercel.app).

## 5. Comparator PDF

- [x] Android Chrome: "Crear informe" opens the native share sheet with `comparador_*.pdf`, and sharing to WhatsApp or mail works (`comparator-pdf-share`). — done 2026-10-22, passed (power-app-web.vercel.app).
- [x] iPhone Safari: same check. If Safari blocks the share after the network wait, the "Informe listo" panel's "Compartir PDF" must work on the second tap (`comparator-pdf-share` Scenario 4). — done 2026-10-22, passed (power-app-web.vercel.app).
- [x] Desktop: the PDF downloads and opens with the same values as the table (`comparator-pdf-share`). — done 2026-10-22, passed (power-app-web.vercel.app).

## 6. Later features (add as they are specced)

- [x] `pwa-installable`: install on Android Chrome (Chrome prompt or menu "Instalar aplicación") and iPhone Safari (banner/menu hint → Share → Añadir a pantalla de inicio); check the icon (maskable on Android, opaque on iOS), the standalone launch at `/` with the session kept, the status bar colour, and that no install entry or banner shows once installed. — done 2026-10-22, passed on Android Chrome and iPhone (power-app-web.vercel.app).
- [x] `web-push-registration`: on Android Chrome and on an installed iPhone PWA (iOS 16.4+), "Activar notificaciones" shows the system prompt, the pill "Notificaciones activadas" appears, and a row with the right `platform` is in QA `web_push_tokens`; logout removes it. In an iPhone Safari tab the entry opens the install sheet with "En iPhone, las notificaciones requieren instalar la app" and never prompts. — done 2026-10-22, passed on Android Chrome and iPhone (power-app-web.vercel.app).
- [x] `web-push-price-updates`: trigger a price change from BmWeb (e.g. save tax settings unchanged); within ~5 s the notification "Tarifas actualizadas" (brand icon) arrives on Android Chrome and on the installed iPhone PWA, with the app closed and in the background. Tapping it opens/focuses PowerApp on Propuestas (or the gate redirect) and the study refreshes. Several changes in a row leave one notification (tag). After logout no notification arrives. — done 2026-10-22, passed on Android Chrome and iPhone (power-app-web.vercel.app).
- [ ] `device-binding-hardening`: the second-device rejection, phone vs browser.
- [ ] `analytics-events` (proposed, not yet in `feature_list.json`; depends on `analytics-screen-tracking`): track the BmApp action events with the same names, params and failure reasons (`login_*`, `cups_scan_*`, `consumption_fetch_*`, `proposals_generated`, `proposal_pdf_*`, `proposal_visibility_changed`; see BmApp `AnalyticsEvent.kt` / `AnalyticsFailureReason.kt`), using `track()` from `src/lib/analytics/tracker.ts`. Check them in Firebase DebugView from a real iPhone and Android next to the BmApp events.
