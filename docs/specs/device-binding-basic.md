# Feature Implementation Spec: Browser registered as Bound Device

## Source Feature
- `id`: device-binding-basic · `area`: auth · `depends_on`: access-gate (accepted)

## Goal
The web always sends a stable per-browser `phoneUuid` in `POST /user-data`, so the backend's one-device rule (BmBackend `UserDataService.upsertUserData`) applies to browsers exactly like Android phones. No backend change needed.

## Backend behaviour (inspected, local QA)
- No binding yet → the incoming id is stored (binds).
- Bound to another id → 403 "Esta cuenta ya está vinculada a otro dispositivo. Contacta con el equipo de administración." and an audit log line.
- Admin reset (`POST /admin/reset-device-binding`, BmWeb) clears `phone_uuid` → next login binds the new device.
- Missing `phoneUuid` → not enforced (gap; see risks).

## Technical Approach
- `src/lib/auth/device-id.ts`: `getOrCreateDeviceId()` → `web-<uuid v4>` in `localStorage["bm.deviceId"]`; kept across logouts (BmApp `DeviceIdLocalDataSource` parity). Fallback UUID generator for non-secure contexts (LAN-IP http testing). Fits the 64-char column.
- `syncUserData` defaults `phoneUuid` to that id. The 403 message is already shown on `/login` by `access-gate`.
- E2E: `e2e/fixtures.ts` pins the device id (`E2E_DEVICE_ID`, default `web-e2e-playwright`) so runs don't lock the QA account.

## Non-Goals
Storage-eviction resilience and anti-sharing hardening (`device-binding-hardening`); backend making `phoneUuid` mandatory (pre-PROD).

## Verification
- Unit: id format/length/stability/reuse; payload always includes `phoneUuid`.
- E2E vs local Docker QA: request carries the E2E id; second browser with another id gets the real backend 403 message.
- Admin-reset path: cleared `phone_uuid` in local QA DB (same as `clearPhoneUuidByEmail`) → login from a new id succeeds and binds it.

## Dev note
E2E runs bind the test account to `web-e2e-playwright` in local QA. Your own browser will then be rejected until the binding is reset (BmWeb admin reset, or locally:
`docker exec bminfra-postgres-1 psql -U bm_app -d bm_qa -c "update user_data set phone_uuid=null where uid='<firebase uid>'"`). Never do this against remote QA/PROD; use BmWeb there.
