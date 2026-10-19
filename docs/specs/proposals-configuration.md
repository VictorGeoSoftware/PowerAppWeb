# Feature Implementation Spec: Configure visible Proposals

## Source Feature

- `id`: proposals-configuration
- `area`: comparator
- `depends_on`: proposals-table (accepted)
- `status`: passing
- `source`: `feature_list.json`

## Goal

Replace the `/configuration` placeholder with BmApp's `ProposalVisibilityConfigurationView`: a list of the study's proposals, each with a switch. The comparator on `/proposals` shows only the visible ones, and the empty state and "Mejor opción" card follow that set. Also port BmApp's one-time **auto-hide of uncompetitive proposals**, applied when the Broker reaches `/proposals`. The `proposals-table` spec deferred it to this feature. Visibility is persisted per study in localStorage, so it survives a reload. This goes beyond BmApp, which keeps it in memory, and matches the feature's verification "after reload".

## Non-Goals

- No analytics event (`ProposalVisibilityChanged` → `analytics-screen-tracking`).
- No PDF (`comparator-pdf-share`). It must later use the same visible set.
- No changes to the calculation library. `selectUncompetitiveProposals` already exists.
- No reordering, renaming or "show all" bulk actions.

## Job Story

When some proposals don't make sense for this customer,
I want to hide them from the comparison,
so the customer only sees the relevant offers.

## Users And Permissions

- Broker at `UNLOCKED`. `FeeFirstGateGuard` already gates `/configuration`. The screen makes no backend calls.

## Acceptance Scenarios

### Scenario 1: Configuration screen
Given an unlocked study with proposals A, B and C
When the Broker opens `/configuration`
Then it shows:
- the heading "Propuestas visibles";
- the hint "Usa el botón a la izquierda de la propuesta para ocultarla/mostrarla";
- a divider;
- one row per proposal in report order, with a switch on the left and the full title, not ellipsized;
- hidden rows at 45% opacity.

The whole row toggles the switch, and each row is 44px or taller.

### Scenario 2: Toggle hides in the table and survives a reload
When the Broker switches B off and opens `/proposals`
Then B's column is not rendered, and "Mejor opción" is chosen only among the visible proposals.
After a reload, B is still off on both screens.

### Scenario 3: All hidden
Given every proposal is switched off
Then `/proposals` shows "Aún no hay propuestas que comparar." (BmApp `hasProposals` = visible proposals not empty).

### Scenario 4: Default and sync (BmApp `synchronizeProposalOverrides`)
- A title with no stored value is visible.
- When the session's proposals change (new report or silent refresh), the stored visibility is kept for titles that still exist and dropped for titles that are gone.
- `setProposalVisibility` ignores unknown titles.
- A new study (`startNewStudy`/`clearStudyStorage`) clears visibility and the auto-hide signature.

### Scenario 5: Auto-hide once (BmApp `ProposalsViewModel.hideUncompetitiveProposals` + `hideProposalsOnce`)
When `/proposals` renders with a non-empty `summary.proposals`, the app runs a one-time auto-hide:
1. It computes `signature = "${jobId}@${customerTotalAnnualPrice}"`. The number uses Kotlin `Double.toString`, i.e. `kotlinDoubleToString`.
2. If the signature equals the stored last signature, it does nothing.
3. Otherwise it stores the signature and sets visible=false for each title in `selectUncompetitiveProposals(summary)`, touching only titles that exist.

As a result:
- a proposal 15% or more dearer than the customer is auto-hidden the first time;
- if the Broker switches it back on, it stays on, because the same signature does not hide it again;
- changing a customer price (new total) or a fixed amount that changes the total re-applies the rule once;
- it never re-shows anything;
- with no customer prices (total 0) the selection is empty but the signature is still recorded, as in BmApp.

The summary used is computed with the fixed amounts, as in BmApp.

### Scenario 6: No session or no proposals
`/configuration` with no proposals shows the heading and hint and an empty list. This cannot happen at `UNLOCKED` in normal flow, but it must not crash.

## Repository Research

### Files Inspected
- `../BmApp/.../views/configuration/{ConfigurationScreen,ConfigurationUiState,ConfigurationViewModel,ProposalVisibilityConfigurationView}.kt`: UI, copy, alpha 0.45, default visible.
- `../BmApp/.../views/proposals/{ProposalsViewModel,ProposalsUiState}.kt`: visible filter, the auto-hide trigger and signature, best option among visible proposals, `hasProposals`.
- `../BmApp/data/.../ConsumptionSessionRepositoryImpl.kt`: `setProposalVisibility`, `hideProposalsOnce` (signature guard, only existing titles), `synchronizeProposalOverrides`, `clear()`.
- `../BmApp/domain/.../SelectUncompetitiveProposalsUseCase.kt`: already ported.
- `src/components/gate/fee-first-gate-provider.tsx`: the fixed-amount state and sync pattern (`proposalTitles`, stale pruning, setter guard). Mirror it for visibility.
- `src/lib/gate/storage.ts`: `PROPOSAL_FIXED_AMOUNTS_KEY` load/save and `clearStudyStorage`.
- `src/components/proposals/proposals-table.tsx`: `visible = summary.proposals` (line 28) and the empty check on `summary.proposals` (line 24). Both must change to visible proposals.
- `src/app/(app)/configuration/page.tsx`: placeholder.
- `src/lib/comparator/{calculate,format}.ts`: `selectUncompetitiveProposals`, `kotlinDoubleToString`.
- `node_modules/@base-ui/react/switch`: available. There is no `src/components/ui/switch.tsx` yet.

### Existing Patterns To Follow
- Persisted per-study state lives in the gate provider and `storage.ts` (`bm.*` keys) and is cleared with the study.
- Spanish copy goes in `src/lib/proposals/messages.ts`, with colours from tokens only.

### Current Gaps
- No shadcn Switch. Add `src/components/ui/switch.tsx`, the shadcn Base UI variant styled with tokens (`bg-primary` when checked, `bg-input` otherwise).

## Technical Approach

1. **Storage**: `PROPOSAL_VISIBILITY_KEY = "bm.proposalVisibility"` (`Record<string, boolean>`, only `false` entries need storing) and `PROPOSAL_AUTO_HIDE_SIGNATURE_KEY = "bm.proposalAutoHideSignature"`, with load/save helpers. `clearStudyStorage` removes both.
2. **Provider**: add `proposalVisibility: Record<string, boolean>` (synced to the current titles, default true), `setProposalVisibility(title, visible)` (ignores unknown titles), and `hideProposalsOnce(signature, titles)`. These are a direct port. Prune stale titles exactly like fixed amounts. Reset everything in `startNewStudy`.
3. **Pure helper** `src/lib/proposals/visibility.ts`: `visibleProposals(proposals, visibility)` and `autoHideSignature(jobId, total)`, with tests.
4. **Proposals table**: `visible = visibleProposals(summary.proposals, proposalVisibility)`. The empty state appears when `visible.length === 0`, and `best = bestProposalAmong(summary, visible)`. Add a `useEffect` keyed on `[jobId, summary]` that calls `hideProposalsOnce(autoHideSignature(jobId, summary.customerTotalAnnualPrice), new Set(selectUncompetitiveProposals(summary)))` when `jobId` is set and `summary.proposals.length > 0`.
5. **Configuration UI** `src/components/proposals/proposal-visibility-list.tsx`: heading, hint, `<hr>`, and rows built as `<label>` wrappers around a `Switch` (accessible name = title) plus the title text, with `opacity-45` when hidden. Then update `src/app/(app)/configuration/page.tsx`.
6. **Messages**: `VISIBLE_PROPOSALS_TITLE`, `VISIBLE_PROPOSALS_HINT`.

## Expected File Changes
- `src/components/ui/switch.tsx`: create.
- `src/lib/proposals/visibility.ts` and `.test.ts`: create.
- `src/components/proposals/proposal-visibility-list.tsx` and `.test.tsx`: create.
- `src/lib/proposals/messages.ts`: modify.
- `src/lib/gate/storage.ts` and its test: modify.
- `src/components/gate/fee-first-gate-provider.tsx` and its test: modify.
- `src/components/proposals/proposals-table.tsx` and its test: modify.
- `src/app/(app)/configuration/page.tsx`: replace.
- `e2e/proposals-configuration.spec.ts`: create. Update `e2e/proposals.spec.ts` only if the auto-hide changes its expectations; for example, a fixture proposal 15% or more dearer would now be hidden.
- `docs/domain-model.md`, `DESIGN.md` (only if the switch styling needs a note), `feature_list.json`, `PROGRESS.md`.

## Visual Design Impact
- UI involved: yes. Source: the BmApp `ProposalVisibilityConfigurationView` and `DESIGN.md` tokens. No new colours.
- States: all visible, some hidden (dimmed rows, fewer table columns), all hidden (table empty state).

## Durable Documentation Impact
- `ARCHITECTURE.md` / `CONSTRAINTS.md`: not needed; neither exists and there is no new boundary.
- `AGENTS.md`: not needed.
- `docs/domain-model.md`: update with the visibility and auto-hide rules: default visible, kept per study across reloads (a web deviation, since BmApp keeps it in memory), auto-hide signature, the 15% threshold, never re-shows, and the cheapest proposal kept when all are uncompetitive.

## Implementation Plan
1. Storage, provider and pure helper, with tests.
2. Table filtering and auto-hide effect, with tests.
3. Switch component, configuration list and page.
4. E2E and docs.

## Implementation Tasks
- [x] Storage tests: round trip, then cleared by `clearStudyStorage`.
- [x] Provider tests:
  - [x] default true;
  - [x] toggling persists across remount;
  - [x] unknown title ignored;
  - [x] stale title pruned on new proposals;
  - [x] `hideProposalsOnce` same signature is a no-op and a new signature hides;
  - [x] it never sets true;
  - [x] `startNewStudy` resets.
- [x] `visibility.ts` tests, including `autoHideSignature("j", 1234.5) === "j@1234.5"` and `("j", 0) === "j@0.0"`.
- [x] Table RTL: a hidden proposal has no column, all hidden gives the empty message, and the best option is chosen among visible proposals.
- [x] Configuration list RTL: row click toggles, dims at 45%, and the switch has the title as its accessible name.
- [x] E2E (android-chromium, mocked report with 3 proposals: one cheaper, one slightly dearer, one 20% dearer; `collected-prices` mocked 201):
  - [x] reaching `/proposals` auto-hides the 20%-dearer proposal;
  - [x] on `/configuration` that row is off, so switch it back on and switch the cheaper one off;
  - [x] `/proposals` shows the re-enabled one and not the cheaper one;
  - [x] reload keeps the same state, with no re-hide;
  - [x] all off gives the empty message.

## Verification Plan
- `./init.sh`: green.
- `npm run test:e2e:quick -- e2e/proposals-configuration.spec.ts e2e/proposals.spec.ts` while iterating.
- A full `npm run test:e2e` once at the end (android-chromium; 15-minute timeout; no piping).
- Mobile check: screenshot `/configuration` at 390px from the E2E run.

## Evidence To Capture
- Vitest count, focused and full E2E results, the screenshot path.

## Validator Checklist
- [x] Copy and dimming match BmApp, and the full row toggles the switch.
- [x] The table, empty state and best option use only visible proposals.
- [x] Auto-hide follows the signature rule exactly, runs once per signature, never re-shows, and only touches existing titles.
- [x] Visibility persists across reloads, prunes stale titles and clears on a new study.
- [x] No analytics or PDF work and no calculation changes.
- [x] Docs, `feature_list.json` and `PROGRESS.md` are updated.
