import type { User } from "firebase/auth";
import { bmFetch } from "@/lib/api/bm-fetch";
import { clearStudyStorage } from "@/lib/gate/storage";
import { clearStoredPushToken } from "@/lib/pwa/push";

/**
 * Best-effort `POST /auth/logout` (marks the Broker offline), like BmApp
 * AuthRepositoryImpl.logout(): cached token, no body, failures ignored.
 */
export async function logoutFromBackend(user: Pick<User, "getIdToken">): Promise<void> {
  try {
    await bmFetch(user, "auth/logout", { method: "POST" });
  } catch {
    // Logout must always succeed locally.
  }
}

/**
 * Single place to clear per-session local data on logout (manual or forced).
 * Features that persist Broker data locally register their cleanup here.
 * Must NOT clear keys that survive logouts: the Bound Device id (`bm.deviceId`)
 * and the dismissed install and push hints (`bm.installHintDismissed`, `bm.pushPromptDismissed`).
 */
export function clearLocalSessionData(): void {
  clearStudyStorage();
  clearStoredPushToken();
}
