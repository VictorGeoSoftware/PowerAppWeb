"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { bmFetch } from "@/lib/api/bm-fetch";
import { useBmFetch } from "@/lib/api/use-bm-fetch";
import { PUSH_ENABLED, PUSH_ERROR } from "@/lib/pwa/messages";
import {
  PUSH_PROMPT_DISMISSED_KEY,
  fetchFcmToken,
  isFcmSupported,
  needsRegistration,
  pushPlatform,
  pushSupport,
  readStoredPushToken,
  registerPushToken,
  storePushToken,
  vapidKey,
  type PushSupport,
} from "@/lib/pwa/push";

type Permission = NotificationPermission | "unknown";

type PushState = {
  support: PushSupport | "loading";
  permission: Permission;
  /** Token stored in BmBackend for the current Broker. */
  registered: boolean;
  enabling: boolean;
  /** Asks for permission; call only from a user tap. */
  enable: () => Promise<void>;
  /** Menu entry "Activar notificaciones" (available, not denied, not registered yet). */
  canEnable: boolean;
  /** One-time card on /fetch-consumption. */
  showCard: boolean;
  dismissCard: () => void;
};

const PushContext = createContext<PushState>({
  support: "unsupported",
  permission: "unknown",
  registered: false,
  enabling: false,
  enable: async () => {},
  canEnable: false,
  showCard: false,
  dismissCard: () => {},
});

export function usePush() {
  return useContext(PushContext);
}

function readPermission(): Permission {
  return typeof Notification === "undefined" ? "unknown" : Notification.permission;
}

const NOTICE_MS = 2500;

/** Web Push token registration (signed-in screens only). Sending is `web-push-price-updates`. */
export function PushProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const fetchBm = useBmFetch();
  const uid = user?.uid;
  const [support, setSupport] = useState<PushSupport | "loading">("loading");
  const [permission, setPermission] = useState<Permission>("unknown");
  /** Permission at app start; the refresh must not re-run when a tap grants it. */
  const [startPermission, setStartPermission] = useState<Permission>("unknown");
  const [registered, setRegistered] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [cardDismissed, setCardDismissed] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const initial = readPermission();
    setPermission(initial);
    setStartPermission(initial);
    try {
      setCardDismissed(localStorage.getItem(PUSH_PROMPT_DISMISSED_KEY) === "1");
    } catch {
      setCardDismissed(false);
    }
    void isFcmSupported().then((fcmSupported) => {
      if (cancelled) return;
      setSupport(
        pushSupport({
          nav: navigator,
          win: window as unknown as { Notification?: unknown; PushManager?: unknown },
          matchMedia: window.matchMedia?.bind(window),
          vapidKey: vapidKey(),
          fcmSupported,
        }),
      );
    });
    return () => {
      cancelled = true;
      clearTimeout(noticeTimer.current);
    };
  }, []);

  useEffect(() => {
    setRegistered(uid != null && readStoredPushToken()?.uid === uid);
  }, [uid]);

  // Keep the token fresh on app start: re-post only when it or the Broker changed.
  useEffect(() => {
    if (support !== "available" || startPermission !== "granted" || !user) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await fetchFcmToken();
        if (cancelled) return;
        if (needsRegistration(readStoredPushToken(), user.uid, token)) {
          await registerPushToken((path, init) => bmFetch(user, path, init), token, pushPlatform(navigator));
          storePushToken({ uid: user.uid, token });
        }
        if (!cancelled) setRegistered(true);
      } catch {
        // Silent: the next app start retries.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [support, startPermission, user]);

  const flash = useCallback((message: string, kind: "notice" | "error") => {
    clearTimeout(noticeTimer.current);
    setNotice(kind === "notice" ? message : null);
    setError(kind === "error" ? message : null);
    noticeTimer.current = setTimeout(() => {
      setNotice(null);
      setError(null);
    }, NOTICE_MS);
  }, []);

  const enable = useCallback(async () => {
    if (support !== "available" || enabling || !uid) return;
    setEnabling(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") return;
      const token = await fetchFcmToken();
      await registerPushToken(fetchBm, token, pushPlatform(navigator));
      storePushToken({ uid, token });
      setRegistered(true);
      flash(PUSH_ENABLED, "notice");
    } catch {
      flash(PUSH_ERROR, "error");
    } finally {
      setEnabling(false);
    }
  }, [support, enabling, uid, fetchBm, flash]);

  const dismissCard = useCallback(() => {
    setCardDismissed(true);
    try {
      localStorage.setItem(PUSH_PROMPT_DISMISSED_KEY, "1");
    } catch {
      // Storage unavailable: hidden for this session only.
    }
  }, []);

  const canEnable = support === "available" && permission !== "denied" && permission !== "unknown" && !registered;
  const value = useMemo<PushState>(
    () => ({
      support,
      permission,
      registered,
      enabling,
      enable,
      canEnable,
      showCard: canEnable && permission === "default" && !cardDismissed,
      dismissCard,
    }),
    [support, permission, registered, enabling, enable, canEnable, cardDismissed, dismissCard],
  );

  return (
    <PushContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 flex justify-center"
      >
        {notice && <span className="rounded-full bg-foreground px-4 py-2 text-sm text-background shadow-lg">{notice}</span>}
      </div>
      {error && (
        <div
          role="alert"
          className="pointer-events-none fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 flex justify-center"
        >
          <span className="rounded-full bg-destructive px-4 py-2 text-sm text-white shadow-lg">{error}</span>
        </div>
      )}
    </PushContext.Provider>
  );
}
