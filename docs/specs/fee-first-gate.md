# Feature Implementation Spec: Fee-First Gate routing

## Source Feature
- `id`: fee-first-gate · `area`: flow · `depends_on`: app-shell-navigation (accepted)
- `status`: not_started (at planning time) · `source`: `feature_list.json`

## Goal
Port BmApp's Fee-First Gate. The Broker's stage (`CONSUMPTION_REQUIRED` → `CURRENT_CONDITIONS_REQUIRED` → `UNLOCKED`) decides which sections can be reached. Blocked URLs redirect to the current step, and the menu shows locked entries with a padlock and a hint. Later features only have to publish data (consumption session, current conditions); the gate reacts by itself.

## BmApp Reference (inspected via code research)
Paths under `../BmApp/<module>/src/main/java/com/briel/marnisos/brielapp/`:
- `domain/models/FeeFirstStage.kt`, `domain/models/FeeFirstGateModel.kt:10-26`, `domain/usecases/EvaluateFeeFirstGateUseCase.kt:24-53` (stage rules)
- `app/ui/navigation/BmAppRoute.kt:18-58` (allowed stages, `fallbackRoute`), `app/ui/navigation/BmAppNavHost.kt:38-51` (redirect, rule R5)
- `app/ui/views/drawer/DrawerContent.kt`, `app/ui/views/MainStructureView.kt:106-115` (locks, hint, "Nuevo estudio" → `startNewStudy`)
- `app/ui/views/AppShellViewModel.kt:50-59`, `data/repository/ConsumptionStudyRepositoryImpl.kt:73-84` (new study reset)
- `data/local/CurrentUserConditionsLocalDataSource.kt` (conditions persistence)
- Tests: `app/src/test/.../BmAppRouteTest.kt`, `domain/src/test/.../EvaluateFeeFirstGateUseCaseTest.kt`
- Rules R1–R7: `../BmApp/version_1_0_1.md:32-38`

## Rules To Port (exact)
**Stage:**
- No consumption session → `CONSUMPTION_REQUIRED`.
- Otherwise, if current conditions are not complete → `CURRENT_CONDITIONS_REQUIRED`.
- Otherwise → `UNLOCKED`.

**Complete conditions:** `required > 0 && completed == required`.
- Required fields: one price per power period in the session, one per energy period in the session, plus the supplier name (`companyName`).
- A price counts when, after `trim()` and replacing `,` with `.`, it parses as a number `> 0`.
- The supplier counts when it is not blank.
- Extra services never count (R4). Prices for periods that aren't in the session are ignored.

**Routes allowed per stage:**

| Route | Allowed stages |
|---|---|
| `/fetch-consumption` | `CONSUMPTION_REQUIRED` |
| `/current-conditions` | `CURRENT_CONDITIONS_REQUIRED`, `UNLOCKED` |
| `/proposals`, `/configuration` | `UNLOCKED` |

**Fallback route:** `CONSUMPTION_REQUIRED` → `/fetch-consumption`; any other stage → `/current-conditions`.

**Redirect (R5):** whenever the stage or the path changes, if the current route is blocked and the fallback is a different route, do `router.replace(fallback)`. Blocked content is never rendered; a spinner shows during the redirect.

**`/`:** redirects to the fallback route for the current stage. This replaces the fixed `/fetch-consumption`.

**Menu:**
- Entries are locked with `!isGated || canReach` semantics. "Nuevo estudio de propuestas" is never locked; every other entry is locked when its route can't be reached.
- When at least one entry is locked, a note appears after the last section entry (Configuración), before "Cerrar sesión", using the destructive-tinted tokens (existing tokens only):
  - `CONSUMPTION_REQUIRED`: "Carga una factura o escanea un CUPS para empezar el estudio."
  - Otherwise: "Completa los precios actuales para desbloquear."

**"Nuevo estudio de propuestas" (R6):** calls `startNewStudy()`, which clears the session, the current conditions and the last job id, then closes the menu. The redirect moves the Broker to `/fetch-consumption`. No confirmation dialog, as in BmApp.

## Decisions
- **State lives in `FeeFirstGateProvider`** (React context), inside the `(app)` layout under `RequireAuth`. It exposes:
  - `stage`, `session`, `conditions`
  - `setSession(session | null)`, `setConditions(conditions | null)`, `startNewStudy()`
- **Session (in memory, BmApp parity):** minimal type `ConsumptionSession = { powerPeriods: string[]; energyPeriods: string[] }`. Consumption features extend it. Nothing publishes a session yet, so the real stage stays `CONSUMPTION_REQUIRED` until `consumption-by-cups-manual`.
- **Current conditions persistence:** `localStorage` key `bm.currentConditions`, holding JSON `{ powerTermPriceByPeriod, energyPriceByPeriod, extraServices, companyName }` with string values, mirroring the BmApp fields. They survive a reload.
- **Last job id:** only a reserved key and clear function (`bm.lastCompletedJobId`) so that `startNewStudy` and logout clear it. Saving and restoring it (1 h expiry) belongs to `consumption-by-cups-manual`.
- **Logout and forced logout:** register the conditions + job id cleanup in `clearLocalSessionData()` (`src/lib/auth/logout.ts`), and drop the in-memory session when the user changes or signs out. This is a deliberate fix of a BmApp gap: the Android session outlives logout. Record it in the spec.
- **Menu order (deliberate deviation from BmApp, user decision 2026-10-14):** "Nuevo estudio de propuestas" is the first entry, then Condiciones actuales, Propuestas, Configuración, Cerrar sesión. BmApp lists it fourth (`DrawerContent.kt:65-70`). It is the only step always reachable, so it leads the menu. Supersedes the order in `app-shell-navigation.md`.
- **Pure core:** `src/lib/gate/fee-first.ts` with `evaluateStage`, `canReach`, `fallbackRoute`, `isLockedEntry`, ported 1:1 with unit tests that mirror both BmApp test files.

## Non-Goals
- Fetching consumption, the job, polling, and saving or restoring the job id (`consumption-by-cups-manual`).
- The current conditions form and the `FeeFirstGateBanner` with field progress (`current-conditions-form`).
- `CupsScanner` route (`cups-camera-ocr`). Add it to the route table when that feature lands.
- Analytics skipping of blocked routes (`analytics-screen-tracking`).
- Refreshing the study on price-update pushes.

## Acceptance Scenarios
1. **Fresh Broker:** opening `/` lands on `/fetch-consumption`. The menu shows Condiciones actuales, Propuestas and Configuración with padlocks and no links; "Nuevo estudio…" is enabled; the consumption hint is shown.
2. **Direct URL while blocked:** opening `/proposals`, `/configuration` or `/current-conditions` with no session redirects to `/fetch-consumption` without showing the blocked screen.
3. **Session, conditions incomplete:** the stage is `CURRENT_CONDITIONS_REQUIRED`; `/proposals` → `/current-conditions`; `/fetch-consumption` → `/current-conditions`; Propuestas and Configuración are locked with the prices hint.
4. **Complete conditions:** the stage is `UNLOCKED`, all entries are enabled, no hint is shown, and every section is reachable except `/fetch-consumption` (→ `/current-conditions`).
5. **New study:** from `UNLOCKED`, tapping "Nuevo estudio de propuestas" clears the session, conditions and job id and lands on `/fetch-consumption` with entries locked again.
6. **Reload:** conditions survive a reload; the session does not, so the stage falls back to `CONSUMPTION_REQUIRED` (until job restore lands).
7. **Logout:** after logout or forced logout, `bm.currentConditions` and `bm.lastCompletedJobId` are removed and `bm.deviceId` is kept.

## Repository Research
Inspected: `src/app/(app)/layout.tsx`, `src/app/page.tsx`, `src/components/shell/{app-shell,app-menu,menu-entries}.tsx|ts` (the `locked` prop already exists), `src/lib/auth/logout.ts` (`clearLocalSessionData`), `src/components/auth/auth-provider.tsx`, `e2e/app-shell.spec.ts`, `CONTEXT.md` (Fee-First Gate), `docs/domain-model.md:19`.
Not inspected: `navigation-flow-fee-first.pen`.

## Expected File Changes
- `src/lib/gate/fee-first.ts` + `fee-first.test.ts` — new pure core.
- `src/lib/gate/storage.ts` + test — conditions and job id in localStorage.
- `src/components/gate/fee-first-gate-provider.tsx` + test — context and redirect guard.
- `src/app/(app)/layout.tsx` — wrap with the provider and guard.
- `src/app/page.tsx` — client redirect to the stage fallback (inside the auth + gate providers), or move `/` into `(app)`.
- `src/components/shell/app-menu.tsx`, `menu-entries.ts` — locks from the stage, hint, "Nuevo estudio" calls `startNewStudy`.
- `src/lib/auth/logout.ts` (+ test) — clear gate storage.
- `e2e/app-shell.spec.ts` — update for locked entries; new `e2e/fee-first-gate.spec.ts`.

## Verification Plan
- Unit tests:
  - Every scenario from `EvaluateFeeFirstGateUseCaseTest` and `BmAppRouteTest`.
  - Provider redirect for each stage × route.
  - Menu locks and hints per stage.
  - `startNewStudy` clears state.
  - Logout clears storage but keeps the device id.
- E2E (QA account): Scenarios 1, 2 and 7 against the real app.
  - Scenarios 3–5 can't be reached end to end until consumption exists, so they are covered by component tests.
  - Note in evidence that the E2E for those becomes possible with `consumption-by-cups-manual`.
  - Existing `app-shell.spec.ts` navigation test: with the real stage at `CONSUMPTION_REQUIRED`, the locked entries are no longer links. Change it to assert the padlocks; navigation to every section is covered by component tests.
- `./init.sh`, `npm run build`, 390px screenshots of the locked menu (light/dark).

## Durable Documentation Impact
- `docs/domain-model.md`: add the exact completeness rule (supplier + all periods > 0, extra services optional) and the localStorage keys.
- `CONTEXT.md`, `DESIGN.md`, `AGENTS.md`: not needed.
- `PROGRESS.md`, `feature_list.json`: evidence.

## Validator Checklist
- [ ] Stage rules and route table match BmApp exactly, including comma decimals, zero/blank prices, supplier, ignoring extra periods.
- [ ] Blocked content never flashes before the redirect.
- [ ] Menu locks, padlock, hint texts and "Nuevo estudio" behavior match BmApp.
- [ ] Storage cleared on new study and on both logout paths; `bm.deviceId` kept.
- [ ] Tokens only; no raw hex for the hint.
- [ ] Evidence recorded, including which scenarios are E2E vs component-only.
