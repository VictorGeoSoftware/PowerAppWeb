# Feature Implementation Spec: App shell with top bar and menu

## Source Feature
- `id`: app-shell-navigation · `area`: ui · `depends_on`: access-gate (accepted)
- `status`: not_started (at planning time) · `source`: `feature_list.json`

## Goal
Signed-in Brokers get the BmApp shell: a sticky top bar with a hamburger button that opens a left menu with the same entries, order and look as the Android drawer, and every signed-in screen renders inside it. Safe areas are respected on iOS (notch, home indicator, landscape sides).

## BmApp Reference (inspected)
`../BmApp/app/src/main/java/com/briel/marnisos/brielapp/ui/`:
- `views/MainStructureView.kt` (shell, `ModalNavigationDrawer` L101–124, `navigateToSection` L173–177)
- `views/drawer/DrawerContent.kt` (entries L65–71, layout L74–169)
- `views/common/TopActionBar.kt` (L27–62), `navigation/BmAppRoute.kt`, `navigation/BmAppNavHost.kt`
- Strings: `res/values-es/strings.xml`

Drawer, in order, no icons:
1. Condiciones actuales → `CurrentConditions`
2. Propuestas → `Proposals`
3. Configuración → `Configuration`
4. Nuevo estudio de propuestas → `FetchConsumption` (Android calls `startNewStudy()`)
5. Cerrar sesión → logout

Header: "Menú" only (titleMedium, semibold). Sheet 280dp wide, padding 12dp × 24dp. Selected entry background `sectionHighlight`. Footer: version label bottom-right (labelMedium, onSurfaceVariant). Top bar: no title, hamburger left ("Abrir menú"), right slot used only by "Crear informe" on Proposals. Padding 16dp × 8dp, surface background.

## Decisions
- **Routes** (mirror BmApp route names): `/current-conditions`, `/proposals`, `/configuration`, `/fetch-consumption`. Each is a placeholder screen ("Próximamente") until its feature lands. `/` redirects to `/fetch-consumption` (BmApp's usual first screen with no study yet); stage-based routing is `fee-first-gate`.
- **Guarding:** a route group `src/app/(app)/` whose `layout.tsx` wraps `RequireAuth` + `AppShell`. All shell routes are therefore guarded in one place; `/login` and `/dev/*` stay outside.
- **Menu:** shadcn `Sheet` (Radix Dialog) from the left, `w-[280px]`, title "Menú". Gives focus trap, Escape, overlay tap to close, and `aria-modal`. Closes after any entry tap.
- **All entries enabled.** Padlocks, disabled entries and the red info note depend on the Fee-First stage and belong to `fee-first-gate`. The entry component must accept a `locked` prop now (rendered disabled with the padlock) so that feature only supplies the state; default `false`.
- **"Nuevo estudio de propuestas"** navigates to `/fetch-consumption` only. Resetting the study belongs to `fee-first-gate`/consumption features.
- **"Cerrar sesión"** calls `signOutUser()` from `useAuth` (manual logout, `logout-force-logout`). The temporary button on `/` is removed.
- **Navigation:** `router.replace` for menu entries, matching Android `popUpTo(start)` (sections don't stack). Browser back does not step through sections (confirmed by the user).
- **Selected entry:** by `usePathname()`; `bg-section-highlight`, `aria-current="page"`. Unselected labels `text-foreground`.
- **Version label:** `NEXT_PUBLIC_APP_VERSION` if set, else build-time `v` + `ddMM_HHmm` (same format as BmApp), computed in `next.config.ts` `env`.
- **Top bar right slot:** `AppShell` exposes a small context/slot (`useTopBarAction`) so `proposals-table` can add "Crear informe" later. Empty for now.
- **Safe areas:** top bar `sticky top-0` with `pt-[env(safe-area-inset-top)]` and left/right insets; main content `pb-[env(safe-area-inset-bottom)]`; sheet padded with top/bottom/left insets. `viewport-fit=cover` is already set in `src/app/layout.tsx`.
- **Sizes:** hamburger and entries ≥44px touch targets (h-12 entries). Content max-width 640px centered, as DESIGN.md.

## Non-Goals
- Fee-First stage logic, locks, the info note, redirects between steps (`fee-first-gate`).
- Real screen content for the four sections.
- "Crear informe" button (`proposals-table` / `comparator-pdf-share`).
- Analytics screen tracking, PWA manifest/install (`analytics-screen-tracking`, `pwa-installable`).
- Desktop permanent sidebar. Larger screens use the same hamburger.

## Job Story
When I'm signed in on my phone,
I want the same menu and sections as the Android app,
so I can move between steps without relearning the app.

## Acceptance Scenarios
### 1. Shell on every signed-in screen
Given a granted Broker
When they open `/`
Then they land on `/fetch-consumption` with the sticky top bar and a hamburger labelled "Abrir menú".

### 2. Menu contents
When they tap the hamburger
Then a left panel titled "Menú" shows, in order: Condiciones actuales, Propuestas, Configuración, Nuevo estudio de propuestas, Cerrar sesión, plus the version label at the bottom right.

### 3. Navigate every entry
For each of the first four entries: tapping it closes the menu, changes the URL to its route, shows its screen and, on reopening, highlights that entry with `aria-current="page"`.

### 4. Close without navigating
Escape, overlay tap or the close control closes the menu and leaves the URL unchanged; focus returns to the hamburger.

### 5. Logout from the menu
Tapping "Cerrar sesión" performs the manual logout and lands on `/login` with no notice.

### 6. Guarded routes
Signed out, opening any of the four routes redirects to `/login`.

### 7. Safe areas (manual, deferred)
Deferred to `qa-real-device-checks` (first QA deployment); not required to pass this feature.
On an iPhone with a notch (Safari and standalone/Home Screen), the top bar sits below the status bar and the menu's content is not hidden by the notch or home indicator, in portrait and landscape.

### 8. Sticky bar
Scrolling a long placeholder keeps the top bar visible.

## Repository Research
Inspected: `src/app/layout.tsx` (viewport-fit cover, AuthProvider), `src/app/page.tsx` (placeholder with logout button), `src/components/auth/guards.tsx` (`RequireAuth`), `src/components/auth/auth-provider.tsx`, `src/components/ui/` (button, input, label; no sheet yet), `e2e/` (`login`, `access-gate`, `logout` specs + `fixtures.ts`), `DESIGN.md` (Layout, Do's), `src/app/globals.css` tokens incl. `section-highlight`, `docs/specs/logout-force-logout.md`.
Not inspected: BmApp `.pen` designs (agent summary of Kotlin sources used instead).

## Expected File Changes
- `src/app/(app)/layout.tsx` — new: `RequireAuth` + `AppShell`.
- `src/app/(app)/{current-conditions,proposals,configuration,fetch-consumption}/page.tsx` — new placeholders.
- `src/app/page.tsx` — becomes redirect to `/fetch-consumption`; `src/app/page.test.tsx` updated.
- `src/components/shell/app-shell.tsx`, `top-bar.tsx`, `app-menu.tsx`, `menu-entries.ts` (+ tests).
- `src/components/ui/sheet.tsx` — via shadcn CLI (`@radix-ui/react-dialog`).
- `next.config.ts` — version env; `.env.example` — `NEXT_PUBLIC_APP_VERSION` (optional).
- `e2e/app-shell.spec.ts` — new; `e2e/logout.spec.ts` — logout via the menu.

## Visual Design Impact
New shell, tokens only (`bg-background`, `bg-section-highlight`, `text-muted-foreground`). No new colors. DESIGN.md: no change needed (already prescribes hamburger + sticky bar + safe areas).

## Durable Documentation Impact
- `DESIGN.md`: not needed (behavior already described).
- `README.md`: add the routes to the repo map only if it lists routes; otherwise not needed.
- `AGENTS.md`, `CONTEXT.md`: not needed.
- `PROGRESS.md`, `feature_list.json`: update with evidence.

## Implementation Tasks
1. Add shadcn `sheet`; check it builds with Tailwind 4.
2. `menu-entries.ts`: ordered entries (label, href, `locked?`) + unit test of order/labels.
3. `AppMenu`: header, entries, logout, version; selected state; closes on tap.
4. `TopBar` + `AppShell` with safe-area paddings and right-slot context.
5. `(app)/layout.tsx` and four placeholder pages; `/` redirect.
6. Version env in `next.config.ts`.
7. Unit tests (menu render/order, selected entry, logout call, close on navigate).
8. E2E `app-shell.spec.ts`; move logout E2E to the menu.
9. Verify, screenshots, update `PROGRESS.md` and `feature_list.json`.

## Verification Plan
- `./init.sh` green; `npm run build`.
- `npm run test:e2e` (android-chromium + iphone-webkit, 390px class) incl. Scenarios 1–6 and 8.
- Screenshots at 390px: closed and open menu, light and dark.
- Scenario 7: not run here. Check that the safe-area `env()` paddings are in the rendered CSS; the real-iPhone check runs in `qa-real-device-checks`.

## Evidence To Capture
Test counts, E2E results, screenshot paths, iPhone notch check outcome (or reason pending).

## Validator Checklist
- [ ] Entries, order, labels and header/footer match BmApp; no icons except future padlock.
- [ ] Only token utilities; no raw hex.
- [ ] All four routes guarded; `/` redirects.
- [ ] Menu accessible: focus trap, Escape, `aria-current`, ≥44px targets.
- [ ] Logout from the menu works; old placeholder button removed.
- [ ] Safe-area insets applied to bar, content and menu.
- [ ] No Fee-First logic leaked in; `locked` prop exists but unused.
- [ ] Evidence recorded.
