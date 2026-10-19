"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { sendUserActivity, type UserActivityEvent } from "@/lib/auth/user-activity";

type Props = { send?: typeof sendUserActivity };

/**
 * BmApp `MainActivity` onResume/onStop → `visibilitychange` / `pagehide`. Sends only on
 * state changes, and only while granted. Logout already marks the Broker offline.
 */
export function UserActivityReporter({ send = sendUserActivity }: Props) {
  const { user, status } = useAuth();

  useEffect(() => {
    if (status !== "granted" || !user) return;
    let last: UserActivityEvent | null = null;
    const report = (event: "online" | "offline") => {
      if (last === event) return;
      last = event;
      void send(user, event);
    };
    const onVisibility = () => report(document.visibilityState === "hidden" ? "offline" : "online");
    const onPageHide = () => report("offline");
    const onPageShow = () => {
      if (document.visibilityState !== "hidden") report("online");
    };

    if (document.visibilityState !== "hidden") report("online");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [status, user, send]);

  return null;
}
