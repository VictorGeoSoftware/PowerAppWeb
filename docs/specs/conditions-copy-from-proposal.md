# Feature Implementation Spec: Copy prices from a proposal

## Source Feature

- `id`: conditions-copy-from-proposal
- `area`: conditions
- `depends_on`: current-conditions-form, comparator-calculation (both accepted)
- `status`: not_started
- `source`: `feature_list.json` (split from `proposals-table` on 2026-10-19)

## Goal

On **Condiciones actuales**, add BmApp's "Copiar precios de una propuesta" button. It opens a bottom sheet that lists the study's proposals. Confirming a choice overwrites the power and energy prices and the extra services in the Current Conditions with that proposal's values, then shows "Precios copiados desde {title}". The port must reproduce `CurrentUserConditionsView.CopyProposalPricesSheet` and `CurrentUserConditionsViewModel.copyPricesFromProposal` exactly.

## Non-Goals

- No tariff compatibility filtering. BmApp shows the helper text "Solo se muestran propuestas compatibles con tu tarifa." but lists **all** `session.proposals`; keep that behavior.
- No per-proposal metadata line. The `copy_sheet_item_metadata` string exists in BmApp but is unused.
- Do not change the supplier (`companyName`), holder, address or fixed amounts.
- No changes to the comparator table or calculations.
- No new toast library.

## Job Story

When my customer's current contract matches one of the proposals,
I want to copy that proposal's prices into the current conditions,
so I don't have to type eight or more prices by hand.

## Users And Permissions

- Broker on `/current-conditions` with a session (stages `CURRENT_CONDITIONS_REQUIRED` and `UNLOCKED`). This is client-only; there are no backend calls.

## Acceptance Scenarios

### Scenario 1: Button placement
Given a session is loaded
Then directly under the "CONDICIONES ACTUALES" header, above "TÉRMINO DE POTENCIA", there is a full-width pill button, 48px or taller, with a copy icon and the label "Copiar precios de una propuesta". It uses the `secondary` fill, as in BmApp; it is not yellow.

### Scenario 2: Open the sheet
Given the study has proposals A and B
When the Broker taps the button
Then a bottom sheet opens fully expanded. It shows the title "Copiar precios desde propuesta", the subtitle "Selecciona una propuesta para copiar sus precios en las condiciones actuales.", the label "Propuestas disponibles", a radio list of all proposal titles (scrollable, max height 320px), the helper "Solo se muestran propuestas compatibles con tu tarifa.", and the buttons "Cancelar" (text) and "Copiar" (filled).
The preselected item is the previous selection if that title still exists; otherwise it is the first proposal.

### Scenario 3: Copy
When the Broker selects B and taps "Copiar"
Then the sheet closes and the conditions become:
- `powerTermPriceByPeriod`: one entry per `session.powerPeriods[i]`, set to `toDecimalInput(B.powerTermItems[i])`;
- `energyPriceByPeriod`: one entry per `session.energyPeriods[i]`, set to `toDecimalInput(B.consumedEnergyItems[i])`;
- `extraServices` = `formatFixedHalfUp(B.extraServices, 2)`;
- `companyName` is unchanged.

The fields show the new values right away, the gate banner recalculates and the values persist (localStorage). A message "Precios copiados desde B" appears for about 2.5 seconds.

### Scenario 4: Decimal input format
`toDecimalInput(v)` is Java `%.8f` (half-up), then trailing zeros trimmed, then a trailing "." trimmed, with blank becoming "0". A missing item (index past the end) becomes "". Examples: 0.123456 → "0.123456", 0.1 → "0.1", 5 → "5", 0 → "0", 0.000000004 → "0", 0.000000005 → "0.00000001".

### Scenario 5: No proposals
Given `session.proposals` is empty or nothing parses
Then the button is still visible, as in BmApp, but tapping it does nothing: no sheet and no message.

### Scenario 6: Cancel
When the Broker taps "Cancelar", the overlay or Escape
Then the sheet closes and the conditions are unchanged.

## Repository Research

### Files Inspected
- `../BmApp/.../currentuserconditions/CurrentUserConditionsView.kt`, lines 60–150 (sheet state, preselection, toast), 156–255 (`CopyProposalPricesSheet`) and 411–455 (`CurrentConditionsHeader` button).
- `../BmApp/.../currentuserconditions/CurrentUserConditionsViewModel.kt`: `copyPricesFromProposal`, `toDecimalInput`, and extra services as `%.2f`.
- `../BmApp/.../currentuserconditions/CurrentUserConditionsUiState.kt`: `availableProposals = session.proposals` and `canCopyFromProposal`.
- `../BmApp/app/src/main/res/values/strings.xml`, lines 19–26 (Spanish copy_* strings and "Cancelar") and `values-es/strings.xml` line 57 (the button label). `values-es` has no override for the sheet strings.
- `src/components/conditions/current-conditions-form.tsx`: `HighlightHeader` for `CONDITIONS_TITLE`, `update()`, `useFeeFirstGate`.
- `src/lib/conditions/messages.ts`: copy constants.
- `src/components/ui/sheet.tsx`: shadcn Sheet on Base UI Dialog, with `side="bottom"` support; used by `app-menu.tsx`.
- `src/lib/comparator/{proposal,rounding}.ts`: `toProposalPrices`, `formatFixedHalfUp`.
- `e2e/current-conditions.spec.ts`: mocked report fixture with `proposals: []`.

### Existing Patterns To Follow
- Pure helpers in `src/lib/conditions/` with Vitest; Spanish strings in `messages.ts`.
- Form state is written through `setConditions` (persisted by the provider).
- Icons come from `lucide-react` (`Copy`).

### Current Gaps
- No toast or snackbar exists. Use a small `role="status"` `aria-live="polite"` message rendered by the form, positioned fixed above the bottom safe area, using tokens, and auto-hiding after 2500 ms.
- Index alignment trap (BmApp parity): items are matched by **index** against the session's zero-filtered period rows, not by period name. Replicate it and do not "fix" it.

## Technical Approach

1. **`src/lib/conditions/copy-from-proposal.ts`**:
   - `toDecimalInput(v?: number): string` as defined in Scenario 4.
   - `copyPricesFromProposal(session, conditions, title): CurrentConditions | null`. It parses `toProposalPrices(session.proposals)`, finds the first proposal with the title, and returns null if there is none. Otherwise it builds the new conditions as in Scenario 3, keeping `conditions?.companyName ?? null`.
   - `initialSelection(proposals, previous)`.
2. **`src/components/conditions/copy-proposal-prices-sheet.tsx`**: a controlled `Sheet` with `side="bottom"`, containing the title, subtitle, list label, a `role="radiogroup"` list of `role="radio"` rows (whole row clickable, ≥44px), the helper, and full-width "Cancelar" and "Copiar" buttons. "Copiar" is disabled when there is no selection. Respect the bottom safe area.
3. **`current-conditions-form.tsx`**: hold `isSheetOpen`, `selectedTitle` and `notice` state. Render the copy button under the `CONDITIONS_TITLE` header. On confirm, call `setConditions(result)`, close the sheet and set the notice `copySuccess(title)`, cleared by a timeout that is also cleared on unmount.
4. **`messages.ts`**: add `COPY_PRICES_ACTION`, `COPY_SHEET_TITLE`, `COPY_SHEET_SUBTITLE`, `COPY_SHEET_LIST_LABEL`, `COPY_SHEET_HELPER`, `COPY_BUTTON`, `CANCEL` and `copySuccess(title)`, using the exact strings above.

## Expected File Changes
- `src/lib/conditions/copy-from-proposal.ts` and `.test.ts`: create.
- `src/components/conditions/copy-proposal-prices-sheet.tsx`: create.
- `src/components/conditions/current-conditions-form.tsx` and its test: modify.
- `src/lib/conditions/messages.ts`: modify.
- `e2e/current-conditions.spec.ts`, or a new `e2e/copy-from-proposal.spec.ts`: add scenarios.
- `docs/domain-model.md`, `feature_list.json`, `PROGRESS.md`: update.

## Visual Design Impact
- UI involved: yes. Source: the BmApp Compose code above and `DESIGN.md`. Token-only colours: `bg-secondary text-secondary-foreground` for the pill. No new tokens are expected.
- States: closed, sheet open with a selection, the copied notice, and no proposals (no-op).

## Durable Documentation Impact
- `ARCHITECTURE.md` / `CONSTRAINTS.md`: not needed.
- `AGENTS.md`: not needed.
- `DESIGN.md`: update with one line saying transient notices use an inline `role="status"` message in place of the Android Toast.
- `docs/domain-model.md`: update with the copy rule (index-aligned, `%.8f` trimmed, extra services `%.2f`, supplier kept).

## Implementation Plan
1. Pure helper and tests.
2. Sheet component.
3. Form wiring and notice.
4. E2E and docs.

## Implementation Tasks
- [ ] `toDecimalInput` tests for each example in Scenario 4, plus `undefined` → "".
- [ ] `copyPricesFromProposal` tests: 3.0TD with 6/6 items; fewer items than periods gives "" for the missing ones; unknown title → null; supplier kept; extra services 12.5 → "12.50".
- [ ] `initialSelection` tests: keeps a valid previous selection, falls back to the first proposal.
- [ ] RTL: button visible, sheet opens with the first proposal preselected, Copiar fills the inputs, Cancelar leaves them unchanged, no proposals means no sheet.
- [ ] E2E (android-chromium): mocked report with two proposals and empty conditions. Open the sheet, choose the second proposal, Copiar. Assert the input values for "Potencia P1" etc., the notice text, and that the banner shows unlocked once the supplier is typed. Reload and assert the values persist. Add one empty-proposals case.

## Verification Plan
- `./init.sh`: green.
- `npm run test:e2e:quick -- e2e/<spec>.spec.ts` while iterating.
- A full `npm run test:e2e` once at the end (android-chromium; 15-minute timeout; no piping).
- Mobile check: the sheet fits at 390px with Cancelar and Copiar visible without scrolling for 2–6 proposals (screenshot from the E2E run).

## Evidence To Capture
- Vitest count, focused and full E2E results, the screenshot path.

## Validator Checklist
- [ ] Strings match BmApp exactly, the button sits under "CONDICIONES ACTUALES", and all proposals are listed.
- [ ] The copy is index-aligned, uses `%.8f` trimmed values, extra services `%.2f`, and keeps the supplier.
- [ ] Preselection, cancel and the no-proposals no-op behave as specified.
- [ ] The notice is accessible and auto-hides; no toast dependency was added.
- [ ] Docs and `feature_list.json`/`PROGRESS.md` are updated, and nothing outside this scope changed.
