# Progress Log

## Current Verified State

- Repository root: `BM/PowerAppWeb` (git: https://github.com/VictorGeoSoftware/PowerAppWeb, branch `main`)
- New machine setup: `README.md`
- Standard startup path: `./init.sh`
- Standard verification path: `./init.sh` (npm ci, lint, typecheck, test); also `npm run build`. Dev: `npm run dev` on :9003
- Backend target: BmBackend QA (`qa` branch)
- Current next ready feature: `comparator-calculation` (`feature-spec`)
- `../BmBackend` is checked out on `feature/backend-bill-photo-extraction` (uncommitted; local QA builds this checkout)
- E2E: `npm run test:e2e` (needs `E2E_EMAIL`/`E2E_PASSWORD` in shell for signed-in tests; QA session saved once per browser by `e2e/auth.setup.ts`, serial run — see README §6)
- Dev backend: local Docker QA stack (`../BmInfra/bm-local-qa up`, localhost:9081) via `.env.local`; remote QA VPS blocked from Volvo network
- Current blocker: none
- Last verified at: 2026-10-19 (collected-prices-submit implemented: vitest 329, full E2E 65 passed on android-chromium)

## Session Log

### Validation: collected-prices-submit (2026-10-19)

- Verdict: accept. `./init.sh` green (329 vitest); `npm run test:e2e -- e2e/collected-prices.spec.ts` 4/4 (android-chromium). Full suite not rerun (recorded 65 passed for the same code).
- Live QA check (iOS simulator on :9003, 3.0TD REPSOL bill PDF): backend `POST /api/v1/collected-prices -> 201`, `bm_qa.collected_prices` row id=1 (Iberdrola, 3.0TD, 13:21:49 UTC). An earlier 2.0TD study correctly sent nothing.
- Note: QA test account device binding can block `e2e/auth.setup.ts` when the same account is signed in elsewhere.
- Next: `feature-spec` for `comparator-calculation`.

### Implementation: collected-prices-submit (2026-10-19)

- Spec: `docs/specs/collected-prices-submit.md`. New `src/lib/conditions/collected-prices.ts` (port of BmApp TariffCanonicalForm / ShouldCollectPrices / BuildCollectedPrices / mapper); `onGoToProposals` fires it without awaiting, then navigates. Order mark → should → build → send. Once-per-job guard in sessionStorage `bm.collectedPricesJobIds`, cleared by `clearStudyStorage()` (new study and logout).
- Evidence: `./init.sh` green (329 vitest); `e2e/collected-prices.spec.ts` + `current-conditions.spec.ts` 5/5; full `npm run test:e2e` 65 passed (android-chromium). E2E mocks the POST.
- Open: live "QA DB shows entry" check not done (run a 3.0TD study on :9003 against local QA, confirm 201 / new `collected_prices` row).
- Next: `feature-validator` for `collected-prices-submit`.

### Validation: current-conditions-form (2026-10-19)

- Verdict: accept. `./init.sh` green (308 vitest); `npm run test:e2e -- e2e/current-conditions.spec.ts e2e/fee-first-gate.spec.ts` 4/4 on android-chromium. Full suite not rerun (recorded 124 passed for the same code). Regex, Spanish strings and placeholders verified against BmApp source.
- Notes (non-blocking): E2E/harness tooling changes share the working tree (commit separately); `--gate-*` banner colours not documented in `DESIGN.md`; real-iPhone keypad and BmApp side-by-side parity deferred to `qa-real-device-checks`.
- Next: `feature-spec` for `collected-prices-submit`.

### Implementation: current-conditions-form (2026-10-19)

- Spec: `docs/specs/current-conditions-form.md`. Replaced the `/current-conditions` placeholder with the BmApp form: gate banner (locked/unlocked, "N de M campos completados", progressbar), customer data (Titular/Dirección editable in session, CUPS read-only, Comercializadora), power/energy price rows per report period, Servicios extra, CTA "Ir a las propuestas de precios" when unlocked (hook for `collected-prices-submit` in `onGoToProposals`).
- New: `src/lib/conditions/{decimal-input,messages}.ts`, `src/components/conditions/{current-conditions-form,fee-first-gate-banner}.tsx`, `e2e/current-conditions.spec.ts`; `isFilledPrice` exported from `fee-first.ts`; `--gate-*` colour tokens (BmApp banner colours) in `globals.css`.
- Parity choices: no tax inputs, no Save button (BmApp). Copy-from-proposal sheet deferred to `proposals-table`.
- Evidence: `./init.sh` green (308 vitest); full `npm run test:e2e` 124 passed on both browsers. The first full run had 20 failures, all from consumption specs using `getByText(CUPS)`, which now matched twice; those checks are now limited to the summary card.
- Open: real-iPhone decimal keypad check and side-by-side BmApp parity on a real QA CUPS not done.
- Next: `feature-validator` for `current-conditions-form`.

### Validation: consumption-by-photo (2026-10-19)

- Verdict: accept. `./init.sh` green (276 vitest); `npm run test:e2e -- e2e/consumption-photo.spec.ts` 30/30 on android-chromium + iphone-webkit against local QA (stack rebuilt via `bm-local-qa up` after Docker restart). Full suite not rerun (recorded 122 passed for the same code).
- Notes (non-blocking): Scenario 8 is user-reported; HEIC→JPEG confirmed indirectly (client rejects HEIC, real iPhone upload succeeded). Backend photo support still only on BmBackend `feature/backend-bill-photo-extraction` (not merged to `qa`). Photo job timeout covered by shared `runStudy` unit tests only.
- Next: `feature-spec` for `current-conditions-form`.

### E2E process fix (2026-10-16)

- Cause of ~20 min runs: an orphaned `next dev` (parent `launchd`, left behind by a killed run) stuck at 100%+ CPU and reused via `reuseExistingServer`, concurrent/subagent runs, unconditional `npm ci` in `init.sh` under corporate Endpoint Security, 3 s poll intervals across 26 mocked tests, and bash signal-trap deferral leaving orphaned `:9004` servers when runs were aborted.
- Fix: Playwright builds `.next-e2e` (`NEXT_PUBLIC_E2E_POLL_INTERVAL_MS=750`, `outputFileTracingRoot`) and runs `next start` on 9004 (added to the QA Firebase key referrers), never reuses a server; `scripts/e2e.sh` adds a one-run lock, background `wait` with immediate `INT`/`TERM`/`HUP` child-tree cleanup, automatic `.next-e2e` build stamp reuse when `src/` and config are unchanged, and keychain credentials; `init.sh` skips `npm ci` when `package-lock.json` is unchanged; `openSignedIn` navigates directly to `/fetch-consumption`; `feature-validator` and `feature-spec` skills updated to run inline (never spawning a subagent) and rerun only the feature's focused E2E spec when full-suite evidence already exists; fast-shell rules in `AGENTS.md`.
- Evidence: `./init.sh` 10 s (was ~60 s); `consumption-photo.spec.ts` quick run 15 passed in 37.8 s reusing `.next-e2e`; `photo+cups+pdf` quick run 37 passed in 1.8 min incl. build (was ~20 min).

### Session 001

- Date: 2026-10-12
- Goal: Discovery and minimal startup harness.
- Completed: discovery docs (`CONTEXT.md`, `DESIGN.md`, `docs/*`); `AGENTS.md`, `init.sh`, `PROGRESS.md`, `feature_list.json`.
- Verification run: JSON validation of `feature_list.json`; `./init.sh` pre-bootstrap run.
- Known risk or unresolved issue: in-browser CUPS OCR accuracy; Bound Device hardening deferred to pre-PROD.
- Next best step: run `feature-spec` for `bootstrap-nextjs-app`.

### Session 002

- Date: 2026-10-12
- Goal: Implement `bootstrap-nextjs-app`.
- Completed: Next.js 15.5 skeleton, shadcn button, ESLint flat config, Vitest, Spanish placeholder `/`.
- Verification run: `./init.sh` green; negative type-error check fails gate; `npm run build` OK; Playwright WebKit iPhone 13 screenshot.
- Known risk or unresolved issue: Tailwind 4 instead of BmWeb's 3.4 (recorded in spec); repo not under git yet.
- Next best step: run `feature-validator` on `bootstrap-nextjs-app`.

### Session 003

- Date: 2026-10-12
- Goal: `bootstrap-nextjs-app` accepted (user validation); implement `design-tokens-theme`.
- Completed: BmApp palette in `globals.css` (light + system dark), extended table/header/section tokens, `/dev/theme` preview, parity test.
- Verification run: `./init.sh` (44 tests), `npm run build`, prod 404 for `/dev/theme`, WebKit iPhone 13 screenshots light/dark.
- Known risk or unresolved issue: none new.
- Next best step: validate `design-tokens-theme`; then spec `backend-proxy`.

### Session 004

- Date: 2026-10-12
- Goal: `design-tokens-theme` accepted (user); implement `backend-proxy`.
- Completed: `/api/bm/[...path]` catch-all proxy with Broker allowlist, `BM_BACKEND_URL` server env, `.env.example`, 10 unit tests.
- Verification run: `./init.sh` (54 tests), `npm run build`, local curl checks.
- Known risk or unresolved issue: live QA check pending — QA IP blocked by corporate network.
- Next best step: validate `backend-proxy`; then `login-email`.
- Update: live check passed against local Docker QA backend (localhost:9081).

### Session 005

- Date: 2026-10-12
- Goal: implement `login-email`.
- Completed: Firebase web config, AuthProvider + guards, `/login` mirroring BmApp LoginScreen, signed-in placeholder `/`, Spanish error mapping, Playwright harness.
- Verification run: `./init.sh` (68 tests), `npm run build`, `npm run test:e2e` 6/6 with real QA account, light/dark screenshots.
- Known risk or unresolved issue: Firebase JS v12 needs Node ≥24 (pinned v11). `/` still placeholder until app shell.
- Next best step: validate `backend-proxy` and `login-email`.

### Session 006

- Date: 2026-10-12
- Goal: `backend-proxy`, `login-email` accepted (user); implement `login-google` and `access-gate`.
- Completed: Google popup sign-in (redirect fallback), `bmFetch` client, `/user-data` access check on every session with sign-out on 401/403 and retry screen on other failures.
- Verification run: `./init.sh` (85 tests), `npm run build`, `npm run test:e2e` 14/14 vs local Docker QA backend.
- Known risk or unresolved issue: real Google login needs manual check; backend skips device binding when `phoneUuid` missing (to fix in `device-binding-basic`).
- Next best step: validate both; then `device-binding-basic`.

### Session 007

- Date: 2026-10-12
- Goal: `login-google`, `access-gate` accepted (user); implement `device-binding-basic`.
- Completed: persisted `web-<uuid>` browser device id sent as `phoneUuid`; E2E fixture pinning the id.
- Verification run: `./init.sh` (90 tests), build, `npm run test:e2e` 16/16 incl. real backend device-mismatch 403; admin-reset path via local DB.
- Known risk or unresolved issue: iOS storage eviction → new id → false lockout (hardening, pre-PROD); backend still accepts missing `phoneUuid`.
- Next best step: validate; then `logout-force-logout`.

### Session 008

- Date: 2026-10-12
- Goal: put the project under git and make it resumable from another computer.
- Completed: `README.md` (workspace layout, Node 22, local Docker backend, env, E2E, repo map); AGENTS/PROGRESS updated; initial commit pushed to GitHub `main`.
- State at push: accepted = bootstrap-nextjs-app, design-tokens-theme, backend-proxy, login-email, login-google, access-gate; passing (awaiting validation) = device-binding-basic.
- Next best step: validate `device-binding-basic`; then `logout-force-logout`.

### Session 009

- Date: 2026-10-13
- Goal: secret-scanner follow-up and validate `device-binding-basic`.
- Completed: Firebase web config moved to `NEXT_PUBLIC_FIREBASE_*` and `BM_BACKEND_URL` made required (no built-in QA default), `.env.example` un-ignored (cdc6fd0); E2E device-id assertion uses `E2E_DEVICE_ID`; `device-binding-basic` accepted.
- Verification run: lint, typecheck, 90 unit tests, `npm run build`; `npm run test:e2e` with QA account 16/16 passed (android-chromium, iphone-webkit).
- Known risk or unresolved issue: Firebase web API key from GitHub alert stays in history of dcf1e71; restricting it (HTTP referrers + API list) in Google Cloud is the mitigation, then close the alert as a false positive. New machines/hosts need `.env.local` with all vars.
- Next best step: implement `logout-force-logout` from `docs/specs/logout-force-logout.md`.

### Session 010

- Date: 2026-10-13
- Goal: implement `logout-force-logout`.
- Completed: manual logout (best-effort `/auth/logout`, device id kept), forced logout on 401/403/revoked Firebase session with Spanish notices, tab-visibility access re-check (60 s), `useBmFetch()` hook, logout button on home placeholder, `e2e/logout.spec.ts`.
- Verification run: `./init.sh` (119 unit tests), `npm run build`, `npm run test:e2e` 22/22; manual revocation via BmWeb (local Docker QA) shows "Tu acceso ha sido revocado…".
- Known risk or unresolved issue: no instant force logout on web until web push; Firebase web API key is now referrer-restricted and shared with BmWeb, so every BmWeb/PowerAppWeb origin must be in its allowed list (localhost:9002 was missing and broke BmWeb login until added). One non-E2E account grant was deleted by mistake during testing (data wiped; grant to be restored by the user if needed).
- Next best step: run `feature-validator` on `logout-force-logout`, then `app-shell-navigation`.
- Update (review fixes): failed Firebase `signOut` now restores the previous status (no endless spinner); a manual-logout flag suppresses notices from background checks finishing after a manual logout. `reportApiError` has no stale-user guard yet (TODO, add with the first `useBmFetch` consumer). `./init.sh` 121 tests green.

### Session 011

- Date: 2026-10-13
- Goal: implement `app-shell-navigation`.
- Completed: `(app)` route group (RequireAuth + AppShell); sticky top bar with "Abrir menú"; left Sheet menu "Menú" with BmApp drawer entries in order, `aria-current` highlight (`bg-section-highlight`), logout entry, version label (`NEXT_PUBLIC_APP_VERSION` or `vddMM_HHmm`); `locked` entry prop for `fee-first-gate`; `useTopBarAction` slot; placeholder pages for `/current-conditions`, `/proposals`, `/configuration`, `/fetch-consumption`; `/` redirects to `/fetch-consumption`; safe-area paddings; E2E updated (signed-in marker is now the menu button, logout via menu) + `e2e/app-shell.spec.ts`.
- Verification run: `./init.sh` (126 unit tests), `npm run build`; E2E 8/8 signed-out tests passed, signed-in tests pending credentials.
- Known risk or unresolved issue: real-iPhone notch check deferred to `qa-real-device-checks`.
- Next best step: run `npm run test:e2e` with `E2E_EMAIL`/`E2E_PASSWORD`, review screenshots, then validate.
- Update: accepted by user validation. Signed-in E2E run not recorded here yet.

### Session 012

- Date: 2026-10-13
- Goal: implement `fee-first-gate`.
- Completed: `src/lib/gate/fee-first.ts` (stage, route table, fallback, redirect, hints — 1:1 port of BmApp), `src/lib/gate/storage.ts` (`bm.currentConditions`, reserved `bm.lastCompletedJobId`), `FeeFirstGateProvider` + `FeeFirstGateGuard` in `(app)/layout.tsx` (blocked routes and `/` redirect to the current step, spinner instead of blocked content), menu padlocks + hint + "Nuevo estudio" resets the study, logout clears gate storage, `docs/domain-model.md` rules.
- Verification run: `./init.sh` (175 unit tests), `npm run build`; E2E 8/8 signed-out, signed-in pending credentials.
- Known risk or unresolved issue: only `CONSUMPTION_REQUIRED` reachable end to end until consumption features land; hint text uses `text-foreground` on `bg-destructive/10` with a red icon: `text-destructive` there was ~4.1:1 (fails AA); BmApp's dark red #991B1B isn't a token.
- Next best step: run `npm run test:e2e` with QA credentials, review screenshots, then validate.

### Session 013

- Date: 2026-10-14
- Goal: full signed-in E2E run for `fee-first-gate`; fix E2E sign-in strategy.
- Completed: repeated runs hit Firebase `QUOTA_EXCEEDED` (~26 password sign-ins per run) and parallel workers on one account interfered. New setup: `e2e/auth.setup.ts` signs in once per browser project and saves `storageState` with IndexedDB to `playwright/.auth/` (gitignored); signed-in specs use `useSignedInSession()`/`openSignedIn()`; second-device test reuses the saved session with another device id (no extra sign-in); `workers: 1`. Fixed two pre-existing test bugs: fee-first heading check now `exact: true` ("Propuestas" matched "Nuevo estudio de propuestas"); Escape focus-return test opens the menu by keyboard (WebKit doesn't focus buttons on tap). No app code changed.
- Verification run: `./init.sh` (175 unit tests); `npm run test:e2e` with QA account against local Docker QA backend: 36/36 passed (2 setup + 34, iphone-webkit + android-chromium), ~2 min.
- Known risk or unresolved issue: Firebase `getProjectConfig` 403 "referer firebaseapp.com blocked" in traces (API key referrer restrictions; not blocking); `QUOTA_EXCEEDED` shows the generic "Error inesperado" message.
- Next best step: validate `fee-first-gate`.
- Validation (independent subagent): revise — menu order ("Nuevo estudio" first) deviated from BmApp/specs without a recorded decision; iPhone menu screenshot taken mid-animation. User confirmed keeping "Nuevo estudio" first: recorded under Decisions in `docs/specs/fee-first-gate.md`, superseding notes in `app-shell-navigation.md`; screenshot now waits for animations. Re-check: `./init.sh`, `npm run build`, E2E 36/36 (validator) + `app-shell.spec.ts` 10/10. `fee-first-gate` accepted.

### Session 014

- Date: 2026-10-14
- Goal: implement `consumption-by-cups-manual` (spec `docs/specs/consumption-by-cups-manual.md`).
- Completed: `src/lib/consumption/` (`cups.ts` CupsCodeParser port, `report.ts` mapper, `study.ts` submit→poll 3 s×60→result runner, `messages.ts` BmApp strings); `ConsumptionStudyProvider` in `(app)/layout.tsx` (persists `bm.activeJob` in sessionStorage, resumes on mount/visible, pauses polling in hidden tabs, restores `bm.lastCompletedJobId` < 1 h, aborts on "Nuevo estudio"/logout); `/fetch-consumption` CUPS form with live validation + progress; `/current-conditions` shows `ConsumptionSummary`; gate `resetCount`; storage helpers; `reportApiError` stale-user/manual-logout guard (TODO removed); `e2e/consumption-cups.spec.ts`; E2E heading assertions now use `FETCH_HEADING`; domain-model and risks docs.
- Verification run: lint, typecheck, vitest 206 passed, `npm run build` OK.
- Not run: `npm run test:e2e` and mobile screenshots — this machine has no `.env.local`, Docker (local QA backend) is down and no E2E credentials. Scenario 8 (real CUPS) PENDING: local QA has no working n8n.
- Known risk or unresolved issue: a status poll landing between logout's storage clear and the provider unmount could re-save `bm.activeJob` in that tab (narrow window; a later resume would show the status-check error).
- Update (same day): with `.env.local` and the BmInfra stack up (started from IntelliJ, compose project `bminfra`), `npm run test:e2e` on android-chromium: 29/29 passed. First runs failed only on dev-server first-compile latency in `auth.setup.ts` (warm the server with `npm run dev` before running). Fixed one test bug (Next.js route announcer is also `role="alert"`). Screenshots reviewed in light and dark. Status `passing`.
- Pending: iphone-webkit E2E — this Mac runs macOS 12.7.6, where Playwright WebKit is frozen and fails (`Emulation.setOrientationOverride`); run on macOS >= 13. Scenario 8 (real CUPS) still pending.
- Next best step: run `feature-validator` on `consumption-by-cups-manual`.
- Validation (independent): accept. Re-ran `./init.sh` (206 tests) and `npm run build`; BmApp parity confirmed. `consumption-by-cups-manual` accepted. Follow-ups: iphone-webkit E2E + iOS autocorrect check on a macOS >= 13 machine; Scenario 8 when n8n works; low: clear `bm.lastCompletedJobId` on new submit (BmApp `resetActiveStudy`).
- Update (iOS follow-ups): this Mac is now macOS 26.6.2, so Playwright WebKit works. With Keychain creds (`bm-e2e-email`/`bm-e2e-password`, README §6), `npm run test:e2e --project=iphone-webkit`: 29/29 passed. Scenario 8 passed: real CUPS `ES0031102615113014GF0F` against local QA + n8n (:6678) on iphone-webkit, no mocks, reached Current Conditions in ~40 s (2.0TD; P1 375 / P2 302 / P3 499 kWh; P1/P2 9,86 kW). The app also loads in real Safari on the iPhone 17 Simulator (iOS 26.3). Tip: Xcode CLI tools need `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` because `xcode-select` points at CommandLineTools. Still open (low): type into the CUPS field with the Simulator keyboard to confirm there's no autocorrect (the attributes are already set); clear `bm.lastCompletedJobId` on new submit.

### Session 015

- Date: 2026-10-14
- Goal: implement `consumption-by-pdf` (spec `docs/specs/consumption-by-pdf.md`).
- Completed: `bill-file.ts` (checks, upload name); `runStudy` now takes a `submission` (`cups` JSON or `pdf` multipart to `fetch-user-consumption-report`, step `UPLOADING_BILL`); `bm.activeJob.source` (legacy entries read as CUPS); provider `startCups`/`startPdf`, failed state carries `source`; `PdfUploadOption` method row under the CUPS form, with one shared alert for file and study errors; `e2e/consumption-pdf.spec.ts`; CUPS E2E method assertion updated; domain-model and risks docs.
- Verification run: `./init.sh` (224 tests), `npm run build`, `npm run test:e2e` 80/80 (both projects). Scenario 8 real bills against local QA + Docling + n8n: 2.0TD Iberdrola 54 s, 3.0TD Repsol 37 s, both reached Current Conditions with plausible summaries. Screenshots reviewed in light and dark.
- Note: the E2E setup first failed because the local QA test account was bound to another browser id; reset `phone_uuid` in the local DB (device-binding-basic spec) before the run. Your own browser will need the same reset to sign in again.
- Known risk or unresolved issue: Files picker in iPhone Simulator Safari not checked yet. Docling time vs the ~3 min poll budget on the real QA VPS.
- Next best step: run `feature-validator` on `consumption-by-pdf`.

### Session 016

- Date: 2026-10-14
- Goal: validate `consumption-by-pdf`.
- Completed: feature-validator verdict accept; status set to `accepted`.
- Verification run: `./init.sh` (224 tests), `npm run build`, Playwright consumption-pdf + consumption-cups 46/46 (both projects); user ran iPhone 17 Simulator Safari: Files picker opened, real 2.0TD bill uploaded and reached Current Conditions.
- Known risk or unresolved issue: Docling time vs ~3 min poll budget on the real QA VPS.
- Next best step: run `feature-spec` for `consumption-job-refresh-errors`.

### Session 017

- Date: 2026-10-16
- Goal: implement `consumption-job-refresh-errors` (spec `docs/specs/consumption-job-refresh-errors.md`, decisions agreed 2026-10-16).
- Completed: `refreshPath`/`refreshReport` in `study.ts`; provider: `canRetry` on failed state, `lastPdf` ref, `retry()`, silent `refreshStudy()` (60 s throttle, injectable `refreshThrottleMs`), refresh chained after restore and on tab return when a session exists, stale guards (uid, abort, session jobId); "Reintentar" outline button (h-11) inside the `CupsForm` alert, wired from `/fetch-consumption`; `e2e/consumption-errors.spec.ts`; domain-model and CONTEXT updated; feature wording corrected (refresh never re-runs a job).
- Verification run: `./init.sh` (239 tests), `npm run build`, `npm run test:e2e` 90/90 (both projects), light + dark screenshots of the retry alert.
- Note: E2E setup failed first on the device binding again (local QA account bound to a personal browser id `web-85b58f8e…`); reset `phone_uuid` in the local DB. The account row's email in local QA differs from the Keychain E2E email, so match by `phone_uuid`/uid, not email. `bm-local-qa up` failed to rebuild (`eclipse-temurin:17-jre-alpine` has no manifest for this platform) but the existing images started fine.
- Known risk or unresolved issue: refresh 200 not yet checked against a real completed job (only mocked); 60 s tab-return not checked in a real browser.
- Next best step: run `feature-validator` on `consumption-job-refresh-errors`.

### Session 018

- Date: 2026-10-16
- Goal: validate `consumption-job-refresh-errors`.
- Completed: independent validation → accept; status set to `accepted`.
- Verification run: `./init.sh` (239 tests), `npm run test:e2e` 90/90 (both projects); backend refresh route reviewed (404 missing/foreign, 409 not completed); retry screenshot reviewed.
- Known risk or unresolved issue: manual local-QA checks still pending (real refresh 200 after reload, 60 s tab return in a real browser, retry after backend restart).
- Next best step: run `feature-spec` for `cups-camera-ocr`.

### Session 019

- Date: 2026-10-16
- Goal: `cups-camera-ocr` step 1 (spike tooling only).
- Completed: `extractBestCandidate` (BmApp regex, trim 22→20, two passes) + 7 tests in `cups.test.ts`; `tesseract.js` ^5 + `cups-ocr.ts` (dynamic import, whitelist, SINGLE_BLOCK, default CDN); dev-only `/dev/cups-scan` bare scanner (10 s attempts, ~600 ms ticks, guide band 90%×25%, grayscale, upscale ≥1000 px); dev-only `POST /api/dev/cups-scan-log` → `.dev-logs/cups-scan.jsonl` (gitignored) + 3 route tests.
- Verification run: `./init.sh` (249 tests); `npm run build` OK; Scenario 9 on `next start`: page 404, log POST 404, no `.dev-logs/` created; dev smoke: page 200, log line appended.
- Next best step: user runs the Android spike (Scenario 8) via `adb reverse tcp:9003 tcp:9003`, `http://localhost:9003/dev/cups-scan`; then record the per-bill table here and decide on step 2.

### Session 020

- Date: 2026-10-16
- Goal: `cups-camera-ocr` spike gate (Scenario 8) + step 2 (full feature).
- Spike gate PASSED (Android Chrome via `adb reverse`, dev page `/dev/cups-scan`; bills unlabelled, recorded as #1–#5; user confirmed all against the paper bills):

  | # | Distributor | Picked CUPS | Len | Time | Valid | False-valid |
  |---|---|---|---|---|---|---|
  | 1 | 0031 | ES0031102615113014GF | 20 (raw had trailing `GF0F`; 20-char base kept) | 1.1 s | yes | no |
  | 2 | 0026 | ES0026000000456555FK0F | 22 | 0.3 s | yes | no |
  | 3 | 0021 | ES0021000013154191MM | 20 (raw `MM1F`; 20-char base kept) | 0.9 s | yes | no |
  | 4 | 0021 | ES0021000042760190GJ1Q | 22 | 0.7 s | yes | no |
  | 5 | 0022 | ES0022000007603872PJ1P | 22 | 1.2 s | yes | no |

  5/5 detected < 10 s (100%), 4 distributors, 3×22-char, 0 false-valid. Positions 21–22 (frontier point) are optional; returning the 20-char base when the suffix is misread is correct. iOS Safari deferred to `qa-real-device-checks`.
- Completed (step 2): `use-camera-stream.ts` (rear camera, stops tracks on unmount/confirm/retry, track `ended` → error); `cups-scanner.tsx` full-screen dialog (Volver, Escape, guide frame, ~600 ms skip-if-busy OCR loop paused while hidden, manual-edit lock, camera/OCR error fallbacks, "Reintentar cámara", worker terminated on unmount; `createRecognizer`/`grab` test seams); `cups-scanner-option.tsx` method row between CUPS form and PDF row → `startCups`; unit + E2E tests; `consumption-pdf.spec.ts` Tab order updated for the new row; risks, technical-discovery, README docs. Dev spike page kept as is.
- Verification run: `./init.sh` (256 tests), `npm run build` (tesseract only in async chunks), `npm run test:e2e` 94/94 both projects; screenshots of row and denied scanner reviewed (light).
- Not run: dark-mode screenshot of the scanner; manual Scenario 4 (deny on a real Android) and Scenario 6 camera-indicator check on device — recommended during validation or `qa-real-device-checks`.
- Next best step: run `feature-validator` on `cups-camera-ocr`.

### Session 021

- Date: 2026-10-16
- Goal: validate and accept `cups-camera-ocr`.
- Validator: VERDICT accept, 0 repair rounds; all 9 scenarios pass, no blocking findings (reran init 256 tests, build, E2E 94/94).
- User manual checks on real Android Chrome: dark-mode scanner OK, camera-denied fallback OK, camera indicator off after "Volver" OK.
- Status: `cups-camera-ocr` → `accepted`. Open risks: iOS Safari OCR accuracy deferred to `qa-real-device-checks`; OCR assets from public CDN (self-host in `pwa-installable`).
- Note: the subagent harness (`.opencode/agents`, `.opencode/commands`) was parked in `docs/archive/opencode-agents/` because it was too slow. Skills now run inline. To restore it, move the folders back to `.opencode/`.
- Next best step: run `feature-spec` for `backend-bill-photo-extraction`.

### Session 022

- Date: 2026-10-16
- Goal: implement `backend-bill-photo-extraction`.
- Completed (BmBackend, branch `feature/backend-bill-photo-extraction` from up-to-date `qa`, uncommitted, not pushed/deployed): `models/ConsumptionUploadType.kt`, `services/ImageToPdfConverter.kt` (magic-byte check, OpenPDF one page = image size, long edge downscaled to 2000 px), `services/InvalidImageException.kt`, `UserConsumptionService.processConsumptionReportFromImage`, route classifier + 400 messages + per-type temp suffix, tests, `docs/ASYNC_JOB_API.md`. PowerAppWeb docs: technical-discovery, risks.
- Verification: `./gradlew test` 164 tests, 0 failures (needs a temp JVM truststore with `BmBackend/certs/*.crt` on the Volvo network via `JAVA_TOOL_OPTIONS`). Local QA backend rebuilt from the branch (`docker compose --project-name bminfra … up -d --build backend-qa`):

  | File | HTTP | Job | CUPS | Time |
  |---|---|---|---|---|
  | Iberdrola p2 JPEG 200 dpi | 202 | COMPLETED | ES0031104740917002MS | 43 s |
  | Iberdrola p2 PNG | 202 | COMPLETED | ES0031104740917002MS | 37 s |
  | Iberdrola p2 JPEG 4134×5847, 3.5 MB | 202 | COMPLETED | ES0031104740917002MS | 38 s |
  | Iberdrola p2 JPEG rotated 90° | 202 | COMPLETED | ES0031104740917002MS | 30 s |
  | Repsol p1 JPEG / PNG | 202 | COMPLETED | ES0021000013154191MM1F | 31 / 28 s |
  | Iberdrola PDF / Repsol PDF (regression) | 202 | COMPLETED | as above | 35 / 34 s |
  | blank.png | 202 | FAILED (Docling 404 no CUPS) | – | 3 s |
  | x.txt / x.heic / x.gif / no extension | 400 `Only PDF, JPEG or PNG files are accepted` | – | – | – |
  | fake.jpg (text) | 400 `Invalid image file` | – | – | – |
  | no token | 401 | – | – | – |

  No `consumption_*` temp files left in the container `/tmp`. Note: a photo of Iberdrola page 1 completes Docling but fails at n8n because the CUPS is on page 2 — single-photo uploads must show the page with the CUPS (relevant for `consumption-by-photo` UX copy).
- Not run: real phone photo of a paper bill (user must supply); PowerAppWeb proxy pass-through (optional).
- Next best step: run `feature-validator` on `backend-bill-photo-extraction`.

### Session 023

- Date: 2026-10-16
- Goal: validate and accept `backend-bill-photo-extraction`.
- Validator: VERDICT accept, 0 repair rounds, no blocking findings (low: no route-level test; corrupted-after-header JPEG → failed job instead of 400). User reviewed the BmBackend diff and accepted.
- Status: `backend-bill-photo-extraction` → `accepted`. User commits/pushes the BmBackend branch `feature/backend-bill-photo-extraction` (from `qa`) themselves.
- Notes: local QA builds whatever is checked out in `../BmBackend` (currently the feature branch). Real phone photo check moves to `consumption-by-photo`; photos must show the CUPS page (Iberdrola: page 2). iPhone HEIC is rejected by the backend → handle client-side.
- Next best step: run `feature-spec` for `consumption-by-photo`.

### Session — consumption-by-photo (implementer)

- Date: 2026-10-16
- Goal: implement `consumption-by-photo` per `docs/specs/consumption-by-photo.md`.
- Completed:
  - `checkBillPhoto`/`photoUploadName` in `bill-file.ts`, `PHOTO_NOT_IMAGE`, `PDF_TOO_LARGE` renamed to `BILL_TOO_LARGE`.
  - `photo` submission in `runStudy`; `JobSource` `photo` in storage.
  - Provider `startPhoto` and `lastFile` retry.
  - New `photo-upload-option.tsx` wired into `/fetch-consumption`.
  - Unit tests and `e2e/consumption-photo.spec.ts`; cups E2E assertion updated.
  - Docs updated: domain-model, risks.
- Verification run:
  - `./init.sh` green (276 vitest).
  - Full `npm run test:e2e`: 120 passed, 2 failed on a typo in the new spec's expected jobId. After the fix, `consumption-photo.spec.ts` passed 30/30 on both projects.
  - Mobile screenshots reviewed.
  - Local QA `ready`. No BmBackend change.
- Not run: Scenario 8 (real iPhone photo of a paper bill on local QA, HEIC→JPEG observation). It needs the user's device and bill. Status set to `blocked`.
- Next best step: the user runs Scenario 8, or agrees to move it to `qa-real-device-checks`. Then mark `passing` and validate.

### Session — consumption-by-photo (implementer, Scenario 8 close-out)

- Date: 2026-10-16
- Scenario 8 (user-reported): the user ran a real paper-bill photo from the iPhone camera against local QA and reported "Working!", meaning the flow reached the report end to end. The agent did not observe it. HEIC→JPEG was not checked directly. It is implied only because the camera shot was not rejected.
- Re-verification: `./init.sh` green (276 vitest). Full `npm run test:e2e` passed 122/122. The first run hit a transient `auth.setup` login timeout, and a rerun passed.
- Status: `passing`. Next: run `feature-validator` for `consumption-by-photo`.
