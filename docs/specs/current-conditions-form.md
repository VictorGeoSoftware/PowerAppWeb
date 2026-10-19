# Feature Implementation Spec: Current Conditions form

## Source Feature

- `id`: current-conditions-form
- `area`: conditions
- `depends_on`: consumption-by-cups-manual (accepted)
- `status`: not_started
- `source`: `feature_list.json`

## Goal

Replace the `/current-conditions` placeholder with the BmApp `CurrentUserConditions` form. The broker sees the customer data from the Consumption Report (holder, address, CUPS). They enter the current supplier, a power-term price for each power period, an energy price for each energy period, and an optional annual extra-services amount. Like Android, every valid keystroke is saved straight away. When the form is complete, the Fee-First Gate unlocks and a button takes the broker to Propuestas.

**Parity note.** The feature entry mentions "taxes" and a "valid save". BmApp has neither: there are no tax inputs and no Save button. IVA and the electricity tax come from the report and are shown only on Proposals. Saving happens on every change. We follow BmApp, because AGENTS.md says behavior must match BmApp. Neither point is a requirement for this slice.

## Non-Goals

- Posting collected prices to the backend. That is `collected-prices-submit`; this feature only leaves a single hook for it in the "Ir a las propuestas" click handler.
- The "Copiar precios de una propuesta" bottom sheet. It needs a typed Proposal model, which `session.proposals` (`unknown[]`) does not have yet. It is deferred to `proposals-table`; record it as a follow-up in that feature's notes.
- Tax fields of any kind (IVA, impuesto eléctrico, alquiler de equipos).
- A supplier picker or list. BmApp uses free text.
- Proposals, Comparator or Configuration content.
- Changes to gate rules, routes or storage keys. The `evaluateGate` semantics already match Android.

## Job Story

When a consumption study has just finished for a customer,
I want to type the customer's current supplier and prices quickly on my phone,
so I can unlock the proposal comparison.

## Users And Permissions

- **Broker** (signed in, granted, bound device): can edit the form only at stage `CURRENT_CONDITIONS_REQUIRED` or `UNLOCKED`. The existing `FeeFirstGateGuard` already enforces this; nothing new is needed.

## Acceptance Scenarios

### Scenario 1: Form renders from the report

Given a completed study with power periods P1–P2 and energy periods P1–P3, holder "ANA" and address "C/ Mayor 1"
When the broker lands on `/current-conditions`
Then the page shows the following:
- Heading "Condiciones actuales"
- Section "DATOS DEL CLIENTE":
  - Titular prefilled with "ANA"
  - Dirección prefilled with "C/ Mayor 1"
  - CUPS shown read-only
  - Comercializadora actual, empty, with placeholder "Introduce la comercializadora"
- Section "CONDICIONES ACTUALES":
  - "TÉRMINO DE POTENCIA" with inputs P1 and P2, placeholder `0.00000000`
  - "ENERGÍA CONSUMIDA" with inputs P1, P2 and P3
- Section "SERVICIOS EXTRA" with "Importe total anual", placeholder `0.00€`
- The gate banner showing:
  - "Propuestas bloqueadas"
  - "Rellena todos los precios de potencia y energía para desbloquear el menú."
  - "0 de 6 campos completados" with a progress bar

The existing "Consumo obtenido" summary card stays on the page, below the form header area.

### Scenario 2: Keystroke filtering (Android `isValidDecimalInput`)

Given any price input or the extra-services input
When the broker types characters that would make the value fail `^\d*([.,]\d{0,8})?$`
Then the value does not change and no error message is shown. For example:
- "a", "-", a second separator and a 9th decimal are all rejected
- "", "5.", ",5" and "0,12345678" are accepted

Pasted text follows the same rule: the whole new value is accepted or rejected as one.

### Scenario 3: Unlock

Given the broker fills a non-blank supplier and every listed period with a value > 0 (comma or dot)
When the last required field becomes valid
Then:
- The banner switches to "Navegación desbloqueada" / "Ya puedes consultar Propuestas y Configuración." and shows "6 de 6 campos completados"
- The menu entries Propuestas and Configuración unlock
- The button "Ir a las propuestas de precios" appears

Tapping that button navigates to `/proposals`.

### Scenario 4: Re-lock

Given an unlocked form
When the broker clears a price or sets it to "0"
Then the banner goes back to the locked state, the button disappears and Propuestas locks again.

### Scenario 5: Persistence

Given the broker has entered a supplier and prices
When the page is reloaded (the session is restored from `bm.lastCompletedJobId`)
Then:
- The supplier, prices and extra services are restored from `localStorage["bm.currentConditions"]`, raw strings with commas kept
- Holder and address revert to the report values, because Android keeps them in memory only

"Nuevo estudio" or logout clears everything, which is existing behavior.

### Scenario 6: Holder and address edits

Given the broker edits Titular or Dirección
When they navigate within the app (without reloading)
Then the edited values are kept in the in-memory session. They are not validated and are not part of the gate count.

### Scenario 7: iOS keyboard

Given an iPhone
When a price or extra-services input is focused
Then the decimal keypad opens (`inputMode="decimal"`, `type="text"`) and the page does not zoom (font ≥ 16px).

## Repository Research

### Files Inspected

- `src/app/(app)/current-conditions/page.tsx`: the placeholder to replace.
- `src/lib/gate/fee-first.ts`:
  - `ConsumptionSession` (holderName, address, cups, powerPeriods, energyPeriods)
  - `CurrentConditions` (string maps, `companyName: string | null`)
  - the private `isFilledPrice`
  - `evaluateGate` (returns required/completed)
  - `ROUTES`
- `src/components/gate/fee-first-gate-provider.tsx`: `useFeeFirstGate()` exposes `session`, `conditions`, `setSession`, `setConditions` (persists through `storage.ts`), `required`, `completed` and `stage`.
- `src/lib/gate/storage.ts`: the `bm.currentConditions` localStorage key, cleared on new study and on logout.
- `src/components/consumption/cups-form.tsx`: the form pattern:
  - controlled `useState`, `noValidate`
  - `useId` with `aria-describedby`
  - `h-12 text-base` inputs
  - `size="lg" h-12 w-full` buttons
- `src/components/ui/{input,label,button}.tsx`: the available primitives.
- `src/components/consumption/consumption-summary.tsx`: the existing summary card.
- `e2e/fixtures.ts` and `e2e/consumption-cups.spec.ts`: `openSignedIn` and the inline `page.route` mocks for the report.
- `e2e/fee-first-gate.spec.ts`: the existing `/current-conditions` assertions.
- `DESIGN.md` §69–72: touch targets ≥ 44px, inputs ≥ 16px, numeric keyboards for prices.
- BmApp (read-only), all under `app/.../currentuserconditions/` unless noted:
  - `CurrentUserConditionsView.kt` (L134–150, L297–464)
  - `CurrentUserConditionsViewModel.kt` (L70–166)
  - `domain/.../usecases/EvaluateFeeFirstGateUseCase.kt`
  - `app/.../ui/views/feefirst/FeeFirstGateBanner.kt`
  - `app/src/main/res/values-es/strings.xml`

### Existing Patterns To Follow

- Pure logic lives in `src/lib/**` with a sibling `*.test.ts`. Components live in `src/components/<area>/` with a `*.test.tsx`.
- Gate state flows only through `useFeeFirstGate()`. Do not add a new store.
- Spanish copy is kept as constants in a messages module (as in `src/lib/consumption/messages.ts`).

### Current Gaps

- No decimal-input helper and no `inputMode="decimal"` usage yet.
- The provider has no way to update holder or address. A small `updateSession`/`setSession({...session, holderName})` call is enough, because `setSession` already exists.
- No gate banner component exists. It is new UI, ported from `FeeFirstGateBanner.kt`.

## Technical Approach

1. **`src/lib/conditions/decimal-input.ts`**
   - `isValidDecimalInput(v)` using exactly the Android regex.
   - Export the gate's `isFilledPrice` from `fee-first.ts` (or move it here and re-import), so the UI and the gate share one rule.
2. **`src/lib/conditions/messages.ts`**: every Spanish string above, copied verbatim from BmApp `values-es`.
3. **`src/components/conditions/current-conditions-form.tsx`**
   - Reads `session`, `conditions`, `required` and `completed` from `useFeeFirstGate()`.
   - Renders the three sections, plus one row per period in `session.powerPeriods` / `session.energyPeriods`. Labels are `P1`…; each `<Label htmlFor>` is linked to its input with an accessible name such as "Potencia P1" / "Energía P1".
   - On change: if `isValidDecimalInput` passes, call `setConditions({...current, energyPriceByPeriod: {...m, [p]: v}})`. If it fails, ignore the change, so the controlled input keeps the old value.
   - Supplier is free text. An empty value is stored as `""`; the gate treats blank as incomplete.
   - Holder and address are controlled from `session`. On change, call `setSession({...session, holderName: v})`. Confirmed at planning time: `setSession` is a plain `useState` setter and does not touch conditions or `resetCount`, so the provider needs no change.
   - Unlock button: `<Button>` "Ir a las propuestas de precios", shown only when `stage === "UNLOCKED"`. It runs `onGoToProposals()` and then `router.push(ROUTES.proposals)`. The handler gets the comment `// collected-prices-submit hooks here`, the single extension point.
4. **`src/components/conditions/fee-first-gate-banner.tsx`**
   - Locked/unlocked title and body, the "%d de %d campos completados" line, and a `role="progressbar"` with `aria-valuenow`/`aria-valuemax`.
   - Styling: the locked state uses DESIGN.md warning tokens, unlocked uses success tokens. Yellow is only ever a background behind dark text.
5. **`page.tsx`**: render the heading, banner, form and `ConsumptionSummary`. Remove "Próximamente.".

## Expected File Changes

- `src/lib/conditions/decimal-input.ts` (+ `.test.ts`): create.
- `src/lib/conditions/messages.ts`: create.
- `src/lib/gate/fee-first.ts`: modify; export or share `isFilledPrice`, with no behavior change.
- `src/components/conditions/current-conditions-form.tsx` (+ `.test.tsx`): create.
- `src/components/conditions/fee-first-gate-banner.tsx` (+ `.test.tsx`): create.
- `src/app/(app)/current-conditions/page.tsx`: modify.
- `src/components/gate/fee-first-gate-provider.tsx`: modify only if holder/address updates need a narrow setter.
- `e2e/current-conditions.spec.ts`: create.
- `e2e/fee-first-gate.spec.ts`: update if the "Próximamente." or placeholder assertions break.

## Visual Design Impact

- UI involved: yes. Design source: `DESIGN.md`, plus the BmApp screen layout as the structural reference.
- States:
  - locked and unlocked banner
  - empty form
  - partially filled form
  - unlocked form with the CTA
  - 2-period and 6-period tariffs
- Mobile-first, single column:
  - section headers use the existing section tokens
  - each period row is the label on the left and the input on the right, `h-12` (≥ 44px), `text-base` (16px)
- No new design artifact is needed.

## Durable Documentation Impact

- `ARCHITECTURE.md`: not needed; no new boundary (the new `src/lib/conditions` follows the existing pattern).
- `CONSTRAINTS.md`: not needed.
- `AGENTS.md`: not needed.
- `docs/domain-model.md`: update with one line. Holder and address edits are session-only and are not persisted. There are no tax inputs; IVA and the electricity tax come from the report.
- `CONTEXT.md`: update the Current Conditions definition. Remove "taxes" as broker input and note that it is report-derived.
- `feature_list.json`:
  - add a `proposals-table` note: "includes BmApp 'Copiar precios de una propuesta' sheet"
  - add a `collected-prices-submit` note: "hook in onGoToProposals"

## Implementation Plan

1. Add the decimal helper, the shared `isFilledPrice` and the messages, with unit tests.
2. Build the banner and form components, with RTL tests.
3. Wire up the page, holder/address updates and the CTA navigation.
4. Add the E2E spec, using mocked report endpoints as in `consumption-cups.spec.ts`.
5. Run the mobile check, update the docs and the harness files.

## Implementation Tasks

- [ ] `isValidDecimalInput` tests: "", "5", "5.", ",5", "1,12345678" accepted; "1.123456789", "a", "-1", "1.2.3", "1,2.3", " 1" rejected.
- [ ] `isFilledPrice` tests: "0", "0,0", "", "abc" give false; "0,1" and ".5" give true.
- [ ] Banner test: locked/unlocked copy, "3 de 6 campos completados", progressbar aria values.
- [ ] Form test, all against the provider with `initialSession`:
  - periods render from the session
  - invalid keystroke leaves the value unchanged
  - valid input persists to `bm.currentConditions`
  - CTA appears only when complete and routes to `/proposals`
  - clearing a price hides the CTA
  - holder edit updates the session
- [ ] Every price input uses `inputMode="decimal"`, has font ≥ 16px and an accessible name.
- [ ] Page: remove the placeholder text; keep `ConsumptionSummary`.
- [ ] `e2e/current-conditions.spec.ts` (signed-in, mocked report):
  - fill the form, then the menu "Propuestas" becomes enabled and the CTA navigates
  - reload keeps the prices
  - zeroing a price re-locks the gate
- [ ] Docs and notes updates as listed above.

## Verification Plan

- `./init.sh` (lint, typecheck, vitest): green, with the new tests counted.
- `npm run build`: OK.
- While iterating: `npm run test:e2e:quick -- e2e/current-conditions.spec.ts` (and `e2e/fee-first-gate.spec.ts`).
- Finally: one full `npm run test:e2e` run with `E2E_EMAIL`/`E2E_PASSWORD`, 15-minute timeout, no piping.
- Mobile check:
  - Playwright WebKit iPhone 13 screenshots of the locked and unlocked states
  - manually on an iPhone over :9003 (or the deployed URL), check that the decimal keypad appears and nothing zooms
  - if no real device is available, record that and defer to `qa-real-device-checks`
- Parity: compare one real QA CUPS side by side with BmApp. Check the same period lists, banner counts and unlock behavior.

## Evidence To Capture

- vitest count and the new test names; build OK.
- Quick and full E2E result lines (pass/skip counts, browsers).
- Paths of the screenshots (locked, unlocked, 6-period) and the outcome of the iOS keypad check.
- Parity note: CUPS used, and the matching period counts in BmApp and the web.

## Validator Checklist

- [ ] There are no tax inputs, no supplier list and no collected-prices POST, so scope is respected.
- [ ] The regex and the > 0 rule match BmApp exactly; invalid keystrokes are silently ignored.
- [ ] The Spanish strings match BmApp `values-es` verbatim.
- [ ] Gate unlock and re-lock work, and the menu reflects them.
- [ ] Prices persist across a reload; holder and address do not; new study and logout clear everything.
- [ ] `inputMode="decimal"`, inputs ≥ 16px and touch targets ≥ 44px.
- [ ] E2E spec added, and the full suite was recorded.
- [ ] `feature_list.json`, `PROGRESS.md`, `CONTEXT.md` and `docs/domain-model.md` updated.
