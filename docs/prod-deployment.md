# PROD Deployment Runbook

Target: `https://powerweb.poweredbyadvisors.com`, hosted on **Vercel** like BmWeb (`app.poweredbyadvisors.com`). IONOS only holds the DNS. BmBackend PROD runs on the IONOS VPS `217.154.181.175` (`bm-backend-prod`, port 8081).

Tick each box, add the date, and note anything unexpected. Agents never deploy PROD; the user runs these steps.

## 0. Release gate

- [ ] `chore/prod-security-hardening` merged into `main` (Next 15.5.28: critical Image Optimization RCE fix; security headers; `shadcn` moved to devDependencies).
- [ ] On the release commit, with Node 22: `./init.sh`, `npm run build`, and the full `npm run test:e2e` with the QA account credentials (signed-in tests are skipped without them).
- [ ] Release commit recorded here: `________`. The previous PROD deployment stays available in Vercel for an instant rollback ("Promote" an older deployment).

Accepted risks at release (2026-11-02): `npm audit --omit=dev` reports `@grpc/grpc-js` (through Firebase Firestore, which the app does not use; Node-only) and `postcss` bundled inside Next (build-time only, on our own CSS). Premium report: no user is Premium until the PDF report is complete. Device-binding hardening: parked (see `docs/risks-and-open-questions.md`).

## 1. Vercel project

- [ ] In the Vercel team that hosts BmWeb: create the PROD project for PowerAppWeb (or add a Production environment to the QA project), Git branch `main`, framework Next.js.
- [ ] Settings → General → Node.js version: **22.x** (the test toolchain needs Node ≥ 20.19).
- [ ] Settings → Domains: add `powerweb.poweredbyadvisors.com`. Note the CNAME target Vercel shows: `________`.

## 2. Environment variables (Production)

`NEXT_PUBLIC_*` values are inlined at **build** time: set them before the first build, and redeploy after any change.

| Variable | Value |
|---|---|
| `BM_BACKEND_URL` | Same as BmWeb's PROD project (origin without `/api/v1`). Server-only. |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase console → Project settings → Your apps → web app |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | idem |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | idem |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | idem |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | idem |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | idem |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `powerweb.poweredbyadvisors.com` (not `*.firebaseapp.com`: iOS sign-in uses the `/__/auth` rewrite) |
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | Firebase → Cloud Messaging → Web Push certificates (empty = no notifications) |
| `NEXT_PUBLIC_ANALYTICS_ENABLED` | `true` (PROD only) |
| `NEXT_PUBLIC_ANALYTICS_DEBUG`, `NEXT_PUBLIC_E2E`, `NEXT_PUBLIC_E2E_POLL_INTERVAL_MS` | **not set** |

## 3. IONOS DNS (`poweredbyadvisors.com`)

Do this after step 1, so Vercel can issue the certificate as soon as DNS resolves.

- [ ] If IONOS refuses a CNAME on `powerweb`: Domains & SSL → `powerweb.poweredbyadvisors.com` → "Ajustar destino", unlink it from Webhosting (contract 52418514).
- [ ] Delete the `A` (217.160.0.52) and `AAAA` records for `powerweb`, and for `www.powerweb` (or point `www.powerweb` the same way).
- [ ] Add `CNAME powerweb` → the Vercel target from step 1.
- [ ] Keep the Mail records (MX, SPF TXT, DKIM CNAMEs, autodiscover).
- [ ] `dig +short powerweb.poweredbyadvisors.com` shows the Vercel target, and Vercel → Domains shows "Valid Configuration" with a certificate.

## 4. Firebase and Google Cloud

- [ ] Firebase → Authentication → Settings → Authorized domains: add `powerweb.poweredbyadvisors.com`.
- [ ] Google Cloud → APIs & Services → Credentials → the browser API key → HTTP referrers: add `https://powerweb.poweredbyadvisors.com/*`.
- [ ] Same page → the OAuth 2.0 web client: Authorized JavaScript origin `https://powerweb.poweredbyadvisors.com`; Authorized redirect URI `https://powerweb.poweredbyadvisors.com/__/auth/handler`.

## 5. Backend PROD prerequisites

- [ ] `bm-backend-prod` includes bill photo extraction (#64), `V14__web_push_tokens` and the web push multicast sender (the same set QA had for the 2026-10-22 checks).
- [ ] PROD n8n (`bm-n8n-prod`) has the current consumption workflow and the Total.es credential.

## 6. Smoke test after deployment

- [ ] `curl -s -H "Authorization: Bearer x" https://powerweb.poweredbyadvisors.com/api/bm/user-data` returns the backend's 401.
- [ ] `curl -sI https://powerweb.poweredbyadvisors.com` shows `strict-transport-security`, `x-frame-options: SAMEORIGIN`, `x-content-type-options: nosniff`.
- [ ] `http://` redirects to `https://`.
- [ ] Google and email sign-in on iPhone (Safari + installed PWA) and Android Chrome.
- [ ] One CUPS study, one bill PDF study and one bill photo study each reach the report.
- [ ] Comparator: proposals table, then "Crear informe" shares the Basic PDF.
- [ ] PWA install on Android and iPhone; the CUPS camera opens (checks the `Permissions-Policy` header).
- [ ] Notifications enabled, then a price change triggered from BmWeb arrives as "Tarifas actualizadas".
- [ ] Firebase Analytics shows `screen_view` events from PROD (Realtime view).

## 7. Follow-ups (not blocking this release)

- HTTPS for the PROD API (e.g. `api.poweredbyadvisors.com` with certbot, like `api.qa`), so `BM_BACKEND_URL` traffic from Vercel is encrypted. Applies to BmWeb too.
- Content-Security-Policy beyond `frame-ancestors` (needs care with Firebase and Google sign-in).
- Firebase SDK update (clears the `@grpc/grpc-js` finding).
- BmWeb: run `npm audit` for the same Next.js advisory.
