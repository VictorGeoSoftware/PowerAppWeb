# Feature Implementation Spec: Request consumption by bill PDF upload

## Source Feature

- `id`: consumption-by-pdf
- `area`: consumption
- `depends_on`: consumption-by-cups-manual (`accepted`)
- `status`: not_started at planning time (2026-10-14)
- `source`: `feature_list.json`

## Goal

On `/fetch-consumption`, a signed-in Broker can pick a PDF electricity bill from the phone (Files, Drive, Downloads…). The app uploads it as multipart to `fetch-user-consumption-report`. It then reuses the existing Consumption Job runner (poll → result → publish session), so the end state is identical to the CUPS path: the gate moves to `/current-conditions` with the `ConsumptionSummary`. Resume, restore, reset and logout behave exactly as for CUPS jobs.

## Non-Goals

- Camera OCR (`cups-camera-ocr`), photo upload (`consumption-by-photo`, `backend-bill-photo-extraction`).
- Retry button, refresh endpoint, special failed-job handling (`consumption-job-refresh-errors`).
- Any backend, Docling or n8n change.
- PDF preview, multi-file upload, drag-and-drop UX, upload progress percentage.
- Clearing `bm.lastCompletedJobId` on new submit (open low follow-up from the CUPS feature; keep it separate).
- Committing real bills: the `../Example bills` files contain personal data and must never be copied into the repo.

## Job Story

When I'm with a customer who has their bill as a PDF on the phone,
I want to upload it,
so I get their real consumption without typing the CUPS.

## Users And Permissions

- A granted Broker: same as the CUPS path. The backend checks `requireGrantedFirebaseUser` and the job owner, and returns 404 for other users' jobs. 401/403 forces logout through `useBmFetch`, which is the existing behaviour.

## Decisions (planner, 2026-10-14)

1. **Layout.** Under "ELIGE UN MÉTODO", keep the inline CUPS form first. Below it, add a method row like BmApp's `ConsumptionMethodOption`:
   - Icon: `FileUp`, in a 40px `bg-header-highlight` tile.
   - Title "Subir factura PDF", subtitle "Extraemos los datos automáticamente", chevron.
   - The row is a `<label>` or button that opens a hidden `<input type="file" accept="application/pdf,.pdf">`.
   - Picking a file starts the study immediately, with no confirm step. This is BmApp parity.
2. **Client checks (web-only).**
   - The file must have `type === "application/pdf"` or a name ending in `.pdf`. Otherwise show "Selecciona un archivo PDF." and do not submit.
   - Files over 50 MB (nginx `client_max_body_size 50M`) show "El archivo supera el tamaño máximo de 50 MB." and do not submit.
   - BmApp needs neither check because its picker filters by MIME type.
3. **Multipart.** Send `FormData` with part `file`. The filename must end in `.pdf`, because the backend rejects any other name with 400: use `file.name` when it does, else `factura.pdf`. Do not set `Content-Type` manually; the browser adds the boundary. Success means status 202 with `jobId`, as for CUPS.
4. **Steps.** First step is `UPLOADING_BILL` = "Subiendo factura...". After that, the same QUEUED / PROCESSING / FETCHING_RESULTS steps and the same 3 s × 60 limit. Failure codes and strings are unchanged (BmApp maps PDF submit errors to `SUBMIT_FAILED`).
5. **Resume.**
   - `bm.activeJob` becomes `{jobId, source: "cups" | "pdf", cups?, attempts}`.
   - Older entries without `source` are read as `cups`.
   - Resuming never re-uploads; it only needs the `jobId`.
6. **Failure UI.** When a PDF study fails, show the error above the methods. The CUPS field is empty and no file is kept; the Broker picks the file again. The `failed` state carries `source`, and `cups` is only filled for CUPS.

## Acceptance Scenarios

### Scenario 1: Option visible
Given the Broker is on `/fetch-consumption`
Then they see the CUPS form and, below it, a control named "Subir factura PDF" with the subtitle "Extraemos los datos automáticamente". It is keyboard-reachable, at least 44px tall, and backed by a file input with `accept` containing `application/pdf`.

### Scenario 2: Happy path
Given a valid PDF is chosen
Then the app sends POST `/api/bm/fetch-user-consumption-report` as `multipart/form-data` with one `file` part whose filename ends in `.pdf`.
The spinner "Obtener consumo" shows, in order: "Subiendo factura..." → queue/processing → "Obteniendo resultados...".
On COMPLETED the URL becomes `/current-conditions` and the summary shows the CUPS from the report.

### Scenario 3: Not a PDF / too big
Given the Broker picks `foto.png` (`image/png`), or a PDF larger than 50 MB
Then no request is sent, the matching message appears in `role="alert"`, and the form stays usable.

### Scenario 4: Errors
- Submit non-202, a backend 400 or a network failure → "No se pudo iniciar el estudio. Inténtalo de nuevo."
- FAILED, status, result and timeout errors → the same messages as for CUPS.

In every case `bm.activeJob` is cleared and the CUPS field is empty.

### Scenario 5: Resume and restore
Given a PDF job is polling
When the page reloads or the tab returns to visible
Then polling continues on the same jobId with no new upload, and `bm.activeJob.source` is `"pdf"`.
Restoring a completed study (< 1 h) works the same as for CUPS.

### Scenario 6: Reset and logout
"Nuevo estudio" or logout during a PDF job stops polling, clears both keys, and shows an empty form.

### Scenario 7: CUPS unaffected
All existing `e2e/consumption-cups.spec.ts` tests still pass. Update only the assertion "only the CUPS method", which must now expect the PDF option and still no camera or photo option.

### Scenario 8: Real bill (manual)
Against local QA (Docling + n8n up via `../BmInfra/bm-local-qa up`), on a mobile viewport, upload `../Example bills/2.0TD.- IBERDROLA FACTURA.pdf` and one 3.0TD bill. Each must reach `/current-conditions` with a plausible summary. Record the time taken and the result. If Docling or n8n is unavailable, record PENDING; acceptance needs this check or an explicit user waiver.

## Repository Research

### Files Inspected

- `../BmApp`:
  - `ui/views/fetchconsumption/FetchConsumptionScreen.kt` (OpenDocument picker with `application/pdf`, method row layout)
  - `FetchConsumptionViewModel.kt:38` (`onPdfSelected`)
  - `data/network/PriceTableApi.kt:75-102` (multipart part `file`, `Content-Type: application/pdf`, `filename=`)
  - `ConsumptionStudyRepositoryImpl.kt:43-75` (`startFromPdf` → `UPLOADING_BILL`, shared `startStudy`)
  - `res/values-es/strings.xml:24-50`
- `../BmBackend` (`qa`):
  - `routes/UserConsumptionRoutes.kt:75-182`: first `FileItem` only; `.pdf` name required, else 400; no file → 400; 202 `JobResponse`; async Docling → shared pipeline.
  - `services/UserConsumptionService.kt:22`, `ExternalApiService.kt:36,55-64` (10-min HTTP timeout, `DOCLING_CUSTOMER_API_URL`).
  - `nginx-bm-backend.conf:9` (50M).
- `../BmInfra/docker-compose.local-qa.yml:35-54` (local `docling-api` service exists); `nginx/nginx.conf:21` (50M).
- PowerAppWeb:
  - `src/lib/server/backend-proxy.ts`: `fetch-user-consumption-report` already allowlisted. Forwards `content-type` and an `arrayBuffer` body, so the multipart boundary is preserved.
  - `src/lib/api/bm-fetch.ts`: only sets `Authorization`, so it is FormData-safe.
  - `src/lib/consumption/study.ts`, `messages.ts`, `report.ts`
  - `src/components/consumption/consumption-study-provider.tsx`, `cups-form.tsx`, `study-progress.tsx`
  - `src/app/(app)/fetch-consumption/page.tsx`
  - `src/lib/gate/storage.ts`
  - `e2e/consumption-cups.spec.ts` (route-mock pattern)
  - `docs/specs/consumption-by-cups-manual.md`
  - `PROGRESS.md`

### Existing Patterns To Follow

- Every call goes through `useBmFetch` and `runStudy`. No direct `fetch`.
- E2E mocks job endpoints with `page.route` using the real signed-in session (`useSignedInSession`/`openSignedIn`), with `workers: 1`.
- Error box: `role="alert"`, `bg-destructive/10`, `text-foreground` plus a red icon (AA lesson).

### Current Gaps / Risks

- Docling extraction may take tens of seconds or longer. 60 × 3 s gives about 3 min of visible polling. A slow Docling run leads to TIMEOUT, which is BmApp parity. Note real timings.
- Next.js route handler body size: no limit is expected for App Router `request.arrayBuffer()`. Verify it with the 1.9 MB example bill and with a ~10 MB synthetic PDF through the proxy.
- iOS Safari: `accept="application/pdf"` opens the Files picker. Some providers report an empty `type`, which is why the `.pdf` name fallback exists. Check this on the iPhone Simulator.
- The backend is in-memory and the upload is held in a temp file, so a backend restart loses the job. Status 404 is handled as STATUS_CHECK_FAILED.

## Technical Approach

- **`messages.ts`.** Add the step `UPLOADING_BILL: "Subiendo factura..."` and export `PDF_NOT_PDF` and `PDF_TOO_LARGE`, the client-check strings.
- **`src/lib/consumption/bill-file.ts`** (new, pure).
  - `MAX_BILL_BYTES = 50 * 1024 * 1024`.
  - `checkBillFile(file) → "ok" | "NOT_PDF" | "TOO_LARGE"`.
  - `billUploadName(file)` returns a name that always ends in `.pdf`.
- **`study.ts`.**
  - Replace `cups?: string` with `submission?: { kind: "cups"; cups: string } | { kind: "pdf"; file: File }`, plus `resumeJobId`.
  - CUPS keeps the current JSON body and `SUBMITTING_CUPS`.
  - PDF builds `FormData` (`append("file", file, billUploadName(file))`), POSTs to `PDF_SUBMIT_PATH = "fetch-user-consumption-report"` and emits `UPLOADING_BILL`.
  - The polling and result code is untouched.
- **`storage.ts`.** Add `source` to the `ActiveJob` type, defaulting to `"cups"` on load when missing.
- **Provider.**
  - `start` becomes `startCups(cups)` plus `startPdf(file)`; the internal `run` takes a submission or a resume.
  - The `failed` state becomes `{kind, message, source, cups}`, with `cups` set to `""` for PDF.
  - A resume uses `active.source`. The initial step on resume stays `QUEUED`.
- **UI.** New `src/components/consumption/pdf-upload-option.tsx`:
  - A hidden file input plus a visible method row (`<label htmlFor>` or a button calling `input.click()`), with a 44px+ target.
  - `onChange` runs `checkBillFile`. If the check fails, show the local alert. If it passes, call `startPdf`, then reset `input.value` so the same file can be picked again.
  - `page.tsx` renders it under `CupsForm`.
  - Show only one shared error alert, the study error or the local error. The existing `CupsForm` `error` prop can stay for study errors; the local file error lives in the PDF option.
- **No proxy change** expected. Add a unit test proving multipart content-type and body bytes are forwarded unchanged.

## Expected File Changes

- `src/lib/consumption/messages.ts`, `study.ts` (+ `study.test.ts`) — modify
- `src/lib/consumption/bill-file.ts` + `bill-file.test.ts` — create
- `src/lib/gate/storage.ts` (+ test) — modify: `ActiveJob.source`
- `src/components/consumption/consumption-study-provider.tsx` (+ test) — modify
- `src/components/consumption/pdf-upload-option.tsx` (+ test) — create
- `src/app/(app)/fetch-consumption/page.tsx` — modify
- `src/lib/server/backend-proxy.test.ts` — modify: multipart forwarding case
- `e2e/consumption-pdf.spec.ts` — create. `e2e/consumption-cups.spec.ts` — modify only the "only the CUPS method" assertion.

## Visual Design Impact

- UI involved: yes. Design source is `DESIGN.md` plus BmApp `ConsumptionMethodOption`.
- States to check: the methods list with the PDF row; the local file error; running with "Subiendo factura..."; a study error after a PDF upload. Check each at 390px in light and dark.
- New design artifact: none.

## Durable Documentation Impact

- `ARCHITECTURE.md` / `CONSTRAINTS.md`: not needed. Neither exists, and there is no new boundary.
- `AGENTS.md`: not needed.
- `docs/domain-model.md`: update.
  - PDF source on the Consumption Job: multipart `file`, `.pdf` name, 50 MB.
  - The `bm.activeJob.source` field.
- `docs/risks-and-open-questions.md`: add Docling latency vs the 3-minute poll budget, and iOS empty MIME types.
- `README.md`: not needed, unless Scenario 8 needs extra local QA steps for Docling (then add them in §6).

## Implementation Plan

1. `bill-file.ts` with tests.
2. Generalise `runStudy` to submissions. Tests: multipart body has a `file` part with a `.pdf` name, `UPLOADING_BILL` comes first, a non-202 response gives `SUBMIT_FAILED`, and the CUPS tests still pass.
3. Add `source` to storage, with a backward-compatible load.
4. Provider: `startPdf` and failed-state shape. Tests: resuming a PDF job does not re-upload.
5. `PdfUploadOption` and page wiring.
6. Proxy multipart unit test.
7. E2E, then the manual real-bill run, docs, evidence.

## Implementation Tasks

- [ ] bill-file checks + tests
- [ ] runStudy submission union + PDF tests
- [ ] ActiveJob.source + tests
- [ ] provider startPdf / failed.source + tests
- [ ] PdfUploadOption + page
- [ ] proxy multipart test
- [ ] `e2e/consumption-pdf.spec.ts`. Use a tiny in-memory PDF buffer via `setInputFiles({name, mimeType, buffer})`; never real bills. Cover Scenarios 1–6. Assert the multipart request in `route.request()` (content-type starts with `multipart/form-data`; the body contains `filename="….pdf"`).
- [ ] update the CUPS E2E method assertion
- [ ] docs + `feature_list.json` + `PROGRESS.md`

## Verification Plan

- `./init.sh` green; `npm run build` OK.
- `npm run test:e2e`, with credentials from Keychain (README §6) and the dev server warmed up. All tests must pass on android-chromium and iphone-webkit, including the new spec.
- Manual Scenario 8 against local QA with Docling and n8n, on the iphone-webkit viewport or the iPhone Simulator. Upload at least one 2.0TD and one 3.0TD example bill, and record the time to result.
- iPhone Simulator Safari: tapping "Subir factura PDF" opens the Files picker, and a picked PDF uploads.
- Screenshots of the states listed under Visual Design Impact.

## Evidence To Capture

- Unit test count, build OK, E2E pass count per project, Scenario 8 bills and timings (or PENDING with the reason), screenshot paths. Record them in `feature_list.json` evidence and in a `PROGRESS.md` session entry.

## Validator Checklist

- [ ] Multipart matches BmApp and the backend: part `file`, `.pdf` filename, 202 → jobId. Polling, steps and failures are shared with CUPS. "Subiendo factura..." is shown first.
- [ ] Client checks: not a PDF, more than 50 MB. No request is sent in either case.
- [ ] Resume does not re-upload. Reset and logout clear the keys. Old `bm.activeJob` entries without `source` still resume.
- [ ] No camera or photo option, no retry or refresh, no backend changes, no real bills committed.
- [ ] CUPS E2E still green. New PDF E2E added. Mobile screenshots reviewed.
- [ ] Scenario 8 evidence present or explicitly waived. Docs, `feature_list.json` and `PROGRESS.md` updated.
