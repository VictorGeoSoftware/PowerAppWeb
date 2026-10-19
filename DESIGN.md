---
name: PowerAppWeb
description: Mobile-first web mirror of BmApp — yellow accent on slate, clean, data-dense tables.
designAssets:
  sourceOfTruth:
    - ../BmApp/pencil-new.pen
    - ../BmApp/navigation-flow-fee-first.pen
    - ../BmApp/app/src/main/java/com/briel/marnisos/brielapp/ui/theme/
  generatedConcepts: []
colors:
  primary: "#FACC15"
  onPrimary: "#0F172A"
  secondary: "#1F2937"
  accent: "#F59E0B"
  background: "#F8FAFC"
  surface: "#FFFFFF"
  surfaceVariant: "#F1F5F9"
  text: "#0F172A"
  mutedText: "#64748B"
  outline: "#CBD5E1"
  tableHeader: "#5DADE2"
  headerHighlight: "#F3D34A"
  sectionHighlight: "#D0E7FF"
  dark:
    background: "#020617"
    surface: "#0B1220"
    surfaceVariant: "#0F172A"
    secondary: "#E2E8F0"
    mutedText: "#94A3B8"
    outline: "#334155"
    tableHeader: "#1E40AF"
typography:
  title:
    fontFamily: system-ui, -apple-system, Roboto, sans-serif
    fontSize: 22px
    fontWeight: 600
  body:
    fontFamily: system-ui, -apple-system, Roboto, sans-serif
    fontSize: 16px
rounded:
  sm: 8px
  md: 12px
spacing:
  sm: 8px
  md: 16px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.onPrimary}"
    rounded: "{rounded.md}"
---

# Design Direction

## Overview
Mirror BmApp visually; adapt to mobile web conventions. Spanish UI.

## Existing Design Assets
- `../BmApp/*.pen` + Compose theme: source of truth for screens, flow, and tokens.
- `../logo_briel.png`, `../BmApp/launcher_icon_export/`: brand/PWA icons.

## Layout
- Designed for 360–430px width first; content max-width ~640px centered on larger screens.
- Android drawer → hamburger menu with same entries; sticky top bar.
- Respect safe areas (`env(safe-area-inset-*)`) for iOS notch/home indicator in standalone mode.
- Comparator table: horizontal scroll with sticky first column on phones.
- Comparator (`src/components/proposals/`, port of BmApp `ComparatorProposalsView`). Deliberate mobile adaptations: the labels column is 176px instead of 400dp and sticks to the left (`sticky left-0 bg-background`) while the other columns scroll under it. The value columns are 168px instead of 200dp. Rows have fixed heights (`ROW_H` in `table-cells.tsx`) so the separate column stacks line up. Only the table scrolls sideways; the page never does. Fixed amounts survive a reload (BmApp keeps them in memory only).
- Comparator colours are fixed and identical in dark mode (BmApp hard-codes them): `--best-option` / `--best-option-foreground` (#DCFCE7 / #166534, best-option card); `--delta-negative` #D32F2F (proposal dearer); `--delta-positive` #000000 (proposal cheaper). The black text on the dark-mode `section-highlight` blue has low contrast, but it matches BmApp.
- Android Toasts become an inline `role="status"` `aria-live="polite"` pill fixed above the bottom safe area that hides after 2.5 s (first used by "Precios copiados desde …" on Current Conditions). No toast library. Android `ModalBottomSheet` becomes the shadcn `Sheet` with `side="bottom"`.

## Core Screens
Login, Access pending, Fetch Consumption (CUPS / camera / PDF / photo), Current Conditions, Proposals/Comparator, Configuration.

## Accessibility Baseline
Touch targets ≥44px, inputs ≥16px font (prevents iOS zoom), WCAG AA contrast (yellow only as background with dark text), numeric keyboards for prices.

## Do's and Don'ts
- Do use shadcn components themed with these tokens. Dark mode follows the system (`prefers-color-scheme`), no toggle — same as Android.
- Do use token utilities only (`bg-primary`, `bg-table-header`, `text-table-text`, `bg-header-highlight`, `bg-section-highlight`, `border-table-border`, `bg-tertiary`…); never raw hex outside `src/app/globals.css`.
- Token parity with BmApp `Color.kt` is enforced by `src/app/theme-tokens.test.ts`; dev preview at `/dev/theme` (404 in production).
- Don't invent new colors or flows beyond the Android app.

## Open Design Questions
None blocking.
