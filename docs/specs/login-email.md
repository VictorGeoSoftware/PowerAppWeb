# Feature Implementation Spec: Email/password login

## Source Feature

- `id`: login-email
- `area`: auth
- `depends_on`: design-tokens-theme (accepted)
- `status`: in_progress
- `source`: `feature_list.json`

## Goal

A Broker signs in with email and password using Firebase Auth in project `brielmarnysos-1dc68`, the same accounts as Android. Signed-out visitors are sent to `/login`. Signed-in Brokers land on `/`, a temporary signed-in placeholder until `app-shell-navigation`. The session survives reloads.

## Non-Goals

- Google sign-in (`login-google`). The button is not shown yet.
- The granted-user check, `/user-data` sync, and the access-pending screen (`access-gate`).
- Device id (`device-binding-basic`) and logout (`logout-force-logout`).
- Password reset and the "request access" action. Android shows the text "¿No tienes cuenta? Solicitar acceso" without any action; the web copies the text only.
- Analytics events (`analytics-screen-tracking`).

## Acceptance Scenarios

### Scenario 1: Signed out goes to login
Given no session
When `/` is opened
Then the app redirects to `/login`.

### Scenario 2: Successful login
Given a valid QA account
When the Broker enters email and password and taps "Iniciar sesión"
Then the button shows "Iniciando sesión…" and the app lands on `/`, which shows the Broker's email.
And after a reload the Broker is still signed in.

### Scenario 3: Wrong credentials
When the password is wrong
Then "Correo o contraseña incorrectos" is shown and the inputs stay filled.

### Scenario 4: Form rules
The submit button is disabled while either field is blank or the request is loading. The email is trimmed. On iOS, inputs use font-size of at least 16px (no zoom), the email field uses `type=email` and `autocomplete=username`, and the password field uses `autocomplete=current-password`.

### Scenario 5: Already signed in
Given a session
When `/login` is opened
Then the app redirects to `/`.

## Repository Research

- `../BmApp/.../ui/views/auth/LoginScreen.kt`: layout is icon (96dp), app name, subtitle, email, password, primary button, Google outlined button, "no account" row, error text.
- `../BmApp/.../auth/AuthViewModel.kt` `mapLoginError`: maps invalid-credential, user-disabled and too-many-requests. Android shows these in English; the web uses Spanish per the brief.
- `../BmApp/.../res/values-es/strings.xml`: login strings (unaccented). The web uses correctly accented Spanish.
- `../BmApp/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png`: brand icon.
- Firebase web app config was provided by the user. The API key was checked against Identity Toolkit, and email/password sign-in is enabled.
- `../BmWeb/src/lib/firebase/client.ts`, `components/auth-guard.tsx`: the existing client-side guard pattern.

## Technical Approach

- `npm i firebase`. The config lives in `src/lib/firebase/config.ts`; the Firebase web config is public by design.
- `src/lib/firebase/client.ts`: a lazy `getFirebaseAuth()` that initializes the app once on the client. It uses the default IndexedDB persistence.
- `src/lib/auth/login-errors.ts`: `loginErrorMessage(code)` maps Firebase codes to Spanish:

| Firebase code | Message |
|---|---|
| `auth/invalid-credential`, `auth/wrong-password`, `auth/user-not-found` | "Correo o contraseña incorrectos" |
| `auth/invalid-email` | "Correo electrónico no válido" |
| `auth/user-disabled` | "Esta cuenta ha sido deshabilitada" |
| `auth/too-many-requests` | "Demasiados intentos. Inténtalo más tarde" |
| `auth/network-request-failed` | "Sin conexión. Revisa tu red" |
| anything else | "Error inesperado al iniciar sesión" |

- `src/components/auth/auth-provider.tsx`: a client context wrapping `onAuthStateChanged` and exposing `{ user, loading }`.
- `src/components/auth/require-auth.tsx` and `redirect-if-authenticated.tsx`: client guards that use `router.replace`. While loading they show a centered spinner.
- `src/app/login/page.tsx` plus `src/components/auth/login-form.tsx`: the Android layout using the shadcn `Input`, `Label` and `Button` and the theme tokens.
- `src/app/page.tsx`: wrapped in `RequireAuth`. It shows "Sesión iniciada como {email}" as a temporary placeholder.
- Playwright: add `@playwright/test`, a `playwright.config.ts` with a WebKit iPhone 13 project and a Chromium Pixel 7 project, a `webServer` running `npm run dev`, and the script `test:e2e`. The E2E suite covers scenarios 1, 3 and 5 against real Firebase. The success path runs only when `E2E_EMAIL` and `E2E_PASSWORD` are set. `init.sh` stays non-blocking and does not run E2E; that command is printed instead.

## Expected File Changes

- `package.json`, `package-lock.json`: add firebase and @playwright/test, plus the `test:e2e` script
- `src/lib/firebase/{config,client}.ts`, `src/lib/auth/login-errors.ts` (+ test): create
- `src/components/auth/{auth-provider,require-auth,redirect-if-authenticated,login-form}.tsx` (+ form test): create
- `src/components/ui/{input,label}.tsx`: shadcn add
- `src/app/layout.tsx`: wrap in `AuthProvider`
- `src/app/login/page.tsx`: create. `src/app/page.tsx`: modify. `src/app/page.test.tsx`: update.
- `public/brand-icon.png`: copy of the Android foreground icon
- `playwright.config.ts`, `e2e/login.spec.ts`: create. `.gitignore`: add Playwright output.
- `vitest.config.ts`: exclude `e2e/`

## Visual Design Impact

- The login screen mirrors `LoginScreen.kt` with the `DESIGN.md` tokens: primary yellow button, outline inputs with a primary focus ring, muted subtitle, tertiary "Solicitar acceso" text, and error text in the destructive color. Content is max 400px wide and centered, with safe-area padding.

## Durable Documentation Impact

- `AGENTS.md`: update the verification line to mention `npm run test:e2e` for UI and auth features.
- `docs/technical-discovery.md`: add the Firebase web app registration and the E2E command.

## Verification Plan

- `./init.sh` green: unit tests for error mapping, form enable/disable, error display and the trimmed email.
- `npm run build`.
- `npm run test:e2e`: redirect, wrong-password Spanish error, and (with credentials) success plus persistence after reload, on WebKit iPhone 13 and Chromium Pixel 7.
- Screenshots of `/login` in light and dark at iPhone 13.

## Validator Checklist

- [ ] No access-gate, Google or logout logic was pulled in.
- [ ] The Firebase config is the `brielmarnysos-1dc68` web app.
- [ ] Spanish messages with correct accents. iOS-friendly inputs.
- [ ] E2E evidence, or a recorded reason if the success path was skipped.
