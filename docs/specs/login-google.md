# Feature Implementation Spec: Google login

## Source Feature
- `id`: login-google · `area`: auth · `depends_on`: login-email (accepted)

## Goal
"Continuar con Google" (outlined button, as in BmApp `LoginScreen.kt`) signs the Broker in with Google through Firebase, on iOS Safari and Android Chrome.

## Non-Goals
Granted-user check (`access-gate`), installed-PWA behaviour (final stage).

## Acceptance Scenarios
1. Tapping the button opens the Google account chooser (`prompt=select_account`) in a popup; on success the Broker lands on `/`.
2. If the browser blocks the popup (`auth/popup-blocked`), the app falls back to a full-page redirect.
3. Closing the popup shows "Inicio de sesión con Google cancelado"; the form is usable again.
4. While signing in, both buttons are disabled.

## Technical Approach
- `src/lib/auth/google-sign-in.ts`: popup first, redirect only on `popup-blocked`. Popup is preferred because Firebase redirect flows break in Safari when `authDomain` is a different origin (third-party storage blocking).
- `LoginForm` gains optional `onGoogleLogin`; shared loading/error state. New Spanish error codes in `login-errors.ts`.

## Verification
- Unit: popup/redirect/rethrow; button hidden without handler, calls handler, cancel message.
- E2E (`iphone-webkit`, `android-chromium`): popup opens on Google/Firebase auth handler URL; closing it shows the cancel message.
- Manual (cannot be automated): complete a real Google login at `http://localhost:9003/login` on the Mac. Real-phone check needs an authorized domain: Firebase only allows `localhost` and listed domains, so a LAN IP must be added in Firebase Auth → Settings → Authorized domains, or wait for the hosted HTTPS URL.

## Validator Checklist
- [ ] Popup first, redirect fallback only on block.
- [ ] Manual Google login completed and recorded.
