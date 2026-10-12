import type { User } from "firebase/auth";
import { bmFetch } from "@/lib/api/bm-fetch";
import { getOrCreateDeviceId } from "./device-id";

/** Same payload as BmApp `UserDataPayloadDto` (phoneUuid added by device binding). */
export function userDataPayload(user: User, phoneUuid?: string) {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    providerIds: user.providerData.map((p) => p.providerId),
    ...(phoneUuid ? { phoneUuid } : {}),
  };
}

/**
 * POST /user-data: backend verifies the token, the granted_users allowlist
 * and (when phoneUuid is present) the bound device. 403 = access denied.
 */
export async function syncUserData(
  user: User,
  phoneUuid: string = getOrCreateDeviceId(),
): Promise<void> {
  await bmFetch(
    user,
    "user-data",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userDataPayload(user, phoneUuid)),
    },
    true,
  );
}
