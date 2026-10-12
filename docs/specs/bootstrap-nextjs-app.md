# Feature Implementation Spec: Next.js app skeleton with lint, typecheck and test gates

## Source Feature

- `id`: bootstrap-nextjs-app
- `area`: platform
- `depends_on`: none
- `status`: not_started (at planning time)
- `source`: `feature_list.json`

## Goal

Turn the empty `PowerAppWeb/` folder into a runnable Next.js app that follows the BmWeb stack. It must have working lint, typecheck and unit-test gates driven by `./init.sh`. A Spanish placeholder home page must render correctly at a phone viewport. Every later feature builds on this skeleton.

## Non-Goals

- Theme tokens, BmApp palette and dark mode (`design-tokens-theme`). Keep the default shadcn/Tailwind base only.
- Firebase SDK setup, login and auth guards (`login-*`, `access-gate`).
- Backend proxy route handlers and env vars for BmBackend (`backend-proxy`).
- PWA manifest, icons, service worker (`pwa-installable`).
- Deployment config for IONOS or Firebase App Hosting, and CI pipelines.
- Playwright/E2E harness (see Verification Plan for why).
- Adding shadcn components beyond what the placeholder needs (at most `button`).

## Job Story

When I start a new implementation session on PowerAppWeb,
I want to run `./init.sh` and get a green install, lint, typecheck and test gate,
so I can build features on a known-good, reproducible baseline.

## Users And Permissions

- Developer or agent: runs `./init.sh` and `npm run dev` locally. There are no end-user permissions in this slice.

## Acceptance Scenarios

### Scenario 1: Clean baseline gate
Given a fresh checkout with `package-lock.json` committed
When the developer runs `./init.sh`
Then `npm ci`, `npm run lint`, `npm run typecheck` and `npm test` all run and exit 0
And the script prints the dev command without starting it.

### Scenario 2: Mobile placeholder renders
Given the dev server is running (`npm run dev`)
When `/` is opened at a 390x844 viewport
Then a Spanish page shows the title "PowerApp" and a short placeholder line (for example "Comparador de tarifas — en construcción")
And there is no horizontal scroll
And `<html lang="es">` is set with a viewport meta that includes `viewport-fit=cover`.

### Scenario 3: Gate catches failures
Given a deliberate type error or failing test
When `./init.sh` runs
Then it exits non-zero (`set -euo pipefail`).

### Scenario 4: Production build works
When `npm run build` runs
Then it succeeds with TypeScript and ESLint errors **not** ignored.

## Repository Research

### Files Inspected

- `PowerAppWeb/` — contains only harness and discovery docs. No app code yet.
- `PowerAppWeb/init.sh` — already branches on `package.json`. Its bootstrapped branch expects `lint`, `typecheck` and `test` scripts.
- `../BmWeb/package.json` — reference stack: Next 15.5, React 19, Tailwind 3.4, shadcn (Radix), Vitest 2, Testing Library, jsdom. Scripts: `dev` (turbopack, port 9002), `lint` (`next lint`), `typecheck` (`tsc --noEmit`), `test` (`vitest run`).
- `../BmWeb/vitest.config.ts` and `vitest.setup.ts` — good patterns to copy: the `@` alias mirrored from tsconfig, jsdom, `src/**/*.test.{ts,tsx}`, a cleanup hook, and matchMedia/ResizeObserver stubs.
- `../BmWeb/components.json` — shadcn config: default style, rsc, `src/app/globals.css`, aliases `@/components`, `@/lib/utils`.
- `../BmWeb/tsconfig.json` — strict, `@/*` → `./src/*`.
- `../BmWeb/next.config.ts` — sets `ignoreBuildErrors` / `ignoreDuringBuilds: true`. **Do not copy this.**
- `../BmWeb/.gitignore` — standard Next ignores.

### Existing Patterns To Follow

- `src/` layout with the App Router (`src/app`), `src/components`, `src/components/ui`, `src/lib`.
- Vitest is kept separate from the Next build, with the alias mirrored.
- npm with `package-lock.json` (the local toolchain is Node 22.22, npm 10.9).

### Current Gaps

- BmWeb has no ESLint config file. `next lint` is deprecated in Next 15.5+. PowerAppWeb needs an explicit flat `eslint.config.mjs` and `lint: "eslint ."`.
- There is no git repo in `PowerAppWeb/` (the environment reports it isn't one). Whether to `git init` is up to the user. It is not required by this feature.

## Technical Approach

1. Create the project files by hand, or run `create-next-app` in a temp directory and copy them across. The app must sit at the repo root without overwriting the harness or docs. Options: TypeScript, App Router, `src/` directory, Tailwind, ESLint, import alias `@/*`, npm.
2. Pin the same major versions as BmWeb: Next 15.5.x, React 19, Tailwind 3.4, Vitest 2, TypeScript 5. Staying aligned means shadcn and Tailwind setup can be copied between the two repos.
3. Run `npx shadcn@latest init` matching BmWeb's `components.json` (base color neutral, CSS variables). Add only `button` so `cn()` in `src/lib/utils.ts` gets exercised.
4. Configure ESLint as a flat config extending `next/core-web-vitals` and `next/typescript` (via `@eslint/eslintrc` FlatCompat or `eslint-config-next`). Ignore `.next`, `node_modules` and `next-env.d.ts`.
5. Configure Vitest by copying BmWeb's `vitest.config.ts` and `vitest.setup.ts` (with their comments trimmed or kept).
6. Root layout: `lang="es"`, metadata title "PowerApp", and a `viewport` export with `width=device-width, initialScale=1, viewportFit="cover"`.
7. Placeholder page: a centered column with max-width ~640px, Spanish text, and one primary `Button` (disabled, label "Empezar"). No navigation.
8. Add one smoke test, `src/app/page.test.tsx`, asserting the Spanish heading renders.
9. Dev script: `next dev --turbopack -p 9003`. It uses a different port from BmWeb (9002) so both can run at the same time.
10. Keep `init.sh` as is (it already does the right thing once `package.json` exists). Only adjust it if a script name differs.

## Implementation Notes

- Tailwind 4 used instead of 3.4: current shadcn CLI targets v4; `tailwind.config.ts` therefore not created (CSS-first config in `globals.css`).
- Vitest disables PostCSS (`css.postcss.plugins: []`) because Next's string-form PostCSS config breaks Vite.

## Expected File Changes

- `package.json`, `package-lock.json` — create
- `tsconfig.json`, `next-env.d.ts`, `next.config.ts` — create. The config must not ignore build errors.
- `eslint.config.mjs` — create
- `postcss.config.mjs`, `tailwind.config.ts`, `components.json` — create
- `vitest.config.ts`, `vitest.setup.ts` — create
- `.gitignore` — create (Next defaults, `.env*.local`, `*.json` service accounts under `secrets/`)
- `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css` — create
- `src/app/page.test.tsx` — create
- `src/lib/utils.ts`, `src/components/ui/button.tsx` — create (shadcn)
- `init.sh` — modify only if script names differ
- `feature_list.json`, `PROGRESS.md` — update status and evidence

## Visual Design Impact

- UI involved: yes (a placeholder only)
- Design source: `DESIGN.md` layout rules: mobile first, max-width ~640px, safe areas, body text at least 16px
- Screens affected: `/` placeholder
- New design artifact required: no. Palette and theming belong to `design-tokens-theme`.

## Durable Documentation Impact

- `ARCHITECTURE.md`: not needed. The structure is the standard Next.js layout; revisit with `backend-proxy`.
- `CONSTRAINTS.md`: not needed. The "don't ignore build errors" rule is enforced by config.
- `AGENTS.md`: not needed. The startup path is unchanged.
- `docs/technical-discovery.md`: update the Candidate Stack line with the pinned versions and dev port 9003.
- `PROGRESS.md`: replace the provisional verification path with the real one.

## Implementation Plan

1. Scaffold the Next.js + TypeScript + Tailwind project at the repo root, preserving the existing files.
2. Add shadcn init plus `button`, the ESLint flat config and the Vitest config.
3. Write the layout, the placeholder page and the smoke test.
4. Run `./init.sh` and `npm run build`, then check the page at 390x844.
5. Update docs, `feature_list.json` (`passing` plus evidence) and `PROGRESS.md`.

## Implementation Tasks

- [ ] Scaffold the app (temp-dir create-next-app, then copy) at Next 15.5.x.
- [ ] Set scripts: `dev`, `build`, `start`, `lint` (`eslint .`), `typecheck` (`tsc --noEmit`), `test` (`vitest run`).
- [ ] Create `eslint.config.mjs` (flat config, next core-web-vitals and typescript).
- [ ] Run `shadcn init` and `shadcn add button`.
- [ ] Copy and adapt `vitest.config.ts` and `vitest.setup.ts`; add the dev deps (vitest, @vitejs/plugin-react, jsdom, @testing-library/*).
- [ ] Write the layout (`lang="es"`, viewport export) and the Spanish placeholder page.
- [ ] Write `src/app/page.test.tsx`.
- [ ] Write `.gitignore`.
- [ ] Run the gates and fix any issues.
- [ ] Update the docs and harness state.

## Verification Plan

- `./init.sh` exits 0. It runs `npm ci`, lint, typecheck and test, and does not start the dev server.
- `npm run build` exits 0 with no ignore flags.
- `npm run dev`, then load `http://localhost:9003` at 390x844, either in the Pencil browser screenshot or in Chrome DevTools device mode. Check the Spanish text, the absence of horizontal scroll, and the `lang` and viewport meta.
- Negative check: temporarily add a type error and confirm `./init.sh` fails, then revert it.
- E2E: no Playwright harness exists yet and this slice has no user flow. Unit smoke plus a manual viewport check is enough. Introducing Playwright is deferred to the first flow feature (`login-email`).

## Evidence To Capture

- Tail of the `./init.sh` output showing lint, typecheck and test passing (test count).
- `npm run build` success line.
- A screenshot or description of `/` at 390x844.
- The pinned versions of next, react, tailwindcss and vitest.

## Validator Checklist

- [ ] Only skeleton work: no Firebase, proxy, theme palette or PWA files.
- [ ] Acceptance scenarios 1–4 pass.
- [ ] `next.config.ts` does not ignore TypeScript or ESLint errors.
- [ ] The lint script works without the deprecated `next lint`.
- [ ] Harness and discovery files are intact (not overwritten by the scaffold).
- [ ] No secrets committed; `.gitignore` covers env files.
- [ ] `feature_list.json` (status `passing`, evidence) and `PROGRESS.md` are updated.
