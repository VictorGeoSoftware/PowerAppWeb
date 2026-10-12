# PowerAppWeb

Mobile-first responsive web client (installable PWA) of **BmApp / PowerApp**: the Spanish electricity tariff comparator for Brokers, on iOS and Android smartphones. UI in Spanish.

Start with `AGENTS.md` (working rules), then `PROGRESS.md` (current state and next step) and `feature_list.json` (feature status).

## Stack

Next.js 15.5 (App Router) · React 19 · Tailwind 4 + shadcn · Firebase JS SDK 11 (Auth, project `brielmarnysos-1dc68`, shared with Android) · Vitest · Playwright.

The browser never calls BmBackend directly: same-origin `/api/bm/<path>` is proxied server-side to `${BM_BACKEND_URL}/api/v1/<path>` (see `docs/technical-discovery.md`).

## Setup on a new computer

### 1. Workspace layout
The docs reference sibling repos as read-only sources of parity. Clone them next to this repo:

```
BM/
├── PowerAppWeb/   (this repo)
├── BmApp/         Android app: behaviour and calculations to match
├── BmBackend/     Ktor API (backend changes go to its `qa` branch only)
├── BmWeb/         admin back-office (grants, device-binding reset)
└── BmInfra/       local Docker QA stack
```

### 2. Requirements
- Node **22** (Firebase JS SDK 12 would need Node ≥24, which is why the SDK is pinned to 11) and npm 10.
- Docker Desktop, for the local backend.

### 3. Install and verify
```bash
./init.sh                   # npm ci + lint + typecheck + unit tests (never starts servers)
npx playwright install webkit chromium   # once, for E2E
```

### 4. Backend for development
Recommended: the local Docker QA stack (it also works on networks that block the QA VPS).

```bash
../BmInfra/bm-local-qa up       # see BmInfra docs; needs local-qa.env + Firebase service account (not in git)
cp .env.example .env.local      # BM_BACKEND_URL=http://localhost:9081
```

Without `.env.local`, development defaults to the remote QA VPS (`http://217.154.181.175:9081`).

### 5. Run
```bash
npm run dev          # http://localhost:9003   (BmWeb uses 9002)
npm run build        # production build; type/lint errors are not ignored
```

### 6. E2E tests
```bash
E2E_EMAIL=<qa broker email> E2E_PASSWORD=<password> npm run test:e2e
```
- Projects: `iphone-webkit` (iPhone 13) and `android-chromium` (Pixel 7). The dev server starts automatically or is reused.
- Without the env vars, signed-in tests are skipped. **Never commit credentials.**
- Tests pin the browser device id to `web-e2e-playwright` (override with `E2E_DEVICE_ID`). A run binds the test account to that id, so reset the binding (BmWeb, or the local DB command in `docs/specs/device-binding-basic.md`) before logging in from your own browser.

## Repository map

| Path | What |
|---|---|
| `CONTEXT.md` | Domain glossary |
| `DESIGN.md` | Visual direction, tokens, UI rules |
| `docs/build-brief.md` | Product goals, MVP, success criteria |
| `docs/domain-model.md` | Entities, states, edge cases |
| `docs/technical-discovery.md` | Stack, proxy convention, auth, environments, testing |
| `docs/risks-and-open-questions.md` | Open risks and decisions |
| `docs/specs/<feature-id>.md` | One implementation spec per built feature |
| `feature_list.json` | Feature states: `not_started` → `in_progress` → `passing` → `accepted` |
| `src/app/api/bm/[...path]` | Backend proxy route |
| `src/lib/server/backend-proxy.ts` | Proxy and Broker endpoint allowlist |
| `src/lib/api/bm-fetch.ts` | Client helper: calls the proxy with the Firebase token |
| `src/components/auth/` | AuthProvider (access gate), guards, login form |
| `e2e/` | Playwright specs and fixtures |

## Secrets
Not in this repo and never to be committed: `.env.local`, Firebase service-account JSON, keystores, test credentials. The Firebase **web** config in `src/lib/firebase/config.ts` is public by design.
