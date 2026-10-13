"use client";

import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { clearLocalSessionData, logoutFromBackend } from "@/lib/auth/logout";
import { classifySessionError } from "@/lib/auth/session-errors";
import { syncUserData } from "@/lib/auth/user-data-sync";
import { getFirebaseAuth } from "@/lib/firebase/client";

/**
 * loading    – Firebase restoring the session
 * signed-out – no Firebase user
 * verifying  – Firebase user present, backend access check (/user-data) running
 * granted    – backend accepted the Broker
 * error      – backend check failed for a non-authorization reason (network, 5xx)
 */
export type AuthStatus = "loading" | "signed-out" | "verifying" | "granted" | "error";

export {
  ACCESS_CHECK_FAILED_MESSAGE,
  ACCESS_DENIED_MESSAGE,
  ACCESS_REVOKED_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
} from "@/lib/auth/session-errors";

/** Minimum time between background access re-checks when the tab becomes visible. */
const DEFAULT_RECHECK_INTERVAL_MS = 60_000;

type AuthContextValue = {
  user: User | null;
  status: AuthStatus;
  /** Message to show on the login screen after an access rejection. */
  notice: string | null;
  clearNotice: () => void;
  retry: () => void;
  /** Manual logout: best-effort `/auth/logout`, then Firebase sign-out. */
  signOutUser: () => Promise<void>;
  /**
   * Report a backend/token error from any call (see `useBmFetch`). Signs out with a
   * notice and returns true when it ends the session (401, 403, revoked token).
   */
  reportApiError: (error: unknown) => boolean;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  status: "loading",
  notice: null,
  clearNotice: () => {},
  retry: () => {},
  signOutUser: async () => {},
  reportApiError: () => false,
});

type Props = {
  children: React.ReactNode;
  /** Backend access check; injectable for tests. */
  verifyAccess?: (user: User) => Promise<void>;
  /** Throttle for the visibility re-check; injectable for tests. */
  recheckIntervalMs?: number;
};

export function AuthProvider({
  children,
  verifyAccess = syncUserData,
  recheckIntervalMs = DEFAULT_RECHECK_INTERVAL_MS,
}: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [notice, setNotice] = useState<string | null>(null);
  const currentUid = useRef<string | null>(null);

  const lastCheckAt = useRef(0);

  /** Forced logout: local sign-out only (no `/auth/logout`, BmApp parity) plus notice. */
  const forceSignOut = useCallback(async (message: string) => {
    setNotice(message);
    clearLocalSessionData();
    await signOut(getFirebaseAuth()).catch(() => {});
  }, []);

  /**
   * Backend access check. In background mode (tab became visible) the UI stays
   * `granted` and transient failures are ignored; only forced errors sign out.
   */
  const verify = useCallback(
    async (candidate: User, background = false) => {
      if (!background) setStatus("verifying");
      lastCheckAt.current = Date.now();
      try {
        await verifyAccess(candidate);
        if (currentUid.current === candidate.uid && !background) setStatus("granted");
      } catch (error) {
        // Ignore results for a user who is no longer current. `null` still counts as
        // current: Firebase signs out by itself on a revoked token before rejecting.
        if (currentUid.current !== candidate.uid && currentUid.current !== null) return;
        const result = classifySessionError(error);
        if (result.kind === "forced") {
          // Signing out means the next visit can't skip this check (BmApp parity).
          await forceSignOut(result.message);
          return;
        }
        if (!background && currentUid.current === candidate.uid) setStatus("error");
      }
    },
    [verifyAccess, forceSignOut],
  );

  useEffect(
    () =>
      onAuthStateChanged(getFirebaseAuth(), (next) => {
        currentUid.current = next?.uid ?? null;
        setUser(next);
        if (next) void verify(next);
        else setStatus("signed-out");
      }),
    [verify],
  );

  // No push channel on web yet: re-check access when the Broker returns to the tab,
  // so a grant revoked in BmWeb signs the session out (throttled).
  useEffect(() => {
    if (status !== "granted" || !user) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastCheckAt.current < recheckIntervalMs) return;
      void verify(user, true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [status, user, verify, recheckIntervalMs]);

  const signOutUser = useCallback(async () => {
    const current = user;
    setStatus("loading");
    if (current) await logoutFromBackend(current);
    clearLocalSessionData();
    await signOut(getFirebaseAuth()).catch(() => {});
  }, [user]);

  const reportApiError = useCallback(
    (error: unknown) => {
      const result = classifySessionError(error);
      if (result.kind !== "forced") return false;
      void forceSignOut(result.message);
      return true;
    },
    [forceSignOut],
  );

  const value: AuthContextValue = {
    user,
    status,
    notice,
    clearNotice: () => setNotice(null),
    retry: () => {
      if (user) void verify(user);
    },
    signOutUser,
    reportApiError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export function FullScreenSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Cargando">
      <div className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
    </div>
  );
}
