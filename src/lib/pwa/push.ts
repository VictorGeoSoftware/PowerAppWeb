import type { User } from "firebase/auth";
import { bmFetch } from "@/lib/api/bm-fetch";
import { getFirebaseApp } from "@/lib/firebase/client";
import { isIos, isStandalone } from "./platform";

export type PushSupport = "unsupported" | "needs-install" | "available";
export type PushPlatform = "ios" | "android" | "desktop";

/** `{uid, token}` of the token registered in BmBackend. Cleared on logout. */
export const PUSH_TOKEN_KEY = "bm.pushToken";
/** Survives logout, like `bm.installHintDismissed`. */
export const PUSH_PROMPT_DISMISSED_KEY = "bm.pushPromptDismissed";

export const PUSH_TOKENS_PATH = "push/web-tokens";

type NavLike = Parameters<typeof isIos>[0] & { serviceWorker?: unknown };

export type PushEnv = {
  nav: NavLike;
  win: { Notification?: unknown; PushManager?: unknown };
  matchMedia?: (query: string) => { matches: boolean };
  vapidKey: string | undefined;
  /** Result of FCM `isSupported()`. */
  fcmSupported: boolean;
};

/**
 * iOS tabs are checked before the APIs: Safari only exposes `PushManager` and
 * `Notification` to installed web apps (iOS 16.4+), so a tab must get the install hint.
 */
export function pushSupport({ nav, win, matchMedia, vapidKey, fcmSupported }: PushEnv): PushSupport {
  if (!vapidKey) return "unsupported";
  if (isIos(nav) && !isStandalone(nav, matchMedia)) return "needs-install";
  if (!win.Notification || !win.PushManager || !nav.serviceWorker || !fcmSupported) return "unsupported";
  return "available";
}

export function pushPlatform(nav: Pick<Navigator, "userAgent" | "maxTouchPoints">): PushPlatform {
  if (isIos(nav)) return "ios";
  if (/Android/i.test(nav.userAgent)) return "android";
  return "desktop";
}

export type StoredPushToken = { uid: string; token: string };

export function readStoredPushToken(): StoredPushToken | null {
  try {
    const raw = localStorage.getItem(PUSH_TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPushToken>;
    return typeof parsed.uid === "string" && typeof parsed.token === "string"
      ? { uid: parsed.uid, token: parsed.token }
      : null;
  } catch {
    return null;
  }
}

export function storePushToken(value: StoredPushToken): void {
  try {
    localStorage.setItem(PUSH_TOKEN_KEY, JSON.stringify(value));
  } catch {
    // Storage unavailable: the next app start re-posts the token.
  }
}

export function clearStoredPushToken(): void {
  try {
    localStorage.removeItem(PUSH_TOKEN_KEY);
  } catch {
    // Nothing to clear.
  }
}

export function needsRegistration(stored: StoredPushToken | null, uid: string, token: string): boolean {
  return !stored || stored.uid !== uid || stored.token !== token;
}

/** E2E seam: only in builds with `NEXT_PUBLIC_E2E=1` (scripts/e2e.sh); dead code elsewhere. */
function testToken(): string | undefined {
  if (process.env.NEXT_PUBLIC_E2E !== "1" || typeof window === "undefined") return undefined;
  return (window as unknown as { __bmPushTestToken?: string }).__bmPushTestToken;
}

export function vapidKey(): string | undefined {
  return process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || undefined;
}

export async function isFcmSupported(): Promise<boolean> {
  if (testToken()) return true;
  try {
    const { isSupported } = await import("firebase/messaging");
    return await isSupported();
  } catch {
    return false;
  }
}

async function messagingWithRegistration() {
  const { getMessaging } = await import("firebase/messaging");
  const messaging = getMessaging(getFirebaseApp());
  const registration = await navigator.serviceWorker.ready;
  return { messaging, registration };
}

/** FCM token on the existing `/sw.js` registration. Permission must already be granted. */
export async function fetchFcmToken(): Promise<string> {
  const seam = testToken();
  if (seam) return seam;
  const { getToken } = await import("firebase/messaging");
  const { messaging, registration } = await messagingWithRegistration();
  const token = await getToken(messaging, { vapidKey: vapidKey(), serviceWorkerRegistration: registration });
  if (!token) throw new Error("Empty FCM token");
  return token;
}

/** Best-effort FCM `deleteToken`; never throws. */
export async function deleteFcmToken(): Promise<void> {
  if (testToken()) return;
  try {
    if (!("serviceWorker" in navigator)) return;
    const { deleteToken } = await import("firebase/messaging");
    const { messaging, registration } = await messagingWithRegistration();
    // Without this, deleteToken registers the default /firebase-messaging-sw.js (which we don't serve).
    const internal = messaging as unknown as { swRegistration?: ServiceWorkerRegistration };
    internal.swRegistration ??= registration;
    await deleteToken(messaging);
  } catch {
    // The backend row is removed anyway (logout DELETE or grant wipe).
  }
}

type FetchFn = (path: string, init?: RequestInit) => Promise<Response>;

export async function registerPushToken(fetchFn: FetchFn, token: string, platform: PushPlatform): Promise<void> {
  await fetchFn(PUSH_TOKENS_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, platform }),
  });
}

/**
 * Manual logout, before `auth/logout` while the ID token is still valid:
 * best-effort DELETE of the Broker's own token, then FCM `deleteToken`.
 */
export async function unregisterPush(user: Pick<User, "getIdToken" | "uid">): Promise<void> {
  const stored = readStoredPushToken();
  if (!stored) return;
  if (stored.uid === user.uid) {
    try {
      await bmFetch(user, PUSH_TOKENS_PATH, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: stored.token }),
      });
    } catch {
      // Logout must always succeed locally.
    }
  }
  await deleteFcmToken();
}

/** Forced logout: no backend call (BmApp parity); the grant wipe removes the row. */
export function discardPushLocally(): void {
  if (!readStoredPushToken()) return;
  void deleteFcmToken();
}
