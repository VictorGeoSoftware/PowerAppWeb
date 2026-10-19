# Feature Implementation Spec: Installable PWA with iOS install hint

## Source Feature

- `id`: pwa-installable
- `area`: pwa
- `depends_on`: app-shell-navigation (accepted)
- `status`: not_started
- `source`: `feature_list.json`

## Goal

PowerApp can be installed on the home screen and launches standalone, without the browser UI:
- **Android Chrome**: install through Chrome's own prompt or menu, plus an in-app "Instalar aplicación" menu entry that opens the native install dialog.
- **iPhone Safari**: iOS has no install API, so the app shows an "Añadir a pantalla de inicio" hint with the Share → "Añadir a pantalla de inicio" steps.

This requires a web app manifest, BmApp brand icons (any, maskable and Apple), theme colours and a minimal service worker that later features (`web-push-registration`) can extend.

## Non-Goals

- No offline support and no caching strategy (`docs/risks-and-open-questions.md`, "Later / Not MVP"). The service worker has **no `fetch` handler**, so it never serves stale app or API data.
- No Web Push and no Firebase Messaging service worker (`web-push-registration`).
- No self-hosting of the Tesseract.js assets. The risks doc assigned this here, but without offline support it does not affect installability. Move the risk to "Later / Not MVP" (offline).
- No splash-screen image set for iOS (`apple-touch-startup-image`). iOS shows the background colour.
- No hosting or deployment work. The HTTPS deployment is a prerequisite for the real-device check, which is done later.

## Job Story

When a Broker uses PowerApp every day on their phone,
they want it on the home screen like a native app,
so they open it in one tap, full screen, like BmApp.

## Users And Permissions

- Everyone. The manifest and icons are public static assets.
- Installing the app does not bypass authentication. The start URL `/` goes through the existing auth and gate redirects.
- The hint and the menu entry are shown only inside the signed-in shell (the hamburger menu), plus the iOS hint banner (Scenario 4).

## Acceptance Scenarios

### Scenario 1: Manifest
`GET /manifest.webmanifest` (Next `src/app/manifest.ts`) returns:
- `name: "PowerApp"`, `short_name: "PowerApp"`, `description: "Comparador de tarifas eléctricas para brokers"`, `lang: "es"`;
- `id: "/"`, `start_url: "/"`, `scope: "/"`, `display: "standalone"`, `orientation: "portrait"`;
- `background_color: "#F8FAFC"` and `theme_color: "#F8FAFC"` (BmApp light `--background`);
- `icons`: 192 and 512 `purpose: "any"`, plus 512 `purpose: "maskable"`, all PNG.

`layout.tsx` metadata links the manifest and sets:
- `appleWebApp: { capable: true, title: "PowerApp", statusBarStyle: "default" }`;
- `icons.apple` set to a 180×180 PNG;
- `viewport.themeColor` light `#F8FAFC`, dark `#020617` (from `globals.css` dark `--background`).

### Scenario 2: Icons from the BmApp brand
Icons are generated once from `../BmApp/launcher_icon_export/hIYe8.png` (1024×1024: rounded yellow gradient with a dark bolt and €) and committed under `public/icons/`:
- `icon-192.png` and `icon-512.png` (any): the rounded icon as is, with transparent corners.
- `icon-maskable-512.png`: a **full-bleed** square gradient, with the glyph scaled into the central 80% safe zone.
- `apple-touch-icon.png` (180): full-bleed and **opaque**. iOS rounds the corners itself and turns transparency black.
- `favicon.ico` or `src/app/icon.png`: optional. Replace the Next default if one exists.

Commit the generation command or script as `scripts/generate-pwa-icons.sh` (macOS `sips` and/or ImageMagick if available; document it) so the icons can be rebuilt. If an exact full-bleed version can't be produced from the export, crop the inner square of the rounded icon so the corners are filled with gradient, then check the result visually.

### Scenario 3: Android install
Given Android Chrome, not installed
- Chrome's install criteria are met: manifest, icons and a registered service worker. In Chrome DevTools, Application → Manifest shows no installability errors.
- When `beforeinstallprompt` fires, the app calls `preventDefault()`, keeps the event and shows an **"Instalar aplicación"** entry in the hamburger menu, above "Cerrar sesión".
- Tapping it calls `prompt()`. Whatever the choice, the entry disappears (the event can only be used once).
- After `appinstalled`, or when running standalone, the entry is never shown.

### Scenario 4: iOS hint
Given iPhone or iPad Safari (`/iPad|iPhone|iPod/` or iPadOS reporting as Mac with touch), not standalone (`navigator.standalone !== true` and not `matchMedia("(display-mode: standalone)")`)
- The hamburger menu shows an **"Instalar aplicación"** entry. It opens a bottom `Sheet` titled "Instalar PowerApp" with the steps:
  1. "Pulsa el botón Compartir" (with the lucide `Share` icon).
  2. "Elige «Añadir a pantalla de inicio»" (with the `SquarePlus` icon).
  3. "Pulsa «Añadir»".
  The sheet has a "Entendido" button.
- On the first signed-in visit, a dismissible banner at the bottom of the shell says "Instala PowerApp en tu pantalla de inicio" with "Cómo" (opens the sheet) and a close ×. Dismissing it stores `localStorage["bm.installHintDismissed"]="1"`, and it is not shown again. The menu entry stays. This key is **not** cleared on logout. Add it to the list of keys kept in `src/lib/auth/logout.ts`, like `bm.deviceId`.
- Other iOS browsers (CriOS, FxiOS, EdgiOS) also install through Share on iOS 16.4+, so the same hint applies. Detect iOS, not Safari.

### Scenario 5: Standalone launch
Given the app is launched from the home screen
- It opens at `/`. The existing redirects land the Broker on the right screen; a signed-in session persists, because Firebase uses IndexedDB.
- There is no browser UI. The top bar respects `env(safe-area-inset-top)` (already done in `app-shell-navigation`). The status bar uses the theme colour.
- No install entry or banner is shown.

### Scenario 6: Service worker
- `public/sw.js` has only `install` (`self.skipWaiting()`) and `activate` (`clients.claim()`) handlers. There is no `fetch` handler and no caching.
- It is registered from a client component in the root layout, only in production builds (`process.env.NODE_ENV === "production"`) and when `"serviceWorker" in navigator`, with scope `/`. Registration failure is ignored, with a `console.warn`.
- In `next.config.ts`, serve `/sw.js` with `Cache-Control: no-cache` and `Service-Worker-Allowed: /` (headers()). Serve `/manifest.webmanifest` with the default caching.
- Dev (`npm run dev`) does not register it, so the user's :9003 phone server is not affected.

## Repository Research

### Files Inspected
- `src/app/layout.tsx`: metadata (title, description) and viewport (`viewportFit: "cover"`); no manifest, icons or theme colour.
- `next.config.ts`: `distDir` and env; no headers.
- `public/brand-icon.png`: 432 px, bolt only, transparent; used in the UI, not suitable as a launcher icon.
- `../BmApp/launcher_icon_export/{hIYe8 (1024 rounded), pJrMG (1152 with shadow), WcWFv (512)}.png`, `../logo_briel.png` (1049×617 wordmark, not used).
- `src/app/globals.css`: `--background` is `#F8FAFC` (light) and `#020617` (dark); `--primary` is `#FACC15`.
- `src/components/shell/{app-shell,app-menu,menu-entries}.tsx`: the menu structure, `entryClass`, logout button, `Sheet`.
- `src/components/ui/sheet.tsx` (bottom sheet pattern from `conditions-copy-from-proposal`).
- `src/lib/auth/logout.ts` (`clearLocalSessionData` keeps `bm.deviceId`).
- `docs/technical-discovery.md` (iOS: no auto prompt, show a hint; HTTPS), `docs/build-brief.md` item 7, `docs/risks-and-open-questions.md`, `docs/after-qa-release-tasks.md` §6, `DESIGN.md` (safe areas, icon sources).

### Existing Patterns To Follow
- Spanish strings go in a `messages.ts` per area (`src/lib/pwa/messages.ts`).
- Pure detection helpers take an injected `navigator`/`matchMedia` and have Vitest tests.
- Bottom `Sheet` with buttons of at least 44 px; token classes only.

### Current Gaps
- Lighthouse 12 removed the PWA category. Use Chrome DevTools Application → Manifest (installability) and the E2E assertions instead, and record which method was used.
- The real install check needs HTTPS hosting. It is listed in `docs/after-qa-release-tasks.md` §6 and covered by `qa-real-device-checks`.

## Technical Approach

1. `scripts/generate-pwa-icons.sh` creates the `public/icons/*` files (Scenario 2).
2. `src/app/manifest.ts` (`MetadataRoute.Manifest`), plus metadata and viewport updates in `layout.tsx`.
3. `public/sw.js` and `src/components/pwa/service-worker-registrar.tsx` (mounted in the root layout); headers in `next.config.ts`.
4. `src/lib/pwa/platform.ts`: `isIos(nav)`, `isStandalone(nav, matchMedia)`.
5. `src/components/pwa/install-provider.tsx`: a context mounted in the root layout so the `beforeinstallprompt` event is captured early. It exposes `{ canPrompt, promptInstall(), showIosHint, installed }` and listens for `appinstalled`.
6. `src/components/pwa/install-menu-entry.tsx` (in `AppMenu` above logout), `ios-install-sheet.tsx` and `ios-install-banner.tsx` (in `AppShell`, above the bottom safe area).

## Expected File Changes
- Create:
  - `public/icons/{icon-192,icon-512,icon-maskable-512,apple-touch-icon}.png`;
  - `scripts/generate-pwa-icons.sh`;
  - `src/app/manifest.ts`;
  - `public/sw.js`;
  - `src/components/pwa/*` and tests;
  - `src/lib/pwa/{platform,messages}.ts` and tests;
  - `e2e/pwa.spec.ts`.
- Modify:
  - `src/app/layout.tsx`;
  - `next.config.ts`;
  - `src/components/shell/{app-menu,app-shell}.tsx`;
  - `src/lib/auth/logout.ts` (keep the hint key) and its test.
- Docs: `DESIGN.md`, `docs/technical-discovery.md`, `docs/risks-and-open-questions.md`, `README.md` (icon script), `docs/after-qa-release-tasks.md`, `feature_list.json`, `PROGRESS.md`.

## Visual Design Impact
- UI is involved:
  - a menu entry in the existing menu style;
  - the iOS steps sheet: a bottom `Sheet` with numbered rows and inline icons, and an "Entendido" primary button of at least 44 px;
  - a banner with token colours (`bg-card`, `border`), bottom-anchored with `env(safe-area-inset-bottom)`, that must not cover the content's last action (add bottom padding while it is visible);
  - the launcher icons.
- Update `DESIGN.md` with these components and the icon sources and rules (Apple icon opaque, maskable safe zone).

## Durable Documentation Impact
- `DESIGN.md`: update with the install entry, the iOS sheet and banner, and the icon rules.
- `docs/technical-discovery.md`: update with the manifest, the service worker (no fetch handler, prod only, extended by web push), the installability check method and the iOS detection.
- `docs/risks-and-open-questions.md`: move Tesseract self-hosting to Later (offline); note that the Lighthouse PWA audit no longer exists.
- `README.md`: add the icon regeneration command.
- `AGENTS.md`, `docs/domain-model.md`, `ARCHITECTURE.md`, `CONSTRAINTS.md`: not needed.

## Implementation Plan
1. Icons, the script, and a visual check of all four PNGs (including the maskable one inside the circle mask).
2. Manifest, metadata and theme colours.
3. Service worker, registrar and headers.
4. Platform helpers, install provider, menu entry, iOS sheet and banner.
5. Tests, E2E, the DevTools installability check, and docs.

## Implementation Tasks
- [ ] Platform tests:
  - [ ] iPhone Safari, iPadOS desktop UA with touch, and CriOS → iOS;
  - [ ] Android Chrome and desktop → not iOS;
  - [ ] standalone via `navigator.standalone` or display-mode.
- [ ] Install provider and RTL tests:
  - [ ] a synthetic `beforeinstallprompt` (with `prompt`/`userChoice` mocks) → the menu entry appears; a tap calls `prompt` once and the entry disappears;
  - [ ] `appinstalled` hides it;
  - [ ] standalone → no entry or banner;
  - [ ] iOS → entry, sheet steps text and banner; dismissing persists; the banner is not shown again on remount;
  - [ ] logout keeps `bm.installHintDismissed`.
- [ ] Manifest unit test: the fields in Scenario 1, and that the icon files exist on disk with the declared sizes (read PNG width and height).
- [ ] E2E `e2e/pwa.spec.ts` (android-chromium, production build from the script):
  - [ ] the `<link rel="manifest">` resolves to valid JSON with the Scenario 1 fields;
  - [ ] every icon URL returns 200 `image/png`;
  - [ ] `apple-touch-icon` and the theme-color meta are present;
  - [ ] `navigator.serviceWorker.ready` resolves with scope `/`, and `/sw.js` has `cache-control: no-cache`;
  - [ ] a dispatched synthetic `beforeinstallprompt` shows "Instalar aplicación" in the menu;
  - [ ] with an iPhone UA override (`test.use({ userAgent })`), signed in, the banner shows, "Cómo" opens the steps sheet, and dismissing survives a reload.
  - [ ] Take a 390 px screenshot of the banner and the sheet.
- [ ] Manual: Chrome DevTools Application → Manifest on the E2E production build. Confirm there are no installability errors and that the icons render, including the maskable preview. Record a screenshot or notes.
- [ ] Add the real-device install items to `docs/after-qa-release-tasks.md` §6 (keep or refine the existing line).

## Verification Plan
- `./init.sh`: green.
- `npm run test:e2e:quick -- e2e/pwa.spec.ts` while iterating.
- A full `npm run test:e2e` once at the end (android-chromium, 15-minute timeout, no piping). The service worker now registers in E2E builds. Confirm that existing specs using `page.route` still intercept: a service worker without a fetch handler does not affect routing, but check it.
- Feature verification:
  - "Lighthouse installability" → DevTools installability check (Lighthouse 12 has no PWA audit); record it.
  - "Install on iPhone and Android" → deferred to the HTTPS QA deployment (`qa-real-device-checks`), unless the user tests via `adb reverse` on Android now (localhost counts as a secure context).

## Evidence To Capture
- Vitest count, focused and full E2E results, the DevTools installability result, screenshots (banner, sheet, icons), and the real-device install result or a deferral note.

## Validator Checklist
- [ ] The manifest fields and icons match Scenarios 1–2; the Apple icon is opaque and the maskable icon respects the safe zone.
- [ ] The service worker has no fetch handler, registers in production only, and `/sw.js` is not cached.
- [ ] The Android menu entry appears only with a captured prompt, is used once, and is hidden when installed or standalone.
- [ ] The iOS sheet, banner and dismissal persistence work as specified; the hint key survives logout.
- [ ] No offline caching, push or deployment changes.
- [ ] Docs, `feature_list.json` and `PROGRESS.md` are updated.
