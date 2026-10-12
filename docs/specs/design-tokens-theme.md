# Feature Implementation Spec: Theme tokens from DESIGN.md applied (light/dark)

## Source Feature

- `id`: design-tokens-theme
- `area`: ui
- `depends_on`: bootstrap-nextjs-app (accepted)
- `status`: in_progress
- `source`: `feature_list.json`

## Goal

Replace the default neutral shadcn palette with the BmApp palette (yellow `#FACC15` on slate). The app follows the system light or dark mode, the same way Android uses `isSystemInDarkTheme()`. The BmApp extended table and section colors are also exposed as Tailwind utilities, so later features never need hard-coded hex values.

## Non-Goals

- A manual theme toggle (Android has none).
- New screens or the app shell. The only addition is a dev-only token preview route.
- Android dynamic color (it is disabled in BmApp).

## Acceptance Scenarios

### Scenario 1: Light palette
Given the system is in light mode
When `/` loads
Then the background is `#F8FAFC`, the text is `#0F172A`, and the primary button is `#FACC15` with `#0F172A` text.

### Scenario 2: Dark palette
Given the system prefers dark
When `/` loads
Then the background is `#020617`, the surface/card is `#0B1220`, and the primary stays `#FACC15`.

### Scenario 3: Extended tokens
Given `/dev/theme` in development
Then the swatches for table header, header highlight and section highlight show the BmApp light or dark values.
And in production, `/dev/theme` returns 404.

## Repository Research

- `../BmApp/.../ui/theme/Color.kt` and `Theme.kt`: the light and dark Material schemes plus `BrielExtendedColors`. This is the source of truth.
- `../BmApp/.../ui/theme/Dimensions.kt`: `Corner = 8.dp`.
- `src/app/globals.css`: shadcn v4 CSS variables, with dark mode driven by the `.dark` class.
- `DESIGN.md`: tokens, radius (sm 8px, md 12px), and WCAG guidance (yellow only as a background behind dark text).

## Technical Approach

- Switch the dark variant to `@custom-variant dark (@media (prefers-color-scheme: dark))` and move the dark variables into the same media query.
- Map the shadcn variables to BmApp colors:

| shadcn variable | BmApp color |
|---|---|
| background | background |
| foreground | onBackground |
| card / popover | surface / onSurface |
| primary | primary / onPrimary |
| secondary | secondary / onSecondary |
| muted | surfaceVariant / onSurfaceVariant |
| accent | surfaceVariant / onSurface |
| border | outlineVariant |
| input | outline |
| ring | primary |
| chart-1 | primary |
| chart-2 | tertiary |

- Add extended variables (`--table-header`, `--table-header-foreground`, `--table-border`, `--table-text`, `--table-text-secondary`, `--header-highlight`, `--header-background`, `--section-highlight`, `--section-border`, `--tertiary`, `--tertiary-foreground`) and register them in `@theme inline` as `--color-*`.
- Set `--radius: 0.75rem`, so `lg` is 12px and `sm` is about 7px, close to Android's 8dp.
- Add `color-scheme: light dark` so native inputs and scrollbars match.
- Add `src/app/dev/theme/page.tsx`, a token preview that calls `notFound()` in production.
- Add a parity unit test that reads `globals.css` and asserts every BmApp hex appears for its variable in light and dark.

## Expected File Changes

- `src/app/globals.css`: modify
- `src/app/dev/theme/page.tsx`: create
- `src/app/theme-tokens.test.ts`: create
- `DESIGN.md`: update the dark-mode rule (follows the system) and the extended token names
- `feature_list.json`, `PROGRESS.md`: update

## Durable Documentation Impact

- `AGENTS.md`, `ARCHITECTURE.md`, `CONSTRAINTS.md`: not needed.
- `DESIGN.md`: update. Rule: use token utilities (`bg-table-header`, etc.), never raw hex.

## Verification Plan

- `./init.sh` is green, including the parity test.
- `npm run build` succeeds.
- Playwright WebKit iPhone 13 screenshots of `/` and `/dev/theme` with `--color-scheme=light` and `dark`.

## Evidence To Capture

- Test names and counts, the build result, and four screenshots described in `PROGRESS.md`.

## Validator Checklist

- [ ] Every hex matches `Color.kt` for light and dark.
- [ ] Dark mode follows the system, with no toggle.
- [ ] The dev route is unavailable in production.
- [ ] No raw hex outside `globals.css`.
