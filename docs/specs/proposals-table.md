# Feature Implementation Spec: Proposals comparison table

## Source Feature

- `id`: proposals-table
- `area`: comparator
- `depends_on`: current-conditions-form, comparator-calculation (both accepted)
- `status`: implemented (awaiting validation)
- `source`: `feature_list.json`
- Scope note: the copy-prices sheet was split out to `conditions-copy-from-proposal` on 2026-10-19 at the user's request.

## Goal

Replace the `/proposals` placeholder with BmApp's comparator, built from `ProposalsScreen`, `ComparatorProposalsView`, `UserConsumptionDataView`, `CustomerConditionsColumnView` and `PriceProposalColumn`. The screen has these columns, in order:
1. Consumption labels: tariff, kW, kWh, IVA %, electricity tax %.
2. "Tarifa actual", the customer's current conditions.
3. One column per proposal, with an editable annual fixed amount, the total and the yearly difference against the customer.

A "Mejor opción" card sits below the table. On phones the table scrolls sideways while the first column stays fixed. Every number comes from `calculateComparatorSummary` and is formatted exactly as BmApp formats it.

## Non-Goals

- No copy-prices sheet (`conditions-copy-from-proposal`).
- No visibility toggles or auto-hide of uncompetitive proposals (`proposals-configuration`). All parsed proposals are shown.
- No "Crear informe" button and no PDF (`comparator-pdf-share`).
- No analytics event (`analytics-screen-tracking`).
- No changes to the calculation library, except a display-format helper if one is missing.

## Job Story

When I've entered my customer's current prices,
I want to see every proposal side by side with them, including the yearly saving,
so I can recommend the best offer on the spot.

## Users And Permissions

- Broker at the `UNLOCKED` stage. `FeeFirstGateGuard` already redirects other stages away from `/proposals`. The screen makes no backend calls.

## Acceptance Scenarios

### Scenario 1: Table renders with parity
Given an unlocked 3.0TD study with 2 proposals and filled conditions
When the Broker opens `/proposals`
Then the columns appear in this order:

| Column | Header | Rows |
|---|---|---|
| Consumption | tariff name + "CONSUMO ANUAL" | "TÉRMINO DE POTENCIA" P1..Pn with kW; "Coste anual termino potencia"; "ENERGÍA CONSUMIDA" Pn with integer kWh; "Coste anual termino energía"; "SERVICIOS EXTRA" / "Coste Anual"; "IMPUESTO ELÉCTRICO" and "IVA" as `"%.2f %"` (e.g. `21.00 %`); "COSTE ANUAL FACTURA ELÉCTRICA" |
| Customer | "Tarifa actual" | price items (Kotlin `Double.toString`), `{annualPowerTermCost}€`, items, `{annualEnergyCost}€`, extra services / electricity tax / IVA, `{total}€` |
| Each proposal | title, middle-ellipsized to 17 chars (7 head + "..." + 8 tail) | items as `%.6f`, the two cost totals with `€`, fixed-amount input (placeholder "0.00"), electricity tax, IVA, total `€`, and a difference line `"%.2f€ (N%)"` |

The difference line is red (`#D32F2F`) when negative and black when positive. It shows "--" when there are no customer prices.

### Scenario 2: Sticky first column on phones
Given a 390px viewport
When the Broker scrolls the table sideways
Then the consumption-labels column stays pinned on the left and the other columns scroll under it. The page itself never scrolls sideways.

### Scenario 3: Fixed amount recalculates
When the Broker types "12,5" into proposal A's fixed amount
Then A's IVA and total update right away, along with its difference and percentage. Input must match `^\d*([.,]\d{0,2})?$`, and characters that break the pattern are dropped. The keypad is decimal.

### Scenario 4: Fixed amounts persist for the study
Given fixed amounts were typed
When the Broker reloads, or the silent refresh replaces the session
Then the amounts are kept for titles that still exist and dropped for titles that are gone. A new study clears them.

### Scenario 5: Best option card
Given at least one proposal is cheaper than the customer
Then a green card shows "Mejor opción: {title}" and "Ahorro estimado de {delta %.2f} € al año frente a sus condiciones actuales." The space before € is a no-break space. The card follows `bestProposalAmong` and is hidden when it returns null.

### Scenario 6: Empty state
Given the study has no proposals (`proposals: []`, or none parse)
Then the screen shows only "Aún no hay propuestas que comparar."

## Repository Research

### Files Inspected
- `../BmApp/.../views/proposals/{ProposalsScreen,ProposalsUiState,ProposalsViewModel}.kt`: layout, best-card colours (`#DCFCE7` bg, `#166534` content), `%.2f %%` labels, the best saving via `round` + `%.2f`, and visibility defaulting to true.
- `../BmApp/.../views/comparator/{ComparatorProposalsView,UserConsumptionDataView}.kt` and `customerconditions/CustomerConditionsColumnView.kt`: column widths (400dp labels, 200dp other columns, 12dp gap) and all fixed Spanish labels.
- `../BmApp/.../views/pricetable/{PriceProposalColumn,MiddleEllipsize}.kt` and `components/tables/{ExtraServicesAndTaxesRow,DynamicTableColumnView}.kt` and `views/common/TwoColumnTable.kt`.
- `../BmApp/.../res/values-es/strings.xml`: `proposals_best_option_*` and `proposals_empty_message`.
- `../BmApp/data/.../ConsumptionSessionRepositoryImpl.kt`: `setProposalFixedAmount` only for known titles, and `synchronizeProposalOverrides` on every report.
- `src/lib/comparator/{calculate,proposal,rounding}.ts`: `calculateComparatorSummary`, `bestProposalAmong`, `toTwoDecimals`, `formatFixedHalfUp`.
- `src/components/gate/fee-first-gate-provider.tsx`: session, conditions, `startNewStudy`.
- `src/lib/gate/storage.ts`: `clearStudyStorage`.
- `src/app/(app)/proposals/page.tsx`: placeholder.
- `src/app/(app)/current-conditions/page.tsx` and `src/components/conditions/current-conditions-form.tsx`: page and section-header patterns, `HighlightHeader`.
- `e2e/current-conditions.spec.ts`: mocked report fixture.
- `DESIGN.md`: sticky first column and token-only colours.

### Existing Patterns To Follow
- Thin page, with components under `src/components/<area>/` and pure helpers under `src/lib/<area>/` with Vitest.
- Spanish copy lives in a `messages.ts` per area.
- Colours come only from tokens. New hex values go into `globals.css` and are added to the token parity test when BmApp defines them; `--gate-*` is the precedent.

### Current Gaps
- No Kotlin `Double.toString` formatter for display (`4.6` → `"4.6"`, `5` → `"5.0"`, small values → `"1.0E-4"`). Add `kotlinDoubleToString` in `src/lib/comparator/format.ts`.
- No persisted fixed-amount state.
- No E2E fixture with proposals. The proposal JSON shape is the `ProposalPrice` input fields from `proposal.ts`.

## Technical Approach

1. **`src/lib/comparator/format.ts`** (with tests): `kotlinDoubleToString` (Java `Double.toString` rules: at least one decimal; scientific notation below 1e-3 or at 1e7 and above), `percentLabel(x)` = `formatFixedHalfUp(x,2)+" %"`, `sixDecimals`, `deltaLabel(delta, pct?)`, `middleEllipsize(title)`, and `isValidFixedAmountInput`.
2. **Fixed-amount state**: add `proposalFixedAmounts: Record<string,string>` and `setProposalFixedAmount(title, value)` to `FeeFirstGateProvider`, persisted in localStorage under `bm.proposalFixedAmounts` (`storage.ts`) and removed in `clearStudyStorage`. When the session's proposals change, keep only the current titles, using `toProposalPrices(session.proposals)` titles (port of `synchronizeProposalOverrides`). The setter ignores unknown titles.
3. **Components** in `src/components/proposals/`:
   - `proposals-table.tsx`: a horizontal scroll container (`overflow-x-auto`) holding a row of columns. The first column is `sticky left-0 z-10 bg-background`. To fit 390px, the labels column is narrower than BmApp's 400dp, about 150–170px with wrapped text; record this as a deliberate mobile adaptation. Other columns are about 168px. Every row keeps a fixed height so rows line up across columns; use a shared row-height constant per section, since columns are separate flex stacks as in BmApp. A CSS grid with `grid-auto-flow: column` per section is an acceptable alternative.
   - `consumption-labels-column.tsx`, `customer-conditions-column.tsx`, `proposal-column.tsx` (input: `inputMode="decimal"`, 16px font, `aria-label="Importe fijo {title}"`), `best-proposal-card.tsx`.
   - `src/lib/proposals/messages.ts`: every Spanish string listed above.
4. **Page** `src/app/(app)/proposals/page.tsx`: memoize `calculateComparatorSummary(session, conditions, fixedAmounts)`, `visible = summary.proposals`, and `best = bestProposalAmong(summary, visible)`. Render the `<h1>Propuestas</h1>`, then the empty state or the table plus the card.
5. **Tokens**: in `globals.css`, add `--best-option-bg/#DCFCE7`, `--best-option-fg/#166534` and `--delta-negative/#D32F2F` (positive delta uses black, `--delta-positive/#000000`, BmApp parity), with dark-mode equivalents only if BmApp defines them. Otherwise keep the same values and note it. Extend `theme-tokens.test.ts`.

## Expected File Changes
- `src/lib/comparator/format.ts` and `format.test.ts`: create.
- `src/lib/proposals/messages.ts`: create.
- `src/components/proposals/*.tsx` plus `proposals-table.test.tsx` (RTL rendering, fixed-amount input): create.
- `src/components/gate/fee-first-gate-provider.tsx` and its test: modify; fixed amounts and sync.
- `src/lib/gate/storage.ts` and its test: modify; new key, cleared with the study.
- `src/app/(app)/proposals/page.tsx`: replace.
- `src/app/globals.css`, `src/app/theme-tokens.test.ts`: modify; tokens.
- `e2e/proposals.spec.ts`: create.
- `DESIGN.md`, `docs/domain-model.md`, `feature_list.json`, `PROGRESS.md`: update.

## Visual Design Impact
- UI involved: yes. Source: BmApp Compose views (listed above) and `DESIGN.md`.
- States: table with customer prices, table without them (customer column empty, difference "--", no card), empty state, and red/black difference lines.
- Mobile adaptations to document in `DESIGN.md`: sticky narrow labels column, narrower columns than 200dp, and fixed amounts persisted across reloads.

## Durable Documentation Impact
- `ARCHITECTURE.md` / `CONSTRAINTS.md`: not needed; neither exists and there is no new boundary.
- `AGENTS.md`: not needed.
- `DESIGN.md`: update with the comparator layout adaptations and the new tokens.
- `docs/domain-model.md`: update the fixed-amount rules (per study, per proposal title, kept on refresh, cleared with the study).

## Implementation Plan
1. Format helpers and tests.
2. Fixed-amount state, storage and sync, with tests.
3. Columns, table and card; then the page.
4. Tokens.
5. E2E, the mobile screenshot check and the docs.

## Implementation Tasks
- [ ] `format.ts` tests: `kotlinDoubleToString(4.6)="4.6"`, `(5)="5.0"`, `(0.0001)="1.0E-4"`, `(0.123456)="0.123456"`; `percentLabel(5.11269632)="5.11 %"`; `deltaLabel(-29.51,-10)="-29.51€ (-10%)"`; `deltaLabel(undefined)="--"`; the 17-char middle-ellipsis example.
- [ ] Provider/storage tests: set, persist, reload, sync drops unknown titles, `startNewStudy` clears.
- [ ] RTL test: column order, input filter, recalculated total after typing.
- [ ] Page and components following `DESIGN.md` tokens.
- [ ] `e2e/proposals.spec.ts`, using the mocked report from `current-conditions.spec.ts` with a 3.0TD study and two proposals, one cheaper and one dearer. Fill conditions, then tap "Ir a las propuestas de precios" and mock `collected-prices` 201. Assert:
  - the customer total and both proposal totals match values precomputed by hand or by `calculateComparatorSummary` in the test;
  - the difference text and colour class;
  - the best card text;
  - typing a fixed amount updates the total and survives a reload;
  - the first column stays visible after `scrollLeft` (bounding box x unchanged);
  - `document.documentElement.scrollWidth <= innerWidth`;
  - the empty state appears with `proposals: []`.

## Verification Plan
- `./init.sh`: green.
- `npm run test:e2e:quick -- e2e/proposals.spec.ts` while iterating.
- A full `npm run test:e2e` once at the end (android-chromium; 15-minute timeout; no piping).
- Mobile viewport check: the E2E runs on the Pixel-class android-chromium project. Capture one screenshot at 390px, and capture the dark scheme as well.
- Parity check (feature verification "same CUPS shows same values as Android"): manually on local QA, with the same CUPS and prices in BmApp and on the web, compare the customer total, each proposal total and each difference. Record this in `PROGRESS.md`. If it is not possible, list it as open for `qa-real-device-checks`.

## Evidence To Capture
- Vitest count, focused and full E2E results, the screenshot path, and the manual parity result or a note that it was deferred.

## Validator Checklist
- [ ] Every number comes from `src/lib/comparator`, and the display formatting matches BmApp (`Double.toString`, `%.6f`, `%.2f`, `%.2f %`, `€` suffix, delta text and colours).
- [ ] The sticky first column works and the page does not overflow sideways at 390px.
- [ ] The fixed-amount input filter and persistence/sync rules are implemented and tested.
- [ ] The best card and empty state copy match BmApp `values-es`.
- [ ] There is no copy sheet, visibility, PDF or analytics.
- [ ] Only tokens are used for colours, and `DESIGN.md` is updated.
- [ ] `feature_list.json` and `PROGRESS.md` are updated.
