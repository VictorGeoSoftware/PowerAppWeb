# Progress Log

## Current Verified State

- Repository root: `BM/PowerAppWeb` (git: https://github.com/VictorGeoSoftware/PowerAppWeb, branch `main`)
- New machine setup: `README.md`
- Standard startup path: `./init.sh`
- Standard verification path: `./init.sh` (npm ci, lint, typecheck, test); also `npm run build`. Dev: `npm run dev` on :9003
- Backend target: BmBackend QA (`qa` branch)
- Current next ready feature: `app-shell-navigation`; `logout-force-logout` passing, awaiting validation
- E2E: `npm run test:e2e` (needs `E2E_EMAIL`/`E2E_PASSWORD` in shell for signed-in tests)
- Dev backend: local Docker QA stack (`../BmInfra/bm-local-qa up`, localhost:9081) via `.env.local`; remote QA VPS blocked from Volvo network
- Current blocker: none
- Last verified at: 2026-10-13

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
