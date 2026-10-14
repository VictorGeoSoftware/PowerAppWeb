import type { User } from "firebase/auth";
import { bmFetch } from "@/lib/api/bm-fetch";
import { clearStudyStorage } from "@/lib/gate/storage";

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
 * Must NOT clear the Bound Device id (`bm.deviceId`), which survives logouts.
 */
export function clearLocalSessionData(): void {
  clearStudyStorage();
}
