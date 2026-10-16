# Feature Implementation Spec: Live in-browser CUPS camera OCR

## Source Feature

- `id`: cups-camera-ocr
- `area`: consumption
- `depends_on`: consumption-by-cups-manual (accepted)
- `status`: not_started (at planning time, 2026-10-16)
- `source`: `feature_list.json`
- `notes`: "Research spike first; risk documented."
- Revised 2026-10-16 (user-approved): spike gate on Android Chrome only via USB `adb reverse`; iOS Safari accuracy deferred to `qa-real-device-checks`; spike is implementer step 1 with dev-only test page + JSONL scan log.

## Goal

Add BmApp's "Escanear código CUPS" method to `/fetch-consumption`: the Broker opens the rear camera, the browser runs OCR on frames, and the first valid CUPS found (BmApp `CupsCodeParser.extractBestCandidate` rules) fills an editable field. The Broker confirms and the normal CUPS study starts (`startCups`). If the camera is unavailable, denied or OCR never finds a code, the Broker can type the code in the same view or close it and use the inline manual form. The feature starts with a time-boxed accuracy spike (Step 1) on Android Chrome with real bills; its result decides whether the full feature (Step 2) is built.

## Non-Goals

- Photo upload of the bill (`backend-bill-photo-extraction`, `consumption-by-photo`).
- Analytics events (`CupsScanStarted/Succeeded/Failed`) — `analytics-screen-tracking`. Leave a code comment where they go.
- Any change to the study/polling provider, backend, or the inline `CupsForm` behavior.
- Torch/zoom/focus controls, camera switching, or desktop webcams tuning.
- PWA/offline caching of OCR assets (`pwa-installable`).

## Job Story

When I have a paper bill in front of a client,
I want to point my phone at the CUPS and have it read for me,
so I can start the study without typing 20–22 characters.

## Users And Permissions

- Signed-in, granted Broker on a Bound Device who passed the fee-first gate (existing `(app)` guards). Camera needs a secure context (HTTPS or localhost) and the browser permission prompt.

## Acceptance Scenarios

### Scenario 1: Method row
Given `/fetch-consumption` idle or failed
Then under "ELIGE UN MÉTODO" there is a method row "Escanear código CUPS" / "Usa la cámara para leer el código" (BmApp strings), same style as the PDF row, placed between the CUPS form and the PDF row (BmApp order: scan before upload). It is not shown while a study runs.

### Scenario 2: Happy path
Given camera permission is granted
When the Broker taps the row
Then a full-screen scanner opens with title "Escanear CUPS", a "Volver" button, the live rear-camera preview with a guide frame, and a bottom panel "Escanea o introduce tu código CUPS" with an editable CUPS field (same validation help as `CupsForm`) and "Confirmar" (disabled until valid)
When OCR finds a valid CUPS
Then the field is filled with it (corrected form) and shows "Formato válido"
When the Broker taps "Confirmar"
Then the camera stops, the scanner closes, and `startCups(toSubmittableCups(value))` runs (study progress shows as today).

### Scenario 3: Manual edit wins
Given the scanner is open
When the Broker types in the field (non-empty)
Then later OCR results never overwrite it (BmApp `wasEditedManually`); clearing the field re-enables OCR fill.

### Scenario 4: Permission denied / no camera / insecure context
Given `getUserMedia` is missing or rejects (`NotAllowedError`, `NotFoundError`, `NotReadableError`, `OverconstrainedError`, or no `navigator.mediaDevices`)
Then the preview area shows "No podemos usar la cámara. Introduce el CUPS a mano o revisa los permisos del navegador." plus a "Reintentar cámara" button; the field and "Confirmar" keep working, so typing a valid CUPS and confirming starts the study.

### Scenario 5: OCR engine fails to load
Given the OCR worker/assets fail to load
Then the preview keeps running, the panel shows "No se pudo iniciar el lector. Introduce el CUPS a mano." and manual entry still works.

### Scenario 6: Leaving the scanner
When the Broker taps "Volver", presses Escape/back, or the scanner unmounts (logout, navigation)
Then all `MediaStreamTrack`s are stopped (camera indicator off), the OCR loop stops, the worker is terminated, and the page returns to the method list with nothing submitted.

### Scenario 7: Tab hidden
When the page becomes hidden while scanning
Then the OCR loop pauses; it resumes when visible (iOS may also end the track — then show Scenario 4 with "Reintentar cámara").

### Scenario 8 (spike gate, manual, Android Chrome only)
Given the dev server running locally and an Android phone on USB with `adb reverse tcp:<port> tcp:<port>` (user-approved command uses 3000; the repo's `npm run dev` listens on 9003 — reverse the port the dev server actually uses, e.g. `npm run dev -- -p 3000` or `adb reverse tcp:9003 tcp:9003`). `http://localhost:<port>` on the phone is a secure context, so no HTTPS/tunnel is needed.
When the user scans ≥5 real paper bills from ≥2 retailers, including one 22-char CUPS, on the dev-only test page
Then each attempt is appended to the JSONL log, and the gate passes only if ≥80% of bills are detected within 10 s and there are **zero false-valid codes** (valid-format CUPS that differs from the bill). If the gate fails, the implementer stops after Step 1 and reports to the user (options: keep behind a flag, or drop and rely on photo upload).

### Scenario 9: dev-only spike tooling absent in production
Given a production build (`NODE_ENV=production`, `npm run build && npm start`)
Then the scanner test page returns 404 and the scan-log endpoint returns 404 without writing any file.

## Repository Research

### Files Inspected

- `src/app/(app)/fetch-consumption/page.tsx` — method list, `startCups`, error wiring.
- `src/components/consumption/cups-form.tsx` — inline form, help strings, input attributes to reuse.
- `src/components/consumption/pdf-upload-option.tsx` — method-row style (`rounded-xl bg-card p-3.5`, icon + chevron).
- `src/lib/consumption/cups.ts` (+ test) — port of `normalize`, `fixOcrErrors`, `isValidCups`; header says candidate extraction is left for this feature.
- `../BmApp/.../scanner/CupsScannerView.kt`, `CupsCodeParser.kt` — scanner UX, strings, `candidateRegex`, `tryTrimToValid`, `extractBestCandidate`.
- `../BmApp/.../values-es/strings.xml` — row title/subtitle.
- `e2e/consumption-cups.spec.ts` — test "CUPS and PDF methods only" must be updated.
- `docs/risks-and-open-questions.md`, `docs/technical-discovery.md` — Tesseract.js suggestion, spike research task, HTTPS requirement.
- `package.json`, `next.config.ts` — no OCR dependency yet; no CSP headers configured.

### Existing Patterns To Follow

- Pure logic in `src/lib/consumption/*` with Vitest tests; UI in `src/components/consumption/*`.
- shadcn components + token utilities only (DESIGN.md); touch targets ≥44px, inputs 16px.
- Spanish copy constants exported from the component or `messages.ts` so tests import them.

### Current Gaps

- No OCR library. No camera code. Dev server is HTTP on :9003. A phone on LAN IP is not a secure context, but via `adb reverse` it loads `localhost`, which is — so Android spike needs no HTTPS. iOS has no equivalent; iOS accuracy is deferred to QA (HTTPS deployment).

## Technical Approach

1. **Parser** — add to `cups.ts`: `CANDIDATE_REGEX = /ES[\s\-.,:;/|A-Z0-9]{18,28}/g`, private `tryTrimToValid` (fixed → valid; else trim to 22 then 20), and `extractBestCandidate(text): string | null` (two passes exactly as BmApp: uppercase text, then `normalize(text)`). Returns the corrected code.
2. **OCR engine** — add `tesseract.js` (v5+, Apache-2.0) as a dependency, loaded only via dynamic `import()` when the scanner opens (keeps the main bundle unchanged). Wrapper `src/lib/consumption/cups-ocr.ts`: `createCupsRecognizer(): Promise<{ recognize(canvas): Promise<string>; terminate(): Promise<void> }>` using `createWorker("eng")`, params `tessedit_char_whitelist = "ES0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"`, `tessedit_pageseg_mode = SINGLE_BLOCK`. Use the library's default CDN for worker/core/lang data in this feature; self-hosting is a `pwa-installable` concern (record as a risk).
3. **Camera hook** — `src/components/consumption/use-camera-stream.ts`: `getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })`; states `starting | live | error(kind)`; `retry()`; stops all tracks on unmount and on `track.onended` → error. Video element: `playsInline muted autoPlay` (required on iOS).
4. **Scan loop** — in the scanner component: every ~600 ms while live, visible and no recognize in flight, draw the guide-frame region (center band ~90% width × 25% height of the video's intrinsic size) to an offscreen canvas, grayscale, upscale so width ≥ 1000 px, `recognize`, then `extractBestCandidate`. On a hit and `!editedManually` set the field. Skip-if-busy = BmApp `KEEP_ONLY_LATEST`. Keep scanning after a hit (BmApp does) so a better read can replace it until the Broker edits.
5. **UI** — `CupsScannerOption` (method row button, `ScanLineIcon`) toggles `CupsScanner`, rendered as a full-screen fixed overlay (`fixed inset-0 z-50 bg-background`, `role="dialog" aria-modal aria-labelledby`), header row Volver / "Escanear CUPS" / no top Confirmar (single Confirmar in panel to avoid duplication), preview `object-cover` with guide frame border `border-primary`, bottom panel `bg-card` with the field. Reuse `CUPS_HELP_*` from `cups-form.tsx`. Escape closes. No new route: keeps provider state and avoids back-stack work.
6. **Page wiring** — `page.tsx` renders `<CupsScannerOption onConfirm={(c) => { setFileError(null); startCups(c); }} />` between `CupsForm` and `PdfUploadOption`.
7. **Spike tooling (Step 1, dev-only)** —
   - Page `src/app/dev/cups-scan/page.tsx` (outside `(app)` guards, no auth needed): calls `notFound()` when `process.env.NODE_ENV === "production"`; renders `CupsScanner` (or a bare version during the spike) with a bill label input; on each OCR result or 10 s timeout per attempt, POSTs to the log endpoint.
   - Route handler `src/app/api/dev/cups-scan-log/route.ts` (`runtime = "nodejs"`): returns 404 in production before touching the filesystem; otherwise validates the body and appends one JSON line to `.dev-logs/cups-scan.jsonl` (create dir if missing). Record fields: `ts` (ISO), `userAgent`, `billLabel`, `timeToResultMs` (null on timeout), `rawOcrText`, `pickedCups` (null if none), `valid` (boolean, `isValidCups`). Cap body size (~20 KB).
   - Add `/.dev-logs/` to `.gitignore`. The agent monitors live with `tail -f .dev-logs/cups-scan.jsonl` while the user scans, and later summarizes the per-bill table into PROGRESS.md (user confirms which picked codes match the paper bill to count false-valids).
8. **Test seam** — the scanner takes an optional `createRecognizer` prop (default: dynamic import of `cups-ocr.ts`) so unit tests inject a fake; no global test hooks in production code.

## Expected File Changes

- `package.json`, `package-lock.json` — modify; add `tesseract.js`.
- `src/lib/consumption/cups.ts` / `cups.test.ts` — modify; `extractBestCandidate` + tests ported from BmApp cases (noisy text, separators, trailing "TARIFA", 22-char, look-alikes, none).
- `src/lib/consumption/cups-ocr.ts` — create; Tesseract wrapper (not unit-tested beyond a type-level smoke).
- `src/components/consumption/use-camera-stream.ts` — create.
- `src/components/consumption/cups-scanner.tsx` (+ `cups-scanner.test.tsx`) — create; overlay, loop, field, states.
- `src/components/consumption/cups-scanner-option.tsx` — create; method row + open state.
- `src/app/(app)/fetch-consumption/page.tsx` — modify; add the row; update doc comment.
- `e2e/consumption-cups.spec.ts` — modify method assertion; `e2e/consumption-camera.spec.ts` — create.
- `src/app/dev/cups-scan/page.tsx` — create (dev-only spike page).
- `src/app/api/dev/cups-scan-log/route.ts` (+ unit test for production 404 and JSONL append) — create.
- `.gitignore` — modify; add `/.dev-logs/`.
- `feature_list.json` — `qa-real-device-checks` already carries the deferred iOS spike item (added at planning).
- `docs/risks-and-open-questions.md`, `docs/domain-model.md`/`CONTEXT.md` (only if wording on methods changes), `PROGRESS.md`, `feature_list.json`.

## Visual Design Impact

- UI involved: yes. Source: `DESIGN.md` + BmApp `CupsScannerView` layout/strings.
- States: method row; scanner starting (spinner "Abriendo cámara…"), live (guide frame), OCR loading ("Preparando lector…" small text in panel), code found (field filled, "Formato válido"), camera error, OCR error; light + dark.
- New design artifact required: no.

## Durable Documentation Impact

- `ARCHITECTURE.md`: not needed — no new layer; client-only component + lib.
- `CONSTRAINTS.md`: not needed unless it exists; camera HTTPS rule already in technical-discovery.
- `AGENTS.md`: not needed.
- `docs/risks-and-open-questions.md`: update — replace spike research task with Android spike results; add accepted risk "iOS Safari OCR accuracy unverified until QA", CDN dependency of OCR assets, iOS track-ending behavior.
- `docs/technical-discovery.md`: update — Tesseract.js chosen; Android device testing via `adb reverse` (localhost secure context).
- `README.md`: update — short note on the dev-only spike page and `adb reverse` flow.

## Accepted Risks

- **iOS Safari accuracy unverified at acceptance.** The gate runs on Android Chrome only. iOS is re-checked in `qa-real-device-checks` (same bills, same thresholds) against the QA HTTPS build. If it fails there, `cups-camera-ocr` reopens. Meanwhile Brokers on iOS still have manual entry in the scanner and the inline `CupsForm`. Unit + WebKit E2E still cover iOS non-OCR paths (permission denied, manual confirm, cleanup).

## Implementation Plan

1. **Step 1 — spike (≤ half a day):** parser port + tests, `tesseract.js` + `cups-ocr.ts`, bare scanner, dev-only page + log endpoint + `.gitignore`. Hand off to the user with the exact commands (`npm run dev`, `adb reverse ...`, URL `http://localhost:<port>/dev/cups-scan`); `tail -f` the log while they scan. Summarize results in PROGRESS.md. **Stop and report if the gate fails**; continue only if it passes.
2. **Step 2 — full feature:** scanner states, option row, page wiring (the dev page may keep reusing `CupsScanner`).
3. Unit tests, E2E, docs, evidence; confirm Scenario 9 on a production build.

## Implementation Tasks

- [ ] Port `extractBestCandidate`/`tryTrimToValid` + tests.
- [ ] Add `tesseract.js`; write `cups-ocr.ts`.
- [ ] Dev-only `/dev/cups-scan` page + `/api/dev/cups-scan-log` JSONL endpoint (404 in production) + `.gitignore`.
- [ ] Run Android spike with the user; record gate result. Stop here if it fails.
- [ ] Write `use-camera-stream.ts` with cleanup and error kinds.
- [ ] Write `cups-scanner.tsx` (loop, visibility pause, manual-edit lock, Escape, cleanup).
- [ ] Write `cups-scanner-option.tsx`; wire into `page.tsx`.
- [ ] Unit tests: fake recognizer fills field; manual edit blocks fill; confirm calls `onConfirm` with corrected code and stops tracks; getUserMedia rejection shows error + manual confirm works; recognizer load failure message.
- [ ] E2E `consumption-camera.spec.ts` (both projects): row visible; with `navigator.mediaDevices.getUserMedia` overridden via `addInitScript` to reject `NotAllowedError` → error text shown, typing a valid CUPS + Confirmar reaches study progress (job endpoints mocked as in `consumption-cups.spec.ts`); Volver closes with nothing submitted. Update the "methods" test in `consumption-cups.spec.ts`.
- [ ] Docs; PROGRESS/feature_list evidence.

## Verification Plan

- `./init.sh` (lint, typecheck, unit tests) passes; `npm run build` passes and the main `/fetch-consumption` chunk does not include tesseract (dynamic import).
- `npm run test:e2e` (with `E2E_EMAIL`/`E2E_PASSWORD`) passes on `iphone-webkit` and `android-chromium`. Live OCR is not E2E-tested (no real camera); covered by unit tests with a fake recognizer plus the manual spike.
- Manual: Scenario 8 on Android Chrome via `adb reverse` (gate); Scenario 4 by denying permission on Android; Scenario 6 confirm the camera indicator turns off. Mobile viewport screenshots light/dark of the scanner. iOS Safari accuracy is NOT required for acceptance (deferred to `qa-real-device-checks`).
- Scenario 9: `npm run build && npm start`, then `curl -i` the dev page and `curl -i -X POST` the log endpoint → both 404, and no `.dev-logs/` write.

## Evidence To Capture

- Spike table (bill, retailer, length, found, seconds, false-valid) in PROGRESS.md, derived from `.dev-logs/cups-scan.jsonl` (log itself not committed).
- Scenario 9 curl output.
- Test counts from `./init.sh` and E2E; build output note on chunking.
- Screenshots of row, live scanner, error state.

## Validator Checklist

- [ ] Scope limited to scanner + parser + row; provider/backend unchanged.
- [ ] Parser matches BmApp rules (regex, trim 22→20, two passes) with tests.
- [ ] Camera tracks stopped and worker terminated on every exit path.
- [ ] Denied/unavailable camera falls back to manual entry in the scanner.
- [ ] Android spike gate met and recorded (or the user explicitly accepted the result); iOS deferral recorded as accepted risk and present in `qa-real-device-checks`.
- [ ] Dev page and log endpoint return 404 in production; `.dev-logs/` gitignored; no log file committed.
- [ ] E2E added/updated and passing; `feature_list.json` and `PROGRESS.md` updated.
