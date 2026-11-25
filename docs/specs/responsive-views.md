# Feature Implementation Spec: Responsive page layouts

## Source Feature
- `id`: responsive-views · `area`: ui · `depends_on`: responsive-shell (accepted, PR #9 merged into `qa` `99a0ebd`)
- `status`: not_started (at planning time) · `source`: `feature_list.json`
- Branch: `feature/responsive-views` from freshly fetched `origin/qa` `99a0ebd`. Untracked `content.hmtl` is user work: preserve it.

## Goal
Use the extra space on tablets and desktops in every signed-in screen, without changing phones. `responsive-shell` already added the sidebar (≥ 1024px) and `PageContainer`. Every page is still 640px wide. This slice widens each page and rearranges it with `md:`/`lg:` utilities in the **same components**:
- **Proposals:** full content width, so more proposal columns fit before sideways scrolling starts. Column widths stay fixed at every size (product names are internal codes; stretching them adds nothing for the Broker).
- **Current conditions:** consumption summary next to the form on desktop.
- **Fetch consumption:** CUPS entry and the other methods side by side on desktop.
- **Top bar and bottom sheets:** follow the wider layout instead of the 640px phone column.
Below 768px every screen must stay as it is today (pixel-equivalent).

## Non-Goals
- No change to calculations, numbers, texts, BmApp parity rules, gate logic, API or PDF.
- No device-specific components, no user-agent/JS layout (DESIGN.md rule). `matchMedia` must not be added for layout.
- No change to comparator column widths (labels 176px, "Tarifa actual" and proposals 168px) or to `middleEllipsize` titles, on any screen size. User decision 2026-11-25: product names are internal codes the Broker explains; wider columns would not help and could confuse.
- Configuration and Login keep their current narrow layouts (simple lists/forms; already centered and readable). Only checked for no horizontal scroll.
- CUPS camera scan visibility unchanged (`(pointer: coarse)`).
- No new breakpoints beyond Tailwind `md` (768px) and `lg` (1024px).

## Job Story
When I prepare a study on my laptop or tablet,
I want to see the current tariff and all proposals at once, and the inputs next to their context,
so I can compare and fill in data without scrolling sideways or down unnecessarily.

## Layout Decisions
| Screen | < 768px (phone) | 768–1023px (`md`) | ≥ 1024px (`lg`, sidebar visible) |
|---|---|---|---|
| Proposals | unchanged: labels 176px, columns 168px, horizontal scroll, sticky "Tarifa actual" | page max 1280px; same fixed columns; scroll only when they do not fit | same as `md` |
| Current conditions | unchanged single column | unchanged single column (narrow) | `wide`: banner full width; grid `[320px_minmax(0,640px)]`, summary left (sticky `top-16`), form right |
| Fetch consumption | unchanged | unchanged (narrow) | max 960px: heading/intro/push card full width; grid 2 equal columns: left CUPS form, right "ELIGE UN MÉTODO"-style stack of the other options. `StudyProgress` spans both columns; study errors stay with the CUPS form |
| Configuration, Login | unchanged | unchanged | unchanged |
| Top bar | 640px inner box | inner box full content width (hamburger left edge, actions right edge) | same, right of the sidebar |
| Bottom sheets (copy prices, iOS install) | full width | `md:` centered, max 640px, rounded top | same |

**Width API decision:** `PageContainer` stays as is (`narrow` default). Pages stay `narrow` on phones and widen from a breakpoint through `className` (e.g. `md:max-w-[1280px]`, `lg:max-w-[960px]`), which `cn`/tailwind-merge already supports. No new width variants or second API. `wide` remains available for pages that are wide at every size.

## Acceptance Scenarios

### 1. Phone unchanged
Given a Pixel 7 viewport (412px)
When Fetch consumption, Current conditions, Proposals and Configuration are opened
Then layout is identical to `qa`: comparator columns are 168px wide, the labels column is 176px, sideways scroll and the sticky customer column work (existing `proposals.spec.ts` passes unchanged), and there is no page-level horizontal scroll.

### 2. More proposals visible, same column widths
Given desktop 1440×900 with 2 visible proposals
When Propuestas opens
Then the page content is wider than 640px, every customer/proposal column is exactly 168px and the labels column 176px, the comparator does not scroll sideways (`scrollWidth <= clientWidth` on `comparator-scroll`), and the "Mejor opción" card is below the table.

### 3. Many proposals still scroll
Given desktop with 8 visible proposals
Then every column is still 168px wide, the comparator scrolls sideways, "Tarifa actual" stays pinned while scrolling (same behaviour as phones), and the page itself never scrolls sideways.

### 4. Tablet comparator
Given tablet landscape (Galaxy Tab S4, 1138px) and portrait (768×1024)
Then the comparator uses the full content width with 168px columns (more columns visible than on phones), scrolling only when they do not fit, with the drawer (portrait) or sidebar (landscape) from `responsive-shell`.

### 5. Current conditions side by side
Given desktop and a completed consumption study
When Condiciones actuales opens
Then the consumption summary is left of the form (summary box right edge < form left edge, top edges within 8px), the form is at most 640px wide, the gate banner spans above both, and all inputs, "Copiar precios de una propuesta" and "Ir a las propuestas de precios" work as before (existing `current-conditions.spec.ts` behaviour).

### 6. Fetch consumption side by side
Given desktop at the consumption step
Then the CUPS form is in the left column and the PDF/photo options are in the right column at the same top, and the page is ≤ 960px wide. While a study is running, the progress spans the full width. Errors (failed study, `Reintentar`) stay with the CUPS form.

### 7. Top bar and sheets follow the layout
Given desktop on Propuestas
Then "Crear informe" is right-aligned at the content edge (its right edge > 640px + sidebar offset).
Given tablet/desktop on Condiciones actuales with proposals
When "Copiar precios de una propuesta" opens the sheet
Then the sheet is ≤ 640px wide and horizontally centered.

## Repository Research

### Files Inspected
- `src/components/shell/page-container.tsx` — `narrow`/`wide` widths; `cn` merge (tailwind-merge confirmed by tests).
- `src/components/shell/app-shell.tsx` — header inner `max-w-[640px]`; `main` has `px-4` (comparator bleeds with `-mx-4`).
- `src/components/proposals/proposals-table.tsx` — `comparator-scroll` (`-mx-4 overflow-x-auto`), inner `flex w-max`, labels wrapper, `customer-sticky` (`sticky left-0`), columns `gap-3`.
- `src/components/proposals/proposal-column.tsx`, `customer-conditions-column.tsx` — `w-[168px] shrink-0`; `consumption-labels-column.tsx` — `w-44`; `table-cells.tsx` — fixed `ROW_H` (alignment survives width changes).
- `src/components/proposals/best-proposal-card.tsx`, `create-report-action.tsx` (ready panel) — full-width blocks, fine at any width.
- `src/app/(app)/*/page.tsx` — all use `PageContainer` (narrow); configuration with `py-0`.
- `src/components/conditions/current-conditions-form.tsx` — single `flex-col` with headers/rows; `src/components/consumption/consumption-summary.tsx` — `<section>` card.
- `src/app/(app)/fetch-consumption/page.tsx` — heading, intro, `PushPromptCard`, method list or `StudyProgress`.
- `src/components/conditions/copy-proposal-prices-sheet.tsx`, `src/components/pwa/ios-install-sheet.tsx` — `side="bottom"` full width.
- `e2e/responsive-shell.spec.ts`, `e2e/proposals.spec.ts` (mock pattern, sticky assertions), `playwright.config.ts` (tablet/desktop projects only match `responsive-*.spec.ts`).

### Existing Patterns To Follow
- Breakpoint utilities only; `cn()`; Spanish strings from existing constants; `data-testid` already used by E2E (`comparator-scroll`, `customer-sticky`, `proposal-column`, `customer-column`, `labels-column`).
- E2E mocks consumption endpoints as in `proposals.spec.ts` / `responsive-shell.spec.ts`.

### Current Gaps
- Inner comparator row is `w-max`, so `flex-1` columns cannot grow until it becomes `md:w-full md:min-w-max`.

## Technical Approach
1. **PageContainer:** no change.
2. **Proposals page:** `<PageContainer className="md:max-w-[1280px]">`.
   - No changes to `proposals-table.tsx` or the column components. The `w-max` row inside `comparator-scroll` already fits as many fixed columns as the wider container allows and scrolls the rest.
   - Verify that the sticky "Tarifa actual" column still pins when the table overflows on tablet/desktop.
3. **Current conditions page:** `<PageContainer className="lg:max-w-[1280px]">`; wrap summary + form in `<div className="flex flex-col gap-4 lg:grid lg:grid-cols-[320px_minmax(0,640px)] lg:items-start lg:justify-center lg:gap-6">`, summary wrapper `lg:sticky lg:top-16`. Banner stays above. No change inside `CurrentConditionsForm`.
4. **Fetch consumption page:** `<PageContainer className="lg:max-w-[960px]">`; method area `<div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">` with left `CupsForm`, right `div.flex.flex-col.gap-4` containing scanner/PDF/photo options. Keep DOM order CUPS → scanner → PDF → photo (keyboard/screen reader order unchanged). "ELIGE UN MÉTODO" label stays above the grid.
5. **Top bar:** header inner box `max-w-[640px] md:max-w-none md:px-4`.
6. **Bottom sheets:** add `md:inset-x-auto md:left-1/2 md:w-full md:max-w-[640px] md:-translate-x-1/2` (or `md:mx-auto md:max-w-[640px]` if `inset-x-0` + `mx-auto` works with the base-ui popup) to both sheets. Check the slide-in animation still works. On `lg`, center within the viewport (acceptable, it is a modal).
7. **E2E** `e2e/responsive-views.spec.ts` (runs on android, tablet, desktop): scenarios 1–7 via bounding boxes; reuse the mock flow (consider moving the shared `reachProposals` mock into `e2e/fixtures.ts` only if both responsive specs use it — keep it small).

## Expected File Changes
- `src/components/shell/app-shell.tsx` — header inner width.
- `src/app/(app)/proposals/page.tsx`, `current-conditions/page.tsx`, `fetch-consumption/page.tsx` — widths and grids.
- `src/components/conditions/copy-proposal-prices-sheet.tsx`, `src/components/pwa/ios-install-sheet.tsx` — centered on `md`.
- `e2e/responsive-views.spec.ts` — create. Existing specs unchanged.
- `DESIGN.md` — layout table and comparator note.

## Visual Design Impact
- UI involved: yes. Source: `DESIGN.md` (breakpoints, comparator colours/heights) and BmApp `ComparatorProposalsView` (column widths unchanged).
- States: 2 and 8+ proposals; empty state; report ready panel/alerts above the table; running study; study error with Reintentar; locked gate banner; dark mode (tokens unchanged).
- New design artifact required: no.

## Durable Documentation Impact
- `DESIGN.md`: update — add the layout table above (per screen); note that comparator column widths are fixed on every screen size (wider screens show more columns, never wider ones); pages widen from breakpoints via `PageContainer` `className`; bottom sheets centered ≤ 640px from `md`.
- `AGENTS.md`: not needed (responsive E2E rule added in `responsive-shell`).
- `README.md`: not needed.
- `ARCHITECTURE.md` / `CONSTRAINTS.md`: not present; not needed.

## Implementation Plan
1. Baseline `./init.sh` on the branch; record the result.
2. Header width.
3. Proposals page width; check sticky with many proposals on tablet/desktop; `npm run test:e2e:quick -- e2e/proposals.spec.ts`.
4. Current conditions and fetch consumption grids.
5. Bottom sheets.
6. `responsive-views.spec.ts`; run on all three projects; review screenshots.
7. DESIGN.md; full Android suite; records.

## Implementation Tasks
- [ ] Header inner box `md:max-w-none`.
- [ ] Proposals page `md:max-w-[1280px]` (comparator components untouched).
- [ ] Current conditions `lg` grid with sticky summary.
- [ ] Fetch consumption `lg` two-column methods; progress/errors placement.
- [ ] Both bottom sheets centered ≤ 640px from `md`.
- [ ] `e2e/responsive-views.spec.ts` covering scenarios 1–7 (with screenshots `test-results/responsive-views-<screen>-<project>.png`).
- [ ] DESIGN.md update.

## Verification Plan
- `./init.sh` and `npm run build`.
- Local QA: `../BmInfra/bm-local-qa ready` (if down: `up`; the n8n rebuild can fail behind corporate TLS. Existing containers are enough when `ready` passes).
- Iterate: `npm run test:e2e:quick -- e2e/responsive-views.spec.ts e2e/proposals.spec.ts`, then `npm run test:e2e:desktop` (picks up both responsive specs).
- Completion: full `npm run test:e2e` once (Android) + `npm run test:e2e:desktop`. 15-minute timeout, no piping. No iOS unless asked.
- Manual: compare phone screenshots with `qa` for Proposals, Current conditions and Fetch consumption (should be identical); review tablet/desktop screenshots, including dark mode for Proposals.

## Evidence To Capture
- Branch, base `99a0ebd`, final commit and diff stat.
- Exact unit/build/E2E counts per project.
- Screenshots per screen and project; note phone parity.

## Validator Checklist
- [ ] Phones (< 768px) unchanged; `proposals.spec.ts` sticky/scroll assertions pass untouched.
- [ ] Comparator column widths unchanged on every viewport (176/168px); more columns visible on wider screens; scroll only when needed; sticky "Tarifa actual" works with many proposals.
- [ ] No device-specific components, no JS layout; DOM/focus order unchanged on fetch consumption.
- [ ] Current conditions and fetch consumption layouts match the table; sheets centered ≤ 640px.
- [ ] No calculation/text/behaviour changes; Configuration/Login untouched.
- [ ] DESIGN.md updated; `feature_list.json` and `PROGRESS.md` updated with exact results.
