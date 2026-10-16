# Feature Implementation Spec: Backend accepts bill photo for consumption

## Source Feature

- `id`: backend-bill-photo-extraction
- `area`: backend
- `depends_on`: consumption-by-pdf (accepted)
- `status`: not_started
- `source`: `feature_list.json`

## Goal

BmBackend's existing upload endpoint `POST /api/v1/fetch-user-consumption-report` also accepts a bill **photo** (JPEG or PNG). A photo goes through the same async job pipeline as a PDF: the client gets `202 { jobId, status: "accepted" }`, polls the existing job endpoint, and gets the same `ConsumptionReportResponse`. PowerAppWeb can then add the photo option (`consumption-by-photo`) without a new API contract.

## Non-Goals

- No PowerAppWeb changes (UI, proxy, client). That is `consumption-by-photo`.
- No new endpoint, and no change to the job/polling API or the response shape.
- No changes to DoclingBillReader, n8n, or BmInfra. The image is wrapped into a one-page PDF inside BmBackend, so Docling's existing `/extract-all` (PDF/ZIP only, with RapidOCR) handles it.
- No HEIC/WebP/GIF support, and no multi-photo or multi-page uploads.
- No change to the price-proposal PDF upload (`PriceTableRoutes`).
- No merge into `qa`, no push, no deploy, no PROD changes.

## Job Story

When a Broker has only a paper bill in front of them,
I want the backend to accept a photo of it the same way it accepts a PDF,
so the web client can start a consumption study from the camera.

## Users And Permissions

- Granted Broker (Firebase token + app grant): may upload a photo. Same guard as today: `call.requireGrantedFirebaseUser(accessControlService)`. Job ownership (`ownerUid`) works as it does for PDFs.
- Unauthenticated or ungranted callers: rejected the same way as for PDFs (401/403). This must not change.

## Acceptance Scenarios

### Scenario 1: JPEG photo creates a job
Given a granted user
When they POST multipart `file=bill.jpg` (`.jpg`/`.jpeg`, JPEG bytes) to `/api/v1/fetch-user-consumption-report`
Then the response is `202` with a `jobId`, and polling the job ends in `completed` with a `ConsumptionReportResponse` (CUPS and consumption present for a readable bill).

### Scenario 2: PNG photo creates a job
Same as Scenario 1 with `bill.png`.

### Scenario 3: PDF unchanged
Given the current PDF flow
When a `.pdf` is uploaded
Then the behavior and status codes are the same as before (regression check). Only the unsupported-type message changes (Scenario 4).

### Scenario 4: Unsupported type rejected
When a `.heic`, `.gif`, `.txt` or extension-less file is uploaded
Then the response is `400` with the message `Only PDF, JPEG or PNG files are accepted`. No job is created and no temp file is left behind.

### Scenario 5: Extension and content disagree
When `fake.jpg` contains bytes that are not a decodable JPEG/PNG (for example, text)
Then the response is `400` with the message `Invalid image file`. No job is created and no temp file is left behind.
Decide by content, not only by extension: check the magic bytes (JPEG `FF D8 FF`, PNG `89 50 4E 47`).

### Scenario 6: Unreadable photo fails the job, not the request
Given a valid image with no bill content (for example, a blank photo)
When it is uploaded
Then the response is `202`, and the job ends `failed` with the Docling error. This is the same failure path as an unreadable PDF.

### Scenario 7: Image orientation and size
Given a large phone photo (≥ 4000 px wide, about 3–8 MB)
When it is uploaded
Then the image fits on a single PDF page at its native aspect ratio (page size = image size in points, or scaled to fit A4; either is fine as long as the image is not cropped). Processing stays within the client's ~3 min poll budget (record the time). EXIF rotation is out of scope; record whether a rotated photo still extracts.

## Repository Research

### Files Inspected (BmBackend `qa` branch, via `git show qa:…`)
- `src/main/kotlin/com/bm/backend/routes/UserConsumptionRoutes.kt`: the `/fetch-user-consumption-report` handler. It checks for a `.pdf` extension, writes a temp file, creates a job, then runs `processConsumptionReportFromPdf` in the background and deletes the temp file in `finally`.
- `src/main/kotlin/com/bm/backend/services/UserConsumptionService.kt`: `processConsumptionReportFromPdf(File)` calls `externalApiService.extractDataFromPdf` and then `runConsumptionPipeline`.
- `src/main/kotlin/com/bm/backend/services/ExternalApiService.kt`: `extractDataFromPdf` posts `application/pdf` to `$DOCLING_CUSTOMER_API_URL/extract-all`.
- `src/main/kotlin/com/bm/backend/services/ComparatorReportPdfService.kt`: shows OpenPDF (`com.lowagie.text.*`, already a dependency: `openpdf:1.3.40`) in use. No new dependency is needed.
- `src/main/kotlin/com/bm/backend/routes/UploadedFileNameSanitizer.kt`: PDF-only filename logic, used by `PriceTableRoutes`. Leave it unchanged.
- `src/test/kotlin/com/bm/backend/routes/FirebaseRouteAuthTest.kt`: `testApplication` + in-memory repository test pattern.
- `AGENTS.md` (BmBackend): Clean Architecture, one model per file, minimal changes.
- `../DoclingBillReader/docling_customer_data_extraction_api_server.py`: `/extract-all` allows only the `pdf` and `zip` extensions. Rejecting images there is why the image must be wrapped. `Dockerfile` installs `rapidocr` and the default `DocumentConverter` runs OCR on bitmap pages.
- `../BmInfra/docker-compose.local-qa.yml`: local QA builds **the current `../BmBackend` checkout**, so checking out the feature branch is enough to test it.
- PowerAppWeb `docs/technical-discovery.md` and `docs/specs/consumption-by-pdf.md`: local QA stack and timing budget.

### Existing Patterns To Follow
- Async job: create the job, return `202 JobResponse`, run on `CoroutineScope(Dispatchers.IO)`, log with `kv("jobId")`, `kv("userId")` and `kv("requestId")`, and delete the temp file in `finally`.
- Errors use `ErrorResponse(message=…)`, and validation problems return 400.

### Current Gaps
- There are no route tests for `/fetch-user-consumption-report` today. The handler builds its own temp files inline.
- There are no sample bill photos in the repo. Create them from `../Example bills/*.pdf` (for example `sips -s format jpeg` / `pdftoppm -jpeg -r 200`), plus at least one real phone photo of a paper bill if available. Do not commit personal bills.

## Technical Approach

1. **Upload type classifier** (new file `routes/ConsumptionUploadType.kt` or `models/`): an enum `PDF | JPEG | PNG`, resolved from the lowercase extension (`pdf`, `jpg`/`jpeg`, `png`). Unknown → null → 400 `Only PDF, JPEG or PNG files are accepted`.
2. **Image → PDF adapter** (new file `services/ImageToPdfConverter.kt`, its own class, injected or constructed in `Application.kt` like the other services): `fun convert(image: File): File`. It checks the magic bytes, loads the image with `com.lowagie.text.Image.getInstance(bytes)`, and creates a `Document` whose page size is the image size (or A4 with `scaleToFit`) with zero margins. It writes a temp `.pdf` and returns it. It throws a dedicated `InvalidImageException` for content that does not decode.
3. **Route**: replace the `.pdf`-only check with the classifier. Use the temp file suffix that matches the type. For images, validate the magic bytes synchronously, **before** creating the job (Scenario 5 → 400). Do the PDF conversion either synchronously or in the background coroutine. Recommended: background, in the same `try`, so a large image does not block the request. If conversion throws there, `failJob`. Delete both the original and the converted temp files in `finally`.
4. **Service**: keep `processConsumptionReportFromPdf(pdfFile)` unchanged and pass it the converted PDF. Optionally add a thin `processConsumptionReportFromImage(imageFile)` in `UserConsumptionService` that converts and delegates. This keeps the conversion out of the route (Clean Architecture). Prefer this option.
5. Docling receives a PDF whose filename is the temp name, which is the same as for today's PDFs. Nothing changes downstream.
6. Messages: the unsupported-type message becomes `Only PDF, JPEG or PNG files are accepted` (Scenario 4). PowerAppWeb does not parse it. `No PDF file provided` stays exactly as it is, to keep the client contract stable.

## Expected File Changes (all in `../BmBackend`, branch `feature/backend-bill-photo-extraction`)
- `src/main/kotlin/com/bm/backend/models/ConsumptionUploadType.kt`: create.
- `src/main/kotlin/com/bm/backend/services/ImageToPdfConverter.kt`: create.
- `src/main/kotlin/com/bm/backend/services/InvalidImageException.kt`: create (or place it next to the existing exceptions if there is a convention for that).
- `src/main/kotlin/com/bm/backend/services/UserConsumptionService.kt`: modify. Add `processConsumptionReportFromImage`.
- `src/main/kotlin/com/bm/backend/routes/UserConsumptionRoutes.kt`: modify. Classifier, magic-byte check, temp file cleanup.
- `src/main/kotlin/com/bm/backend/Application.kt`: modify only if the wiring needs it.
- `src/test/kotlin/com/bm/backend/services/ImageToPdfConverterTest.kt`: create. JPEG and PNG produce a 1-page PDF (`%PDF` header; page count via OpenPDF `PdfReader`), invalid bytes throw, and the aspect ratio is preserved.
- `src/test/kotlin/com/bm/backend/models/ConsumptionUploadTypeTest.kt`: create.
- `docs/ASYNC_JOB_API.md` (BmBackend): update. List the accepted types and the new 400 messages.
- PowerAppWeb: `feature_list.json` and `PROGRESS.md` evidence only. In `docs/risks-and-open-questions.md`, mark "bill photo upload" as done and add the photo timing.

## Visual Design Impact
- UI involved: no.

## Durable Documentation Impact
- `ARCHITECTURE.md` / `CONSTRAINTS.md` (PowerAppWeb): not needed. No client boundary changes.
- `AGENTS.md`: not needed. The branch rule is specific to this feature and is recorded here and in `PROGRESS.md`.
- `docs/technical-discovery.md` (PowerAppWeb): update. Replace the line "New backend capability: accept bill photos" with: the endpoint accepts JPEG/PNG, and the image is wrapped to PDF in BmBackend.
- BmBackend `docs/ASYNC_JOB_API.md`: update (see above).

## Implementation Plan
1. In `../BmBackend`: `git fetch`, `git checkout qa`, `git pull`, then `git checkout -b feature/backend-bill-photo-extraction`. Confirm `git status` is clean first. The checkout is currently on `main`, so do not carry local changes over.
2. Add the type classifier, converter and exception, with unit tests.
3. Wire the service method and the route changes.
4. `./gradlew test` passes.
5. Bring up local QA from this branch and run the endpoint scenarios.
6. Update the docs and record the evidence.

## Implementation Tasks
- [ ] Create the branch from an up-to-date `qa` (see the handoff rules below).
- [ ] `ConsumptionUploadType` + tests.
- [ ] `ImageToPdfConverter` (OpenPDF, zero margins, no cropping) + tests.
- [ ] `UserConsumptionService.processConsumptionReportFromImage`.
- [ ] Route: classifier, magic-byte 400, per-type temp suffix, cleanup of both files.
- [ ] Generate sample JPEG and PNG files from `../Example bills/2.0TD.- IBERDROLA FACTURA.pdf` (page 1, ~200 dpi) in a temp directory (not committed).
- [ ] Run Scenarios 1–7 against local QA and record the results.
- [ ] Update the docs.

## Verification Plan
- `cd ../BmBackend && ./gradlew test`: all tests pass, including the new ones.
- `../BmInfra/bm-local-qa up` with BmBackend checked out on the feature branch (local QA builds that checkout). Get a QA Firebase ID token for the test account (never print or commit it). Then run:
  - `curl -s -H "Authorization: Bearer $TOKEN" -F "file=@bill.jpg" http://localhost:9081/api/v1/fetch-user-consumption-report` → 202 + jobId. Poll the existing job status endpoint (the same one the PDF flow uses, see `docs/ASYNC_JOB_API.md`) until `completed`. Record the CUPS and the elapsed time.
  - Repeat with `bill.png`, the original PDF (regression), `x.heic` / `x.txt` (400), `fake.jpg` with text bytes (400), and a blank image (202 → job failed).
  - Optional: run the same request through PowerAppWeb's proxy `http://localhost:9003/api/bm/fetch-user-consumption-report` to confirm the proxy passes multipart images through unchanged.
- PowerAppWeb `./init.sh` still passes. No client code changed, and E2E is not needed: there is no UI change. The client flow gets E2E coverage in `consumption-by-photo`.
- **Branch / handoff rules (user-approved for this feature):** all BmBackend work happens on the new local branch `feature/backend-bill-photo-extraction`, created from BmBackend's `qa`. Do **not** commit onto `qa`, do not merge into `qa`, do not push, and do not deploy unless the user explicitly asks. Never touch PROD. Leave the branch for the user's review. Committing on the feature branch is allowed only if the user asks; otherwise leave the changes uncommitted on the branch and report `git status`/`git diff --stat`. When done, record in `PROGRESS.md` which branch is checked out in `../BmBackend`, because local QA builds whatever is checked out.

## Evidence To Capture
- `./gradlew test` summary (test counts).
- A table of the endpoint runs: file, HTTP status, final job status, CUPS, elapsed time.
- `git -C ../BmBackend branch --show-current` = `feature/backend-bill-photo-extraction`, plus the diff stat.
- Note on the rotated/large-photo result (Scenario 7).

## Validator Checklist
- [ ] Changes are only in BmBackend on `feature/backend-bill-photo-extraction`, branched from `qa`. Nothing is pushed or merged, and nothing touches PROD.
- [ ] Scenarios 1–7 have evidence, and the PDF regression passes.
- [ ] Auth guard and job ownership are unchanged for images.
- [ ] No temp files leak (original and converted files are deleted on success, on failure, and on a 400).
- [ ] New models and services are each in their own file, and there is no business logic in the route beyond validation.
- [ ] DoclingBillReader, n8n, BmInfra and PowerAppWeb app code are untouched.
- [ ] `feature_list.json`, `PROGRESS.md` and the docs are updated.

## Risks / Unknowns
- OCR quality on phone photos (perspective, glare) is unknown. The PDF-derived samples prove the pipeline works, but real-world accuracy needs a real photo. If extraction fails often, that is a follow-up for DoclingBillReader, not this feature.
- Docling OCR time on a full-page bitmap may come close to the ~3 min poll budget. Measure it. Downscaling to ~2000 px on the long edge before wrapping is an allowed mitigation inside the converter.
- iOS can send HEIC from the Photos picker. Handling that belongs to the client (`consumption-by-photo`, via `accept="image/jpeg,image/png"` or canvas re-encoding).
