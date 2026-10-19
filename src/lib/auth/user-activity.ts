import type { User } from "firebase/auth";
import { bmFetch } from "@/lib/api/bm-fetch";

export type UserActivityEvent = "online" | "offline" | "proposals-response";

type ActivityUser = Pick<User, "getIdToken" | "email" | "displayName">;

/** BmApp `MainActivity.sendUserActivity`: blank email → null; blank name → email local part. */
export function activityPayload(user: Pick<User, "email" | "displayName">): { name: string; email: string } | null {
  const email = (user.email ?? "").trim();
  if (!email) return null;
  const displayName = (user.displayName ?? "").trim();
  return { name: displayName || email.split("@")[0], email };
}

/** Best-effort `POST user-activity/<event>` (cached token, keepalive); never throws. */
export async function sendUserActivity(user: ActivityUser, event: UserActivityEvent): Promise<void> {
  const payload = activityPayload(user);
  if (!payload) return;
  try {
    await bmFetch(user, `user-activity/${event}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // BmApp ignores the result of activity events.
  }
}
