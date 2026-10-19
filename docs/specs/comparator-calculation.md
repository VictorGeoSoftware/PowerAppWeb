# Feature Implementation Spec: Comparator calculation parity

## Source Feature

- `id`: comparator-calculation
- `area`: comparator
- `depends_on`: bootstrap-nextjs-app (accepted)
- `status`: not_started
- `source`: `feature_list.json`

## Goal

Provide a pure TypeScript port of BmApp's comparator pricing rule. The port gives the same comparison numbers as Android for the same study, current conditions and fixed amounts. It is backed by golden cases produced by the Android Kotlin code itself. `proposals-table`, `proposals-configuration` and the PDFs will consume it.

**Decision (resolves the open question in `docs/risks-and-open-questions.md`): port to the client.** The logic is small and pure, roughly 150 Kotlin lines (`ProposalCalculationHelper`, `CalculateComparatorSummaryUseCase`, `SelectUncompetitiveProposalsUseCase`, and the proposal mapping in `ConsumptionReportMapper`/`FormatUtils`). It runs on every keystroke and needs no network. Moving it to the backend would mean changing BmApp and BmBackend, which is out of scope. Golden tests generated from the Android sources contain the drift risk.

## Non-Goals

- No UI: no `/proposals` table, formatting for display, sticky columns or copy-prices sheet (`proposals-table`).
- No proposal visibility state or auto-hide application (`proposals-configuration`). Only the pure selection function is ported.
- No PDF (`comparator-pdf-share`).
- No changes to BmApp or BmBackend. BmApp is compiled read-only by the golden generator.

## Job Story

When I compare proposals against my customer's current prices,
I want exactly the numbers the Android app shows,
so that brokers on either client never quote different savings.

## Users And Permissions

- Broker: no access rules. The code is a pure library with no user-visible surface yet.

## Acceptance Scenarios

### Scenario 1: Golden parity
Given each golden case (session, conditions, fixed amounts) produced by running the BmApp Kotlin sources
When `calculateComparatorSummary` runs in TypeScript
Then every output field equals the Kotlin output: numbers by strict equality and two-decimal strings character for character.

### Scenario 2: No customer prices
Given a session and conditions where all prices are empty or zero, or conditions are null
Then the customer column is the empty column, `customerTotalAnnualPrice` is 0, and the delta and savings maps are empty. Proposals are still recalculated with their fixed amounts.

### Scenario 3: No session
Given `session == null`
Then the result is the empty summary.

### Scenario 4: Fixed amount
Given a fixed amount of "12,5" for proposal A and IVA 21
Then A's `iva` increases by 12.5 × 0.21 and `totalAnnualPrice` by 12.5, both rounded to 2 decimals. Amounts that are ≤ 0, blank or unparseable leave A unchanged.

### Scenario 5: Best proposal and uncompetitive selection
Then `bestProposalAmong` and `selectUncompetitiveProposals` (threshold 15, and the cheapest proposal is kept when all are uncompetitive) match the Kotlin results for the golden cases.

## Repository Research

### Files Inspected
- `../BmApp/domain/.../calculations/ProposalCalculationHelper.kt`: fixed-amount recalculation, delta, savings %.
- `../BmApp/domain/.../usecases/CalculateComparatorSummaryUseCase.kt`: customer column. Power cost is kW × €/kW·day × 365, energy cost is kWh × €/kWh. IVA and the electricity tax are applied to the base cost. Extra services are added without IVA.
- `../BmApp/domain/.../usecases/SelectUncompetitiveProposalsUseCase.kt`: hide rule.
- `../BmApp/domain/.../models/{ComparatorSummaryModel,CustomerConditionsColumnModel,ProposalPriceModel,ConsumptionSessionModel,ConsumptionReportModel}.kt`
- `../BmApp/data/.../ConsumptionSessionRepositoryImpl.kt:56-70`: **energy rows are `toInt()` (truncated)** after zero-filtering. Power rows stay doubles.
- `../BmApp/data/.../utils/ConsumptionReportMapper.kt` and `FormatUtils.kt`: the proposal mapping rounds power/energy items with `%.6f`. `annualPowerTermCost`, `annualEnergyCost`, `electricalTax` and `totalAnnualPrice` use `%.2f`. `extraServices` and `iva` are left raw.
- `../BmApp/domain/src/test/.../SelectUncompetitiveProposalsUseCaseTest.kt`: existing cases to mirror.
- `src/lib/consumption/report.ts`: `toConsumptionSession`. It keeps energy as floats and keeps `proposals: unknown[]`.
- `src/lib/gate/fee-first.ts`: `ConsumptionSession`, `CurrentConditions`, `PeriodValue`.
- `src/lib/conditions/collected-prices.ts`: existing BmApp-port module style.

### Existing Patterns To Follow
- Pure modules in `src/lib/<area>/` with colocated Vitest tests and a header comment naming the BmApp source.
- Reuse the session and conditions types from `fee-first.ts`. Do not change the persisted session shape.

### Current Gaps / Parity Traps (must be handled explicitly)
- **Rounding:** Kotlin `kotlin.math.round` rounds half to **even**. JS `Math.round` rounds half up. `roundToInt()` is half-up (`Math.floor(x + 0.5)`), which matches `Math.round` for these values. Java `String.format("%.2f")` and `"%.6f"` round HALF_UP on the decimal expansion of the double, while JS `toFixed` can differ on values like `1.005`. Implement `roundHalfEven(x*100)/100` and `formatFixedHalfUp(x, d)`, then prove them against goldens that deliberately include tie and boundary values.
- Energy kWh must be truncated to an integer (`Math.trunc`) inside the calculation. The web session keeps floats such as 1234.7. Truncate in the calculator; do not change `report.ts`.
- Kotlin `toDoubleOrNull` accepts some inputs `Number()` rejects or reads differently, for example `"1."`, `".5"`, `" "`, `"1e3"` and `"0x10"`. Inputs are already restricted by `isValidDecimalInput`, but goldens must cover `"1."`, `",5"` and `""`.
- `Map` iteration order is irrelevant. Use `Record<string, …>` keyed by `proposalTitle`. Kotlin's last-wins behavior applies to duplicate titles.
- No golden infrastructure exists yet. `kotlinc` (`/opt/homebrew/bin/kotlinc`) and JDK 17 are available locally.

## Technical Approach

1. **`src/lib/comparator/proposal.ts`**: `ProposalPrice` type, the same 9 fields as `ProposalPriceModel`. Add `toProposalPrice(raw: unknown)`, a port of `ProposalPriceData.mapToDomain`. Items use `parseFloat(formatFixedHalfUp(v, 6))`. The 4 cost fields use `formatFixedHalfUp(v, 2)`. `extraServices` and `iva` stay raw. Invalid entries are skipped.
2. **`src/lib/comparator/rounding.ts`**: `roundHalfEven`, `roundToTwoDecimals` (Kotlin `round(x*100)/100`), `roundToInt`, `formatFixedHalfUp(x, digits)` matching Java `%.nf`, and `parseDecimal`, which ports the Kotlin `String?.parseDecimal()` and returns 0.0 on failure.
3. **`src/lib/comparator/calculate.ts`**: `recalculateProposalWithAdditionalAmount`, `calculateAnnualPriceDelta`, `calculateAnnualSavingsPercentage`, `calculateComparatorSummary(session, conditions, fixedAmountByTitle)` returning `ComparatorSummary`, `bestProposalAmong`, and `selectUncompetitiveProposals(summary, threshold = 15)`. Follow the Kotlin structure line by line, including the summation order (`sumOf` from left to right), so floating-point sums match.
   - Session input: `powerRows` and `energyRows` from `ConsumptionSession`, with energy values passed through `Math.trunc`. `ivaPercent = session.iva ?? 0`, `electricTaxPercent = session.electricTaxPercent ?? 0`. Proposals are `(session.proposals ?? []).map(toProposalPrice)`.
4. **Golden generator** (committed, reproducible, BmApp untouched):
   - `scripts/golden/ComparatorGolden.kt`: a `main` function that builds about 25 hand-designed cases with the BmApp domain models and calls `CalculateComparatorSummaryUseCase.Factory.create(ProposalCalculationHelper())`, `SelectUncompetitiveProposalsUseCase` and `bestProposalAmong`. It applies the `FormatUtils` mapping to the raw proposal input, then prints JSON with a small hand-written serializer to avoid dependencies. Use `Double.toString` / `java.lang.Double` repr, then parse in JS with `Number(...)` for an exact round trip.
   - `scripts/golden/generate-comparator-golden.sh`: run `kotlinc` on the listed BmApp source files plus the generator, `-include-runtime -d` into a temporary jar, run it, and write `src/lib/comparator/__golden__/comparator-cases.json`. Fail if any listed source path is missing.
   - Cases must cover 2.0TD (2 power/3 energy periods), 3.0TD (6/6), fractional kWh (truncation), comma decimals, `"1."`, empty strings, IVA 21/10/5, electricity tax 5.11269632, half-even ties in power cost (for example a cost ending in exact .xx5), `%.2f` ties, zero and negative fixed amounts, a proposal more expensive than the customer, all proposals uncompetitive, no customer prices, and duplicate titles.
5. **`src/lib/comparator/calculate.golden.test.ts`**: load the JSON and assert deep equality for each case.

## Expected File Changes
- `src/lib/comparator/{rounding,proposal,calculate}.ts`: create.
- `src/lib/comparator/{rounding,proposal,calculate}.test.ts`: create. Unit tests cover the scenarios plus the rounding trap table.
- `src/lib/comparator/calculate.golden.test.ts`, `src/lib/comparator/__golden__/comparator-cases.json`: create.
- `scripts/golden/ComparatorGolden.kt`, `scripts/golden/generate-comparator-golden.sh`: create.
- `docs/risks-and-open-questions.md`: update by closing the open question (decision: client port with goldens) and keeping the drift risk with its mitigation.
- `docs/domain-model.md`: add a Comparison rules line naming the code location and the energy truncation.
- `README.md`: add one line on how to regenerate goldens.
- `feature_list.json`, `PROGRESS.md`: evidence.

## Visual Design Impact
- UI involved: no.

## Durable Documentation Impact
- `ARCHITECTURE.md` / `CONSTRAINTS.md`: not needed; neither exists and this adds no new boundary.
- `AGENTS.md`: not needed. The workflow is unchanged, and the regeneration command goes in `README.md`.
- `docs/risks-and-open-questions.md`, `docs/domain-model.md`, `README.md`: update as listed above.

## Implementation Plan
1. Write the golden generator and produce the JSON first, since it is the source of truth.
2. Port rounding and parsing, with unit tests against the known Java/Kotlin trap values.
3. Port the proposal mapping and the calculator.
4. Add the golden test and iterate until every case matches exactly.
5. Update the docs and record evidence.

## Implementation Tasks
- [ ] Generator `.kt` and `.sh`. Run it and commit the JSON, which needs at least 20 cases.
- [ ] `rounding.ts` and its tests: `roundHalfEven(0.5)=0`, `(1.5)=2`, `(2.5)=2`, `(-2.5)=-2`. `formatFixedHalfUp(1.005,2)` must equal Java's output, as recorded in the goldens. `parseDecimal` cases: `"1,5"`, `"1."`, `""`, `"abc"`.
- [ ] `proposal.ts` and its tests, covering the mapping precision and invalid-entry skipping.
- [ ] `calculate.ts` and its tests, covering scenarios 2–5.
- [ ] Golden test green.
- [ ] Docs updates.

## Verification Plan
- `scripts/golden/generate-comparator-golden.sh` runs cleanly. Regenerating it twice yields an identical JSON (`git diff --exit-code`).
- `./init.sh`: lint, typecheck and vitest green, including the golden test.
- E2E: not needed. No route, UI, auth or API flow changes, and the parity proof is the golden unit test. `proposals-table` will add E2E. Run no Playwright for this feature.
- Negative check: temporarily replace `roundHalfEven` with `Math.round`, or remove the energy truncation, and confirm that at least one golden case fails. Then revert.

## Evidence To Capture
- Golden case count, vitest totals, the result of the negative check and the regeneration command, recorded in `feature_list.json` and `PROGRESS.md`.

## Validator Checklist
- [ ] The goldens were produced by compiling the actual BmApp source files, not re-typed logic.
- [ ] The golden test compares every field with exact equality.
- [ ] Energy truncation, half-even rounding, `%.2f`/`%.6f` mapping and the raw `iva`/`extraServices` fields are handled.
- [ ] There are no UI, persistence or BmApp/BmBackend changes.
- [ ] The open-question decision is recorded in the docs.
- [ ] `feature_list.json` and `PROGRESS.md` are updated.
