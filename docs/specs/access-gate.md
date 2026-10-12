# Feature Implementation Spec: Granted-user check with access-denied handling

## Source Feature
- `id`: access-gate · `area`: auth · `depends_on`: login-email, backend-proxy (accepted)

## Goal
After Firebase sign-in, and on every app load with a restored session, the web calls `POST /user-data` (BmApp payload: uid, email, displayName, photoURL, providerIds). Only a backend-accepted Broker reaches protected pages.

## Decisions
- **Parity with BmApp `AuthViewModel.handleSyncFailure`**: on 403 the app signs the Broker out (so the next visit can't skip the check) and shows the backend's Spanish message on `/login`. This is the "acceso pendiente" notice; no separate signed-in pending screen. Message fallback: "Esta cuenta no está autorizada para acceder. Contacta con el equipo de administración."
- **Stricter than Android**: the check runs on every load, not only at login, so a revoked grant is caught on the next visit.
- 401 → sign out with "Tu sesión ha caducado. Inicia sesión de nuevo."
- Other failures (network, 5xx) keep the session and show "No se pudo verificar tu acceso" with "Reintentar" and "Cerrar sesión".
- `phoneUuid` is not sent yet (`device-binding-basic`).

## Technical Approach
- `src/lib/api/bm-fetch.ts`: `bmFetch(user, path, init, forceRefresh)` calls `/api/bm/<path>` with the Bearer token; throws `BmApiError(status, backendMessage)`. Reused by all later features.
- `src/lib/auth/user-data-sync.ts`: payload builder plus `syncUserData`.
- `AuthProvider` statuses: `loading → signed-out | verifying → granted | error`, plus `notice`, `retry`, `signOutUser`. `verifyAccess` is injectable for tests.
- Guards: `RequireAuth` renders only when `granted` (error → retry screen); `RedirectIfAuthenticated` renders only when `signed-out`.

## Verification
- Unit: `bm-fetch` (token, proxy path, error messages), AuthProvider (granted, 403, 401, 5xx), Home guard states.
- E2E against local Docker QA backend: real account → `/user-data` 200 → home; mocked 403 → signed out + message on login, `/` bounces to login; mocked 502 → retry screen, retry recovers.
