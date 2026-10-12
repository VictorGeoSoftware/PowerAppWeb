# Progress Log

## Current Verified State

- Repository root: `BM/PowerAppWeb` (git: https://github.com/VictorGeoSoftware/PowerAppWeb, branch `main`)
- New machine setup: `README.md`
- Standard startup path: `./init.sh`
- Standard verification path: `./init.sh` (npm ci, lint, typecheck, test); also `npm run build`. Dev: `npm run dev` on :9003
- Backend target: BmBackend QA (`qa` branch)
- Current next ready feature: `logout-force-logout` (access-gate accepted); `device-binding-basic` passing, awaiting validation
- E2E: `npm run test:e2e` (needs `E2E_EMAIL`/`E2E_PASSWORD` in shell for signed-in tests)
- Dev backend: local Docker QA stack (`../BmInfra/bm-local-qa up`, localhost:9081) via `.env.local`; remote QA VPS blocked from Volvo network
- Current blocker: none
- Last verified at: 2026-10-12

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
