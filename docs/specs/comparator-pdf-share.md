# Feature Implementation Spec: Generate and share Comparator PDF

## Source Feature

- `id`: comparator-pdf-share
- `area`: pdf
- `depends_on`: proposals-table (accepted). `proposals-configuration` is also accepted, and the PDF uses its visible set.
- `status`: not_started
- `source`: `feature_list.json`

## Goal

On `/proposals`, a "Crear informe" action in the top bar asks BmBackend to generate the comparator PDF (`POST /api/v1/reports/comparator-pdf`). The request body is built exactly like BmApp `ProposalsViewModel.buildComparatorReportModel` + `ComparatorReportPdfMapper`. The PDF is then handed to the native share sheet (Web Share API with files), falling back to a file download. While the PDF is being generated the action shows a spinner and is disabled. On failure the screen shows "No se pudo generar el informe PDF."

## Non-Goals

- No PREMIUM comprehensive PDF and no tier checks (`premium-comprehensive-pdf`).
- No client-side PDF rendering; the backend renders it.
- No analytics events (`ProposalPdfExported`/`Failed` → `analytics-screen-tracking`).
- No caching or history of generated PDFs.

## Job Story

When the Broker has the comparison ready in front of the customer,
I want to produce the PDF report and send it straight away (WhatsApp, mail…),
so the customer leaves with the offer in hand.

## Users And Permissions

- A granted Broker at `UNLOCKED` (the backend runs `requireGrantedFirebaseUser`). The proxy already allows `reports` (`src/lib/server/backend-proxy.ts` `ALLOWED_ROOTS`) and forwards `content-disposition`.

## Acceptance Scenarios

### Scenario 1: Action visibility
Given `/proposals` with at least one visible proposal
Then the top bar shows a text button "Crear informe" on the right, with the hamburger on the left.
It is hidden on other routes and when no proposal is visible (BmApp: `currentRoute == Proposals && hasProposals`).

### Scenario 2: Request body parity
When the Broker taps "Crear informe"
Then one POST to `/api/bm/reports/comparator-pdf` is sent with `Accept: application/pdf` and the JSON body:
- `title: "COMPARATIVO ANUAL DE PRECIOS FIJOS"`
- `supplyHolder` / `supplyAddress` / `cups`: the session values, or `"--"` when blank.
- `tariffName`: `session.feeType`
- `powerTermRows`: `[{period, value}]` with kW as numbers.
- `energyConsumedRows`: `[{period, value}]` with the kWh truncated to an integer.
- `iva` and `impuestoElectrico`: `"%.2f %"` labels, e.g. `"21.00 %"`.
- `customerConditions`: `{title:"CONDICIONES ACTUALES", powerTermItems, annualPowerTermCost, consumedEnergyItems, annualEnergyCost, extraServices, electricalTax, iva, totalAnnualPrice}`, taken from `summary.customerConditions`. These are the same strings the table shows, and they are empty strings or arrays when there are no customer prices.
- `proposals`: the **visible** proposals in table order. Each is `{title, powerTermItems, annualPowerTermCost, consumedEnergyItems, annualEnergyCost, extraServices, electricalTax, iva, totalAnnualPrice, annualPriceDifference, annualSavingsPercentage}`, where:
  - the cost fields use `%.2f` of the *recalculated* proposal;
  - `extraServices` is the typed fixed amount as a raw string, or `"0.00"` when it is blank;
  - `annualPriceDifference` is `toTwoDecimals(delta)`, or `null` when there is no delta;
  - `annualSavingsPercentage` is an integer, or `null`.

### Scenario 3: Share on phones
Given the response is 200 with PDF bytes
And `navigator.canShare?.({ files: [file] })` is true
Then the app calls `navigator.share({ files: [File(bytes, "comparador_yyyyMMdd_HHmmss.pdf", {type:"application/pdf"})], title: "Comparador de propuestas" })`. The timestamp uses local time.
If the user dismisses the share sheet (`AbortError`), nothing else happens.

### Scenario 4: Lost user activation (iOS Safari)
Given the share call rejects with `NotAllowedError`, because the gesture expired during the network call
Then a small inline panel appears saying "Informe listo" with a primary button "Compartir PDF" and a secondary "Descargar". Either button runs on a fresh tap. The panel can be dismissed.

### Scenario 5: Download fallback
Given the browser cannot share files (desktop, or `canShare` false or undefined)
Then the PDF downloads through an object-URL `<a download="comparador_….pdf">`, and the URL is revoked afterwards.

### Scenario 6: In progress and failure
While the request is in flight, the action shows a spinner, is disabled, and repeated taps are ignored (BmApp guard).
On a non-200 response, a network error, empty bytes, or zero visible proposals, an alert shows "No se pudo generar el informe PDF." and the action is re-enabled.
401/403 go through `useBmFetch`, which signs the Broker out with the standard notice.

## Repository Research

### Files Inspected
- `../BmApp/.../views/proposals/ProposalsViewModel.kt`: `exportVisibleProposalsAsPdf`, `buildComparatorReportModel`, constants `PLACEHOLDER "--"`, `DEFAULT_AMOUNT "0.00"`, `CUSTOMER_COLUMN_TITLE`.
- `../BmApp/domain/.../models/ComparatorReportPdfModel.kt`: the field set and default title.
- `../BmApp/data/.../utils/ComparatorReportPdfMapper.kt`: a 1:1 mapping.
- `../BmApp/data/.../network/PriceTableApi.kt:213`: POST `reports/comparator-pdf`, Accept pdf, 200 only.
- `../BmApp/.../common/{TopActionBar,PrintButton}.kt` and `MainStructureView.kt`: button placement, visibility rule, spinner, and error toast.
- `../BmApp/.../pricetable/export/{ComparatorPdfFileStore,ComparatorPdfShareManager}.kt`: file name `comparador_yyyyMMdd_HHmmss.pdf`, subject "Comparador de propuestas".
- `../BmApp/app/src/main/res/values-es/strings.xml`: "Crear informe" and "No se pudo generar el informe PDF.".
- `../BmBackend/.../routes/UserConsumptionRoutes.kt`: the route, granted-user check, and attachment response.
- `src/components/shell/app-shell.tsx`: `useTopBarAction(node)` slot; the test already uses "Crear informe".
- `src/components/proposals/proposals-table.tsx`: summary, visible list, and fixed amounts in one place.
- `src/lib/api/use-bm-fetch.ts`, `src/lib/server/backend-proxy.ts` (`reports` allowed).
- `src/lib/comparator/{calculate,format,rounding}.ts`: `percentLabel`, `toTwoDecimals`, `formatFixedHalfUp`.

### Existing Patterns To Follow
- Pure payload builders go in `src/lib/<area>/` with Vitest, and components stay thin.
- Backend calls use `useBmFetch`.
- Transient notices use the inline `role="status"`/`role="alert"` pattern from `conditions-copy-from-proposal`, with no toast library.

### Current Gaps
- No share or download helper exists yet.
- iOS Safari's handling of user activation across `await fetch` is unverified. Scenario 4 covers it, and it must be checked on a real iPhone (`qa-real-device-checks` if it can't be checked now).
- The Playwright Chromium project cannot exercise the real share sheet. Stub `navigator.share`/`canShare` in E2E.

## Technical Approach

1. **`src/lib/pdf/comparator-report.ts`**: `buildComparatorReportRequest(session, summary, visibleProposals, fixedAmounts)` returns `ComparatorReportPdfRequest`, a pure function following Scenario 2. Reuse the same summary and visible list the table renders. Also add `comparatorPdfFileName(now = new Date())`.
2. **`src/lib/pdf/share-file.ts`**: `shareOrDownload(blob, fileName, title)` returns `"shared" | "cancelled" | "needs-gesture" | "downloaded"`, using the share → `AbortError` / `NotAllowedError` → download logic from Scenarios 3–5. Add `downloadBlob(blob, name)` and inject `navigator`/`document` for tests.
3. **Shared state**: lift the summary and visible-list computation into a `useComparator()` hook in `src/components/proposals/use-comparator.ts`, used by both the table and the export so they cannot drift. Refactor `proposals-table.tsx` to use it.
4. **`src/components/proposals/create-report-action.tsx`**: a button registered through `useTopBarAction` from `ProposalsComparator` only when `visible.length > 0`. Clear it on unmount. Its states are idle, generating (spinner, `aria-busy`, disabled), a ready panel (needs-gesture), and error.
   - It calls `useBmFetch()("reports/comparator-pdf", {method:"POST", headers:{"Content-Type":"application/json", Accept:"application/pdf"}, body})`, then `response.blob()`. If the blob is empty, that counts as an error.
5. **Messages** (`src/lib/proposals/messages.ts`): `CREATE_REPORT`, `PDF_EXPORT_ERROR`, `PDF_READY`, `SHARE_PDF`, `DOWNLOAD_PDF`, `PDF_SHARE_TITLE = "Comparador de propuestas"`.

## Expected File Changes
- `src/lib/pdf/comparator-report.ts` and `.test.ts`: create.
- `src/lib/pdf/share-file.ts` and `.test.ts`: create.
- `src/components/proposals/use-comparator.ts`: create.
- `src/components/proposals/create-report-action.tsx` and `.test.tsx`: create.
- `src/components/proposals/proposals-table.tsx`: modify to use the hook and register the action.
- `src/lib/proposals/messages.ts`: modify.
- `e2e/comparator-pdf.spec.ts`: create.
- `docs/domain-model.md`, `docs/technical-discovery.md` (share/download behaviour), `DESIGN.md` (ready panel), `feature_list.json`, `PROGRESS.md`.

## Visual Design Impact
- UI involved: yes. A top-bar text action with spinner, an inline "Informe listo" panel (tokens only, buttons ≥44px), and an error alert. Source: BmApp `PrintButton` and `DESIGN.md`.

## Durable Documentation Impact
- `ARCHITECTURE.md` / `CONSTRAINTS.md`: not needed; neither exists.
- `AGENTS.md`: not needed.
- `docs/technical-discovery.md`: update with the Web Share files flow, the needs-gesture fallback and the download fallback.
- `docs/domain-model.md`: update to say the PDF includes only visible proposals and the request matches BmApp.
- `DESIGN.md`: update with the ready panel as the web adaptation of the Android chooser.

## Implementation Plan
1. Payload builder and tests, with a golden-style fixture comparing against a hand-checked BmApp body.
2. Share helper and tests.
3. `useComparator` refactor; the existing table tests must stay green.
4. Action component and wiring.
5. E2E, the live QA check and docs.

## Implementation Tasks
- [x] Builder tests:
  - [x] placeholders `"--"`;
  - [x] kWh truncation;
  - [x] `"21.00 %"` labels;
  - [x] the customer column with no customer prices (empty strings and arrays);
  - [x] the fixed amount: raw `"12,5"` passes through as typed, blank becomes `"0.00"`;
  - [x] a null delta and percentage when there are no customer prices;
  - [x] only visible proposals, in order.
- [x] File-name test: a fixed date gives `comparador_20261019_153045.pdf`.
- [x] Share tests:
  - [x] canShare true → share is called, then `"shared"`;
  - [x] AbortError → `"cancelled"`;
  - [x] NotAllowedError → `"needs-gesture"`;
  - [x] no share support → download (anchor clicked, URL revoked).
- [x] RTL:
  - [x] the action shows only with visible proposals;
  - [x] a double tap sends one request;
  - [x] a 500 shows the error alert;
  - [x] needs-gesture shows the panel.
- [x] E2E (android-chromium), with the mocked report as in `proposals.spec.ts` and `reports/comparator-pdf` mocked to a small `%PDF-1.4` body:
  - [x] assert the request body fields (Scenario 2) and the Accept header;
  - [x] stub `navigator.canShare/share` through `addInitScript`, and assert share was called with one file named `comparador_*.pdf`;
  - [x] a second test removes `share` and asserts `page.waitForEvent("download")` with a `comparador_*.pdf` filename;
  - [x] a third test returns 500 and asserts the error text;
  - [x] the action is hidden on `/current-conditions` and when every proposal is hidden.
- [x] Live QA (manual): local QA backend and a real study. Generate the PDF once on desktop (download) and confirm it opens with the expected values. Record the result.

## Verification Plan
- `./init.sh`: green.
- `npm run test:e2e:quick -- e2e/comparator-pdf.spec.ts` while iterating.
- A full `npm run test:e2e` once at the end (android-chromium; 15-minute timeout; no piping).
- Manual check against the feature's verification ("Share on iPhone and Android; download on desktop"): the desktop download is checked now. Real Android Chrome and iPhone Safari shares are checked by the user. If they are not done, record them as open in `PROGRESS.md` for `qa-real-device-checks`.

## Evidence To Capture
- Vitest count, focused and full E2E results, the live QA PDF result, and the device share results or a deferral note.

## Validator Checklist
- [ ] The request body matches BmApp field for field, including the placeholders, labels, raw fixed amount and visible-only proposals.
- [ ] The table and PDF share one computation (`useComparator`).
- [ ] Share, cancel, needs-gesture and download paths are implemented and tested.
- [ ] Repeated taps are ignored, failures show the BmApp error text, and auth errors sign out.
- [ ] No tier logic, analytics or client-side rendering.
- [ ] Docs, `feature_list.json` and `PROGRESS.md` are updated.
