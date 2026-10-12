"use client";

import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { BmApiError } from "@/lib/api/bm-fetch";
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

export const ACCESS_DENIED_MESSAGE =
  "Esta cuenta no está autorizada para acceder. Contacta con el equipo de administración.";
export const SESSION_EXPIRED_MESSAGE = "Tu sesión ha caducado. Inicia sesión de nuevo.";
export const ACCESS_CHECK_FAILED_MESSAGE = "No se pudo verificar tu acceso. Revisa tu conexión.";

type AuthContextValue = {
  user: User | null;
  status: AuthStatus;
  /** Message to show on the login screen after an access rejection. */
  notice: string | null;
  clearNotice: () => void;
  retry: () => void;
  signOutUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  status: "loading",
  notice: null,
  clearNotice: () => {},
  retry: () => {},
  signOutUser: async () => {},
});

type Props = {
  children: React.ReactNode;
  /** Backend access check; injectable for tests. */
  verifyAccess?: (user: User) => Promise<void>;
};

export function AuthProvider({ children, verifyAccess = syncUserData }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [notice, setNotice] = useState<string | null>(null);
  const currentUid = useRef<string | null>(null);

  const verify = useCallback(
    async (candidate: User) => {
      setStatus("verifying");
      try {
        await verifyAccess(candidate);
        if (currentUid.current === candidate.uid) setStatus("granted");
      } catch (error) {
        if (currentUid.current !== candidate.uid) return;
        if (error instanceof BmApiError && (error.status === 401 || error.status === 403)) {
          // Valid Firebase credential but rejected by the backend: sign out so the
          // next visit does not auto-authenticate past this check (BmApp parity).
          setNotice(
            error.status === 403 ? error.message || ACCESS_DENIED_MESSAGE : SESSION_EXPIRED_MESSAGE,
          );
          await signOut(getFirebaseAuth()).catch(() => {});
          return;
        }
        setStatus("error");
      }
    },
    [verifyAccess],
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

  const value: AuthContextValue = {
    user,
    status,
    notice,
    clearNotice: () => setNotice(null),
    retry: () => {
      if (user) void verify(user);
    },
    signOutUser: () => signOut(getFirebaseAuth()),
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
