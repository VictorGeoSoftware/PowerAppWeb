import type { User } from "firebase/auth";
import { bmFetch } from "@/lib/api/bm-fetch";

/** Same payload as BmApp `UserDataPayloadDto`. */
export function userDataPayload(user: User) {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    providerIds: user.providerData.map((p) => p.providerId),
  };
}

/** POST /user-data: backend verifies the token and the granted_users allowlist. 403 = access denied. */
export async function syncUserData(user: User): Promise<void> {
  await bmFetch(
    user,
    "user-data",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userDataPayload(user)),
    },
    true,
  );
}
