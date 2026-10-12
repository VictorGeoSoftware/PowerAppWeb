# Feature Implementation Spec: Server-side proxy to BmBackend QA

## Source Feature

- `id`: backend-proxy
- `area`: platform
- `depends_on`: bootstrap-nextjs-app (accepted)
- `status`: in_progress
- `source`: `feature_list.json`

## Goal

The browser calls same-origin `/api/bm/<path>`, and a Next.js route handler forwards the call to `${BM_BACKEND_URL}/api/v1/<path>` with the caller's Bearer token. This avoids mixed content (the backend is plain HTTP on a bare IP) and CORS. The proxy is a dumb pipe: the status, body and content type come back unchanged, including binary PDFs and multipart uploads.

## Non-Goals

- Firebase login and token acquisition (`login-email`). Callers supply the token.
- A typed API client per endpoint. Each feature adds its own client functions.
- Device-id headers (`device-binding-basic`).
- Retries, caching and rate limiting.

## Acceptance Scenarios

### Scenario 1: Forwarding
Given a GET to `/api/bm/price-table-results?x=1` with `Authorization: Bearer T`
Then the backend receives GET `${BM_BACKEND_URL}/api/v1/price-table-results?x=1` with `Authorization: Bearer T`
And the client receives the backend's status, body and `content-type` unchanged.

### Scenario 2: Missing token
Given no `Authorization: Bearer …` header
Then the response is 401 `{"success":false,"message":"Missing Authorization header"}` and the backend is not called.

### Scenario 3: Not allowlisted
Given a path outside the Broker allowlist (for example `admin/...`)
Then the response is 404 and the backend is not called.

### Scenario 4: Backend unreachable
Given fetch throws
Then the response is 502 `{"success":false,"message":"Backend unavailable"}`.

### Scenario 5: Bodies
A POST body (JSON or multipart) is forwarded byte for byte with its `content-type`. Binary responses (PDF) stay intact.

## Repository Research

- `../BmWeb/src/app/api/collected-prices/route.ts` and `src/lib/backend-auth.ts`: pattern with `BM_BACKEND_URL`, the Bearer check and a 401 body. BmWeb writes one handler per endpoint. Here a single catch-all with an allowlist is used instead, because the proxy only passes requests through.
- `../BmApp/data/src/main/.../network/PriceTableApi.kt` and `AuthApi.kt`: the endpoint list. BmApp only sends `Authorization` and `Content-Type` headers.
- `../BmApp/data/build.gradle.kts`: the QA URL is `http://217.154.181.175:9081/api/v1`.
- Network: QA is **blocked from this corporate Mac** (Volvo proxy returns "Application Blocked"). Live checks must run from a non-corporate network.

## Technical Approach

- `src/lib/server/backend-proxy.ts` exports `proxyToBackend(request, pathSegments)`:
  - Allowlist of first path segments: `price-table-results`, `fetch-user-consumption-report`, `fetch-user-consumption-report-by-cups`, `consumption-report-status`, `consumption-report-result`, `consumption-report-refresh`, `reports`, `collected-prices`, `user-data`, `user-activity`, `auth`.
  - Reject any segment that is `..` or empty.
  - Forward the `authorization`, `content-type`, `accept` and `x-request-id` headers.
  - Forward the body as an `ArrayBuffer` for non-GET/HEAD methods.
  - Use `cache: "no-store"` and `redirect: "manual"`.
  - Return `new Response(upstream.body, { status, headers: content-type, content-disposition, x-request-id })`.
- `src/lib/server/env.ts` exports `backendBaseUrl()`, which reads `BM_BACKEND_URL` (server-only). It throws when the value is missing (no built-in default, in any environment).
- `src/app/api/bm/[...path]/route.ts`: GET, POST, PUT and DELETE delegate to the proxy. Set `runtime = "nodejs"` and `dynamic = "force-dynamic"`.
- `.env.example` documents `BM_BACKEND_URL=http://217.154.181.175:9081`.

## Expected File Changes

- `src/lib/server/backend-proxy.ts`, `src/lib/server/env.ts`: create
- `src/lib/server/backend-proxy.test.ts`: create (node environment, mocked `fetch`)
- `src/app/api/bm/[...path]/route.ts`: create
- `.env.example`: create. `.gitignore` already ignores `.env*`, so add an exception `!.env.example`.
- `docs/technical-discovery.md`: document the proxy path convention

## Durable Documentation Impact

- `AGENTS.md`: not needed.
- `docs/technical-discovery.md`: update. The client calls `/api/bm/*` only and never the backend directly. The allowlist must be extended when a feature adds an endpoint.

## Verification Plan

- `./init.sh`: unit tests for scenarios 1–5.
- `npm run build`.
- With the dev server running: `curl -i localhost:9003/api/bm/price-table-results` returns 401, and `curl -i -H "Authorization: Bearer x" localhost:9003/api/bm/admin/x` returns 404.
- Live QA call (`Bearer x` → backend 401): run from a non-corporate network. **Pending** on this Mac because of the Volvo block.

## Validator Checklist

- [ ] Only allowlisted paths are reachable. No path traversal.
- [ ] Binary bodies are passed through.
- [ ] `BM_BACKEND_URL` is not exposed to the client (no `NEXT_PUBLIC_` prefix).
- [ ] Evidence recorded, including the network caveat.
