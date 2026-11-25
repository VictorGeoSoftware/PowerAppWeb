# Feature Implementation Spec: Responsive app shell

## Source Feature
- `id`: responsive-shell · `area`: ui · `depends_on`: app-shell-navigation, fee-first-gate (both accepted)
- `status`: not_started (at planning time) · `source`: `feature_list.json`
- Follow-up slice: `responsive-views` (per-page layouts and comparator), planned after this one is accepted.

## Goal
Brokers now use PowerAppWeb mostly on desktop and tablets. This slice makes the **shell** adapt to the screen while keeping one implementation for all devices:
- `>= 1024px` (Tailwind `lg`): the menu is a permanent left sidebar; no hamburger, no drawer.
- `< 1024px`: exactly today's shell (sticky top bar, hamburger, left `Sheet` drawer).
- Every page renders inside a shared `PageContainer` that owns page width. In this slice all pages declare the current narrow width (640px), so phone layouts do not change; `responsive-views` widens pages one by one.
- Desktop and tablet viewports are added to Playwright so larger layouts are verified from now on.

## Non-Goals
- No per-page layout changes (grids, two columns, comparator column widths): `responsive-views`.
- No new menu entries, routes, labels, icons or behavior changes (locks, "Nuevo estudio", push/install/logout rows stay as they are).
- No device-specific component copies (`DesktopX`/`MobileX`), no user-agent detection for layout, no JS `matchMedia` for layout: CSS breakpoints only.
- No collapsible/resizable sidebar, no dark/light changes, no BmApp changes.
- CUPS camera scan visibility unchanged (already hidden on mouse-first devices by `(pointer: coarse)` in `cups-scanner-option.tsx`).

## Job Story
When I use PowerApp on my office computer or tablet,
I want the menu always visible and the screen to use the available space,
so I can move between steps without opening a drawer and without the app looking like a phone.

## Users And Permissions
- Signed-in Broker: same entries and Fee-First locks as today. Signed-out/login screens are outside the shell and untouched.

## Breakpoints (durable rule, goes into DESIGN.md)
| Name | Width | Shell |
|---|---|---|
| phone | < 768px | top bar + hamburger drawer (unchanged) |
| tablet (`md`) | 768–1023px | top bar + hamburger drawer (unchanged); pages may widen in `responsive-views` |
| desktop (`lg`) | >= 1024px | permanent sidebar 280px + top bar (actions only) |

Tailwind 4 default breakpoints are used; no custom screens.

## Acceptance Scenarios

### 1. Phone unchanged
Given a signed-in Broker on a 412px-wide viewport (Pixel 7)
When any section opens
Then the top bar shows "Abrir menú", the menu opens as the left dialog with the same entries as today, no sidebar is rendered visibly, and content width/padding are as before.

### 2. Desktop sidebar
Given a signed-in Broker at 1440×900
When any section opens
Then a `navigation` "Menú principal" is visible at the left without any click, with "Menú" title, entries in the current order, the selected entry highlighted, and the version at the bottom; there is no "Abrir menú" button and no dialog.

### 3. Fee-First locks in the sidebar
Given the Broker is at the consumption step on desktop
Then "Condiciones actuales", "Propuestas" and "Configuración" show the padlock (3 × "Bloqueado"), the red hint is shown, and only "Nuevo estudio de propuestas" is actionable — identical to the drawer.

### 4. Navigation and actions from the sidebar
Given desktop and an unlocked stage
When the Broker clicks "Propuestas"
Then the route changes with `replace`, the sidebar stays open, and the top bar right slot shows "Crear informe" (and "Informe completo" for Premium) as today. "Nuevo estudio", push, install and "Cerrar sesión" behave as in the drawer.

### 5. Tablet
Given 1024×768 landscape tablet → sidebar (scenario 2). Given 768×1024 portrait → drawer (scenario 1).

### 6. Resize
Given desktop with the window narrowed below 1024px (or a drawer opened on tablet then widened)
Then the layout switches without reload and no stale open drawer overlays the sidebar (drawer closes when `lg` is reached).

### 7. Page width preserved
Given any section at 1440px
Then page content is at most 640px wide (narrow container), placed in the area right of the sidebar, and there is no page-level horizontal scroll at any viewport.

## Repository Research

### Files Inspected
- `src/components/shell/app-shell.tsx` — header/main both `max-w-[640px]`; `useTopBarAction` context; safe-area padding.
- `src/components/shell/app-menu.tsx` — `Sheet side="left" w-[280px]`; `MenuEntryItem`; locks, hint, `PushMenuEntry`, install, logout, version; `close()` after each action.
- `src/components/shell/menu-entries.ts` — entry list/order.
- `src/components/ui/sheet.tsx` — base-ui Sheet (dialog, overlay).
- `src/app/(app)/layout.tsx` and pages `fetch-consumption`, `current-conditions`, `proposals`, `configuration`, `page.tsx` — each page wraps itself in `<section className="flex flex-col gap-4 py-4">`; configuration renders a component directly.
- `src/components/consumption/cups-scanner-option.tsx` — already hides camera scan when pointer is not coarse.
- `src/components/proposals/proposals-table.tsx` — comparator uses `-mx-4` bleed; must still work in the narrow container (no change here).
- `DESIGN.md` Layout section — "360–430px first; max-width ~640px".
- `playwright.config.ts` — projects only `iphone-webkit`, `android-chromium`; `scripts/e2e.sh` passes `--project`.
- `e2e/app-shell.spec.ts`, `e2e/fixtures.ts` — menu assertions via the dialog; `openSignedIn`, `useSignedInSession`.
- `src/components/shell/app-shell.test.tsx` — unit coverage to extend.

### Existing Patterns To Follow
- Tailwind utilities with `md:`/`lg:` prefixes; `cn()` from `@/lib/utils`.
- Shell components are client components; Spanish labels from constants (`menu-entries.ts`).
- E2E only through `scripts/e2e.sh` wrappers; Android-only during development.

### Current Gaps
- No breakpoint usage in app code; no desktop/tablet Playwright project.
- Menu content lives inside the `Sheet`; it must be extracted to be reused.
- `scripts/e2e.sh` project handling not fully inspected: implementer must confirm extra `--project` values pass through.

## Technical Approach
1. **Extract `MenuPanel`** (`src/components/shell/menu-panel.tsx`): the current inner content of `AppMenu` (title, nav, hint, push, install, logout, version) with props `onNavigate: () => void` (drawer: close; sidebar: no-op). `AppMenu` (drawer) renders `<Sheet><SheetContent …><MenuPanel onNavigate={close} /></SheetContent></Sheet>`. Keep `MenuEntryItem` export.
   - Title: in the drawer it must remain `SheetTitle` (dialog accessible name). Pass a `title` render prop or a `variant: "drawer" | "sidebar"` that renders `SheetTitle` vs `<p className=… >Menú</p>`.
2. **Sidebar** in `AppShell`: `<aside className="hidden lg:flex fixed inset-y-0 left-0 w-[280px] flex-col border-r border-section-border bg-background px-3 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-6 overflow-y-auto">` containing `MenuPanel variant="sidebar"`. Main column gets `lg:pl-[280px]`.
   - Hidden via CSS (`display:none`) below `lg`, so only one menu is in the accessibility tree at any width. The drawer is only mounted when open, so no duplication.
3. **Top bar**: hamburger gets `lg:hidden`; header keeps the right action slot. At `lg` the header spans the content column (`lg:pl-[280px]` on the outer flex column), its inner box uses the same width as the page container.
4. **Drawer auto-close**: when `lg` matches, close the drawer. Use one `matchMedia("(min-width: 1024px)")` listener inside `AppShell` that only calls `setMenuOpen(false)` (behavioral, not layout). Guard for missing `matchMedia` (tests).
5. **`PageContainer`** (`src/components/shell/page-container.tsx`): `({ width = "narrow", className, children })` → `<section className={cn("mx-auto flex w-full flex-col gap-4 py-4", WIDTH[width], className)}>` with `WIDTH = { narrow: "max-w-[640px]", wide: "max-w-[1280px]" }`. `main` drops `max-w-[640px]` (keeps horizontal padding/safe areas). All four pages switch their `<section>` to `<PageContainer>` (narrow); configuration wraps its component. `wide` exists but is unused until `responsive-views`.
6. **Playwright**: add projects `tablet-chromium` (`devices["Galaxy Tab S4 landscape"]`, 1138×712 → sidebar) and `desktop-chromium` (`devices["Desktop Chrome"]`, viewport 1440×900), each with its own `setup-*`. Add npm scripts `test:e2e:desktop` (`scripts/e2e.sh --project=desktop-chromium --project=tablet-chromium`). Default `test:e2e` stays Android-only; AGENTS rule unchanged except documenting the new script.
7. New `e2e/responsive-shell.spec.ts` with viewport-aware assertions (`testInfo.project.name`). Existing `app-shell.spec.ts` stays Android-scoped; skip it on desktop projects if it relies on the dialog (`test.skip(isDesktop)` with a reason).

## Expected File Changes
- `src/components/shell/menu-panel.tsx` — create; shared menu content.
- `src/components/shell/app-menu.tsx` — modify; drawer = Sheet + MenuPanel.
- `src/components/shell/app-shell.tsx` — modify; sidebar, `lg:` offsets, hamburger `lg:hidden`, drawer auto-close, no 640 cap on `main`.
- `src/components/shell/page-container.tsx` — create.
- `src/app/(app)/{fetch-consumption,current-conditions,proposals,configuration}/page.tsx` — modify; use `PageContainer` (narrow).
- `src/components/shell/app-shell.test.tsx`, `src/components/shell/page-container.test.tsx` — modify/create.
- `playwright.config.ts`, `package.json` scripts — modify.
- `e2e/responsive-shell.spec.ts` — create; `e2e/app-shell.spec.ts` — modify only if needed for project scoping.
- `DESIGN.md`, `AGENTS.md`, `README.md` — see documentation impact.

## Visual Design Impact
- UI involved: yes. Design source: `DESIGN.md` + current drawer (`app-shell-navigation` spec).
- Sidebar reuses the drawer look exactly: 280px, `px-3`, "Menú" semibold title, `h-12` rounded-full entries, `bg-section-highlight` selected, version bottom-right; plus a `border-r border-section-border` separator and `bg-background` (no shadow/overlay).
- States: locked entries + hint, iOS/push/install rows, long hint text wrapping, sidebar scroll on short screens (`overflow-y-auto`), dark mode via existing tokens.
- New design artifact required: no.

## Durable Documentation Impact
- `DESIGN.md`: update — Layout: replace "360–430px first; max-width ~640px" with the breakpoint table, "one component per view, adapt with `md:`/`lg:` utilities; no device-specific copies", sidebar at `lg`, `PageContainer` widths (`narrow` 640 / `wide` 1280).
- `AGENTS.md`: update — product description "mobile-first … smartphones" → "responsive (phone, tablet, desktop)"; E2E section: mention `test:e2e:desktop` and that layout features also run it.
- `README.md`: update scripts list if it enumerates npm scripts.
- `ARCHITECTURE.md` / `CONSTRAINTS.md`: not present; not needed (rule lives in DESIGN.md/AGENTS.md).

## Implementation Plan
1. Branch `feature/responsive-shell` from freshly fetched `origin/qa` (at planning: `qa` = `6442ebb`; local `PROGRESS.md`/`feature_list.json` modified and untracked `content.hmtl` are user work — preserve them).
2. Extract `MenuPanel`; keep all existing unit tests green.
3. Add `PageContainer`; migrate pages; remove `main` cap.
4. Add sidebar, `lg:` offsets, hamburger hiding, auto-close.
5. Add Playwright projects/scripts and `responsive-shell.spec.ts`.
6. Update docs, run gates, record evidence.

## Implementation Tasks
- [ ] Create `menu-panel.tsx` (drawer/sidebar variant) and refactor `app-menu.tsx`.
- [ ] Create `page-container.tsx` + unit test (narrow/wide classes).
- [ ] Migrate the 4 pages to `PageContainer width="narrow"`.
- [ ] Sidebar + `lg:pl-[280px]` + `lg:hidden` hamburger + drawer auto-close in `app-shell.tsx`.
- [ ] Extend `app-shell.test.tsx`: sidebar nav rendered with entries/locks; "Nuevo estudio" calls `startNewStudy` from the sidebar; matchMedia `lg` closes the drawer.
- [ ] Playwright `tablet-chromium` + `desktop-chromium` projects; `test:e2e:desktop` script; confirm `scripts/e2e.sh` forwards them.
- [ ] `e2e/responsive-shell.spec.ts`: scenarios 1, 2, 3, 4 (navigation + top bar action visible), 5 (portrait tablet via `page.setViewportSize(768×1024)`), 6 (resize), 7 (container width ≤ 640 and `document.documentElement.scrollWidth <= innerWidth`).
- [ ] Update `DESIGN.md`, `AGENTS.md`, `README.md`.

## Verification Plan
- `./init.sh` (lint, typecheck, vitest) and `npm run build` — green.
- Local QA stack per AGENTS (`../BmInfra/bm-local-qa ready`, or `up` if down).
- Iterate: `npm run test:e2e:quick -- e2e/responsive-shell.spec.ts`, then `npm run test:e2e:desktop -- e2e/responsive-shell.spec.ts e2e/proposals.spec.ts`.
- Completion: full `npm run test:e2e` (Android) once + `npm run test:e2e:desktop -- e2e/responsive-shell.spec.ts`. 15-min timeout, no output piping. No iOS run unless user asks.
- Manual: screenshots at 412×915, 768×1024, 1024×768, 1440×900 of Fetch consumption (locked menu) and Proposals (top bar actions).

## Evidence To Capture
- Branch, base commit, final commit/diff stat.
- Exact `./init.sh`, build and E2E results (counts per project).
- The four screenshots, noting phone is visually unchanged vs `qa`.

## Validator Checklist
- [ ] Phone (<768px) shell and pages pixel-equivalent to before (same widths, drawer, entries).
- [ ] Sidebar at ≥1024px shares `MenuPanel`; no duplicated menu logic or labels.
- [ ] Only one menu navigation exposed to assistive tech at any width.
- [ ] No UA sniffing or JS-driven layout; `matchMedia` only closes the drawer.
- [ ] All pages use `PageContainer`; none widened in this slice.
- [ ] Desktop/tablet projects exist and focused spec passes; full Android suite result recorded.
- [ ] DESIGN.md/AGENTS.md updated; `feature_list.json` and `PROGRESS.md` updated; no unrelated changes.
