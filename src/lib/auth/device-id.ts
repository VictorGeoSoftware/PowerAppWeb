export const DEVICE_ID_STORAGE_KEY = "bm.deviceId";

function randomUuid(): string {
  // crypto.randomUUID needs a secure context; LAN-IP testing over http does not have one.
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Stable per-browser identifier sent as `phoneUuid` (BmApp DeviceIdLocalDataSource
 * parity). Generated once, kept across logouts. The `web-` prefix lets admins
 * tell browser bindings from Android ones. Storage eviction (iOS) would produce
 * a new id → hardening is tracked in `device-binding-hardening`.
 */
export function getOrCreateDeviceId(storage: Storage = window.localStorage): string {
  const existing = storage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing) return existing;
  const id = `web-${randomUuid()}`;
  storage.setItem(DEVICE_ID_STORAGE_KEY, id);
  return id;
}
