# Progress Log

## Current Verified State

- Repository root: `BM/PowerAppWeb` (git: https://github.com/VictorGeoSoftware/PowerAppWeb, branch `main`)
- New machine setup: `README.md`
- Standard startup path: `./init.sh`
- Standard verification path: `./init.sh` (npm ci, lint, typecheck, test); also `npm run build`. Dev: `npm run dev` on :9003
- Backend target: BmBackend QA (`qa` branch)
- Current next ready feature: see `feature_list.json` (first dependency-ready, not accepted); `fee-first-gate` accepted
- E2E: `npm run test:e2e` (needs `E2E_EMAIL`/`E2E_PASSWORD` in shell for signed-in tests; QA session saved once per browser by `e2e/auth.setup.ts`, serial run — see README §6)
- Dev backend: local Docker QA stack (`../BmInfra/bm-local-qa up`, localhost:9081) via `.env.local`; remote QA VPS blocked from Volvo network
- Current blocker: none
- Last verified at: 2026-10-14 (consumption-by-cups-manual passing on android-chromium; iphone-webkit pending)

## Session Log

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
