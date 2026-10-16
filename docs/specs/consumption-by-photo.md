# Feature Implementation Spec: Request consumption by bill photo

## Source Feature

- `id`: consumption-by-photo
- `area`: consumption
- `depends_on`: backend-bill-photo-extraction (`accepted`)
- `status`: not_started at planning time (2026-10-16)
- `verification` (feature_list): "Photo from iPhone camera produces report"

## Goal

On `/fetch-consumption`, a signed-in Broker can take a photo of a paper bill, or pick an existing JPEG/PNG image. The app uploads it as multipart `file` to `fetch-user-consumption-report`. Since `backend-bill-photo-extraction`, that endpoint accepts `.jpg/.jpeg/.png` with the same 202 job contract. The existing Consumption Job runner then takes over: poll → result → publish → `/current-conditions`. Resume, restore, refresh, retry, reset and logout behave as for PDF jobs.

## Non-Goals

- Any BmBackend change. Extraction quality belongs to the backend's DoclingBillReader.
- Client-side resize, compression, rotation or HEIC conversion. The backend already downscales to a 2000 px long edge.
- An in-app camera viewfinder (`getUserMedia`) for photos. Use the native picker/camera via `<input type="file">`.
- Multi-page or multi-photo upload, cropping, preview, progress percentage.
- Changing the CUPS, scanner or PDF flows beyond the shared plumbing below.
- Committing real bill photos (personal data). E2E uses tiny in-memory buffers only.

## Job Story

When the customer only has a paper bill,
I want to photograph it from the app,
so I get their real consumption without typing the CUPS or finding a PDF.

## Users And Permissions

Granted Broker, same as PDF. The backend enforces the grant and the job owner; 401/403 → forced logout via `useBmFetch`.

## Decisions (planner, 2026-10-16)

1. **Layout.** Add a third method row under the PDF row, built like `PdfUploadOption`:
   - `CameraIcon`, title "Foto de la factura", subtitle "Haz una foto o elige una imagen", chevron.
   - Hidden `<input type="file" accept="image/jpeg,image/png">` with **no** `capture` attribute. iOS Safari and Android Chrome then offer both camera and library.
   - Listing only JPEG/PNG in `accept` makes iOS Safari convert HEIC camera shots to JPEG. Verify this manually.
   - Picking a file starts the study at once (PDF parity).
   - BmApp has no photo method; this is a web-only addition, approved by build-brief MVP item 2.
2. **Client checks** (new pure helpers in `bill-file.ts`):
   - `checkBillPhoto(file) → "ok" | "NOT_IMAGE" | "TOO_LARGE"`.
   - "ok" when `type` is `image/jpeg` or `image/png`, or when `type` is empty and the name ends in `.jpg/.jpeg/.png` (any case).
   - `.heic`, `image/heic`, gif, pdf and the like → `NOT_IMAGE` = "Selecciona una foto JPG o PNG."
   - Over `MAX_BILL_BYTES` (50 MB) → the existing `PDF_TOO_LARGE` text. Rename it to `BILL_TOO_LARGE` and keep the same string.
   - In every failing case no request is sent.
3. **Upload name.** `photoUploadName(file)`: keep `file.name` when it ends in `.jpg/.jpeg/.png`. Otherwise use `factura.jpg` for `image/jpeg` and `factura.png` for `image/png`. The backend picks the type from the extension and rejects anything else with 400.
4. **Submission.**
   - `StudySubmission` gains `{ kind: "photo"; file: File }`.
   - `runStudy` builds the same `FormData` part `file`, using `photoUploadName`, to the same path.
   - First step is `UPLOADING_BILL` ("Subiendo factura..."). No new step string.
   - Failures map exactly as for PDF (non-202, including 400 "Invalid image file" → `SUBMIT_FAILED`).
5. **Storage.**
   - `JobSource` becomes `"cups" | "pdf" | "photo"`.
   - `loadActiveJob` keeps `"photo"` (today it maps every unknown value to `cups`; fix that).
   - Resume never re-uploads.
6. **Retry.**
   - Generalise `lastPdf` to `lastFile`, which holds the `File` of the current pdf/photo study.
   - "Reintentar" re-uploads the same photo in memory.
   - No retry for a resumed photo failure (file not in memory) or for a local check error, as with PDF.
   - Failed state: `source: "photo"`, `cups: ""`.

## Acceptance Scenarios

### Scenario 1: Option visible
Given the Broker is on `/fetch-consumption`
Then below "Subir factura PDF" there is a control named "Foto de la factura" with the subtitle "Haz una foto o elige una imagen".
It is at least 44 px tall and keyboard-reachable. Its file input has `accept` `image/jpeg,image/png` and no `capture` attribute.

### Scenario 2: Happy path
Given a JPEG is chosen
Then POST `/api/bm/fetch-user-consumption-report` is sent as `multipart/form-data` with one `file` part whose filename ends in `.jpg/.jpeg/.png`.
Progress shows "Subiendo factura..." → queue/processing → "Obteniendo resultados...".
On COMPLETED the app lands on `/current-conditions` with the summary.
For a PNG, and for a file with an empty name or extension, the generated name is `factura.png` or `factura.jpg`.

### Scenario 3: Rejected locally
Given the Broker picks `factura.heic` (`image/heic`), `factura.pdf` through this option, or an image over 50 MB
Then no request is sent, the matching message appears in `role="alert"`, the form stays usable, and there is no "Reintentar".

### Scenario 4: Failures and retry
Given submit returns 400 or 500, or the job ends FAILED or times out
Then the shared Spanish failure message shows with "Reintentar".
Retry re-uploads the same photo (same filename) without opening the picker.
`bm.activeJob` is cleared and the CUPS field is empty.

### Scenario 5: Resume / restore / refresh
Given a photo job is polling, when the page reloads, then polling continues on the same jobId with no upload, and `bm.activeJob.source === "photo"`.
Restore and the silent refresh of a completed study behave as for any source.

### Scenario 6: Reset and logout
"Nuevo estudio" or logout during a photo job stops polling and clears `bm.activeJob` and `bm.lastCompletedJobId`.

### Scenario 7: Other methods unaffected
All consumption E2E specs (cups, pdf, errors, camera) stay green. Only update the cups assertion `getByText(/Foto/i)).toHaveCount(0)` so it now expects the photo option.

### Scenario 8: Real photo (manual, required by feature verification)
Setup: local QA with `backend-qa` built from the BmBackend checkout that contains `backend-bill-photo-extraction`, plus Docling and n8n (`../BmInfra/bm-local-qa ready`).
On the iPhone 17 Simulator Safari, or a real phone via `adb reverse` / Simulator camera roll, photograph or pick a photo of a real paper bill page that shows the CUPS. It must reach `/current-conditions` with a plausible summary.
Record the device, the time, and the CUPS (masked).
Also confirm that an iPhone HEIC camera shot arrives as JPEG (request filename/type in the network log or the backend log).
A real iPhone camera check, if not possible now, goes to `qa-real-device-checks` (add it there) with explicit user agreement.

## Repository Research

### Files Inspected
- `feature_list.json`, `PROGRESS.md`, `docs/specs/consumption-by-pdf.md`
- `src/lib/consumption/bill-file.ts` (+ test), `study.ts` (submission union, `PDF_SUBMIT_PATH`, `billUploadName`), `messages.ts` (`UPLOADING_BILL`, `PDF_NOT_PDF`, `PDF_TOO_LARGE`)
- `src/lib/gate/storage.ts` (`JobSource = "cups" | "pdf"`; load maps non-"pdf" to cups)
- `src/components/consumption/consumption-study-provider.tsx` (`startPdf`, `lastPdf`, `canRetry`, `retry`)
- `src/components/consumption/pdf-upload-option.tsx`, `src/app/(app)/fetch-consumption/page.tsx` (`fileError` shared alert)
- `e2e/consumption-cups.spec.ts:86-92`, `e2e/consumption-pdf.spec.ts`, `e2e/consumption-errors.spec.ts`
- `../BmBackend/src/main/kotlin/com/bm/backend/models/ConsumptionUploadType.kt` (extension-based pdf/jpg/jpeg/png); `routes/UserConsumptionRoutes.kt:95-140` (magic-byte check → 400 "Invalid image file")
- `docs/technical-discovery.md:25`, `docs/domain-model.md:31-35`, `CONTEXT.md:24`
- Not inspected: proxy code. It already forwards multipart unchanged, which the PDF feature tested.

### Patterns To Follow
- All calls go through `useBmFetch`/`runStudy`. Method rows copy the `PdfUploadOption` markup and tokens. Use a single shared error alert (`fileError ?? studyError`).
- E2E: `page.route` mocks plus the real signed-in session, with `setInputFiles({name, mimeType, buffer})`.

### Risks
- **Backend not on `qa` yet.** `backend-bill-photo-extraction` is uncommitted on BmBackend `feature/backend-bill-photo-extraction`. Against a backend without it, uploads return 400 → `SUBMIT_FAILED`. Scenario 8 needs local QA built from that checkout. Remote QA needs the branch merged to `qa`, which is the user's call. Record this in evidence.
- iOS HEIC → JPEG conversion depends on `accept`. If Safari still sends HEIC, the local check rejects it with a clear message; record the finding.
- Large camera photos (3–12 MB) on mobile data: upload time sits inside "Subiendo factura..."; no timeout applies to submit.
- Playwright WebKit does not expose multipart bytes, so assert the filename on Chromium only (PDF precedent).

## Technical Approach
- `messages.ts`: add `PHOTO_NOT_IMAGE`. Rename `PDF_TOO_LARGE` → `BILL_TOO_LARGE` and update its users.
- `bill-file.ts`: `checkBillPhoto`, `photoUploadName`, with tests.
- `study.ts`: union member `photo`. Pick the name with `sub.kind === "pdf" ? billUploadName : photoUploadName`.
- `storage.ts`: `JobSource` adds `"photo"`. Load becomes `["pdf","photo"].includes(v.source) ? v.source : "cups"`.
- Provider: `startPhoto(file)`. Rename `lastPdf` → `lastFile`. `retry` dispatches on `state.source`.
- `src/components/consumption/photo-upload-option.tsx` (new). Optionally extract a shared `FileMethodOption` used by both PDF and photo; keep the PDF behaviour identical.
- `page.tsx`: render `PhotoUploadOption` after `PdfUploadOption`, using the same `setFileError`/`startPhoto` wiring.

## Expected File Changes
- modify: `src/lib/consumption/{messages,bill-file,bill-file.test,study,study.test}.ts`, `src/lib/gate/storage.ts` (+ test), `src/components/consumption/consumption-study-provider.tsx` (+ test), `pdf-upload-option.tsx` (message rename only, or refactor to shared row), `src/app/(app)/fetch-consumption/page.tsx`, `e2e/consumption-cups.spec.ts` (one assertion)
- create: `src/components/consumption/photo-upload-option.tsx` (+ component test), `e2e/consumption-photo.spec.ts`

## Visual Design Impact
UI: yes. Source: `DESIGN.md` plus the existing method rows. Check these at 390 px, light and dark: the method list with 3 options plus the scanner; the local image error; the running state; a failed photo study with Reintentar.

## Durable Documentation Impact
- `ARCHITECTURE.md` / `CONSTRAINTS.md`: not needed. Neither exists, and there is no new boundary.
- `AGENTS.md`, `README.md`: not needed.
- `docs/domain-model.md`: update.
  - Photo source: JPEG/PNG, extension-based name, 50 MB, `bm.activeJob.source = "photo"`.
  - Mark photo as a web-only method (no BmApp equivalent).
- `docs/risks-and-open-questions.md`: update.
  - iOS HEIC handling result.
  - Backend photo support pending merge to the `qa` branch.

## Implementation Plan / Tasks
- [ ] 1. `bill-file` photo helpers + tests (jpeg/png/empty type with extension/heic/pdf/size boundary; names).
- [ ] 2. `runStudy` photo submission + tests (filename, `UPLOADING_BILL` first, 400 → SUBMIT_FAILED).
- [ ] 3. Storage `photo` source + backward-compat tests.
- [ ] 4. Provider `startPhoto`, `lastFile`, retry + tests (retry re-uploads same File; resumed photo failure has no retry; resume does not upload).
- [ ] 5. `PhotoUploadOption` + page wiring + component test (accept, no capture, local errors call no `onSelect`).
- [ ] 6. `e2e/consumption-photo.spec.ts` covering Scenarios 1–6. Update the cups assertion.
- [ ] 7. Manual Scenario 8, screenshots, docs, `feature_list.json` evidence, `PROGRESS.md`.

## Verification Plan
- `./init.sh` green; `npm run build` OK.
- `npm run test:e2e` with Keychain QA credentials: all specs pass on android-chromium and iphone-webkit.
- Manual Scenario 8 on local QA (backend from the photo branch) plus the HEIC→JPEG observation on iOS.
- Screenshots of the states in Visual Design Impact.

## Evidence To Capture
Unit test count, build, E2E counts per project, Scenario 8 device/time/result (or PENDING + reason + user agreement), HEIC observation, screenshot paths. Record them in `feature_list.json` evidence and in a `PROGRESS.md` session.

## Validator Checklist
- [ ] Multipart part `file` with a `.jpg/.jpeg/.png` name; same path and job pipeline; "Subiendo factura..." first.
- [ ] HEIC/non-image/>50 MB rejected locally with no request; `accept` is JPEG/PNG; no `capture`.
- [ ] Resume does not re-upload; `source: "photo"` persists across reload; retry re-uploads the in-memory photo only.
- [ ] PDF/CUPS/scanner E2E still green; new photo E2E added; mobile screenshots reviewed.
- [ ] No backend changes, no client image processing, no real photos committed.
- [ ] Scenario 8 evidence or explicit waiver; docs, `feature_list.json`, `PROGRESS.md` updated.
