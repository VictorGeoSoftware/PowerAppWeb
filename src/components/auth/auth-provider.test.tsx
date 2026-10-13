import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BmApiError } from "@/lib/api/bm-fetch";

let authCallback: (user: unknown) => void = () => {};
const signOut = vi.fn();
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_: unknown, cb: (u: unknown) => void) => {
    authCallback = cb;
    return () => {};
  },
  signOut: () => signOut(),
}));
vi.mock("@/lib/firebase/client", () => ({ getFirebaseAuth: () => ({}) }));
const logoutFromBackend = vi.fn();
const clearLocalSessionData = vi.fn();
vi.mock("@/lib/auth/logout", () => ({
  logoutFromBackend: (u: unknown) => logoutFromBackend(u),
  clearLocalSessionData: () => clearLocalSessionData(),
}));

import {
  ACCESS_REVOKED_MESSAGE,
  AuthProvider,
  SESSION_EXPIRED_MESSAGE,
  useAuth,
} from "./auth-provider";

let ctx: ReturnType<typeof useAuth>;
function Probe() {
  ctx = useAuth();
  const { status, notice } = ctx;
  return (
    <p>
      {status}|{notice ?? ""}
    </p>
  );
}

const user = { uid: "u1", email: "b@bm.es" };
const renderWith = (verifyAccess: () => Promise<void>, recheckIntervalMs = 60_000) =>
  render(
    <AuthProvider verifyAccess={verifyAccess} recheckIntervalMs={recheckIntervalMs}>
      <Probe />
    </AuthProvider>,
  );
const emit = async (u: unknown) => act(async () => authCallback(u));

describe("AuthProvider access gate", () => {
  beforeEach(() => {
    signOut.mockImplementation(async () => authCallback(null));
  });

  it("signed-out when no Firebase user", async () => {
    renderWith(vi.fn());
    await emit(null);
    expect(screen.getByText("signed-out|")).toBeInTheDocument();
  });

  it("granted when backend accepts", async () => {
    const verify = vi.fn().mockResolvedValue(undefined);
    renderWith(verify);
    await emit(user);
    expect(verify).toHaveBeenCalledWith(user);
    expect(screen.getByText("granted|")).toBeInTheDocument();
  });

  it("403 signs out and keeps backend message as notice", async () => {
    renderWith(vi.fn().mockRejectedValue(new BmApiError(403, "Cuenta no autorizada")));
    await emit(user);
    expect(signOut).toHaveBeenCalled();
    expect(screen.getByText("signed-out|Cuenta no autorizada")).toBeInTheDocument();
  });

  it("401 signs out with session-expired notice", async () => {
    renderWith(vi.fn().mockRejectedValue(new BmApiError(401, "Invalid token")));
    await emit(user);
    expect(screen.getByText(`signed-out|${SESSION_EXPIRED_MESSAGE}`)).toBeInTheDocument();
  });

  it("network/5xx errors keep the session and expose error status", async () => {
    renderWith(vi.fn().mockRejectedValue(new BmApiError(502, "Backend unavailable")));
    await emit(user);
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByText("error|")).toBeInTheDocument();
  });
});

describe("AuthProvider logout and forced logout", () => {
  beforeEach(() => {
    signOut.mockImplementation(async () => authCallback(null));
    logoutFromBackend.mockResolvedValue(undefined);
  });

  const showTab = async () =>
    act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

  it("manual logout calls /auth/logout, clears local data, then signs out without notice", async () => {
    renderWith(vi.fn().mockResolvedValue(undefined));
    await emit(user);
    await act(async () => ctx.signOutUser());
    expect(logoutFromBackend).toHaveBeenCalledWith(user);
    expect(clearLocalSessionData).toHaveBeenCalled();
    expect(logoutFromBackend.mock.invocationCallOrder[0]).toBeLessThan(signOut.mock.invocationCallOrder[0]);
    expect(screen.getByText("signed-out|")).toBeInTheDocument();
  });

  it("forced 403 does not call /auth/logout", async () => {
    renderWith(vi.fn().mockRejectedValue(new BmApiError(403, "Revocada")));
    await emit(user);
    expect(logoutFromBackend).not.toHaveBeenCalled();
    expect(clearLocalSessionData).toHaveBeenCalled();
    expect(screen.getByText("signed-out|Revocada")).toBeInTheDocument();
  });

  it("revoked Firebase token signs out with the revoked message instead of the retry screen", async () => {
    renderWith(vi.fn().mockRejectedValue(Object.assign(new Error("x"), { code: "auth/user-token-expired" })));
    await emit(user);
    expect(screen.getByText(`signed-out|${ACCESS_REVOKED_MESSAGE}`)).toBeInTheDocument();
  });

  it("revoked token still shows the notice when Firebase already signed the user out itself", async () => {
    // Real Firebase SDK signs out on auth/user-token-expired before rejecting getIdToken.
    const verify = vi.fn(async () => {
      authCallback(null);
      throw Object.assign(new Error("x"), { code: "auth/user-token-expired" });
    });
    renderWith(verify);
    await emit(user);
    expect(screen.getByText(`signed-out|${ACCESS_REVOKED_MESSAGE}`)).toBeInTheDocument();
  });

  it("ignores a transient error that arrives after the user signed out", async () => {
    const verify = vi.fn(async () => {
      authCallback(null);
      throw new BmApiError(502, "down");
    });
    renderWith(verify);
    await emit(user);
    expect(screen.getByText("signed-out|")).toBeInTheDocument();
  });

  it("does not show a stale notice when another user signed in meanwhile", async () => {
    const verify = vi
      .fn()
      .mockImplementationOnce(async () => {
        authCallback({ uid: "u2", email: "other@bm.es" });
        throw new BmApiError(403, "Revocada");
      })
      .mockResolvedValue(undefined);
    renderWith(verify);
    await act(async () => authCallback(user));
    expect(screen.queryByText(/Revocada/)).toBeNull();
  });

  it("reportApiError signs out on forced errors only", async () => {
    renderWith(vi.fn().mockResolvedValue(undefined));
    await emit(user);
    let handled = true;
    await act(async () => {
      handled = ctx.reportApiError(new BmApiError(500, "boom"));
    });
    expect(handled).toBe(false);
    expect(screen.getByText("granted|")).toBeInTheDocument();
    await act(async () => {
      handled = ctx.reportApiError(new BmApiError(401, "Invalid token"));
    });
    expect(handled).toBe(true);
    expect(logoutFromBackend).not.toHaveBeenCalled();
    expect(screen.getByText(`signed-out|${SESSION_EXPIRED_MESSAGE}`)).toBeInTheDocument();
  });

  it("re-checks access when the tab becomes visible and signs out on 403", async () => {
    const verify = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new BmApiError(403, "Revocada"));
    renderWith(verify, 0);
    await emit(user);
    await showTab();
    expect(verify).toHaveBeenCalledTimes(2);
    expect(screen.getByText("signed-out|Revocada")).toBeInTheDocument();
  });

  it("background re-check keeps the session on transient errors without flashing", async () => {
    const verify = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new BmApiError(502, "down"));
    renderWith(verify, 0);
    await emit(user);
    await showTab();
    expect(verify).toHaveBeenCalledTimes(2);
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByText("granted|")).toBeInTheDocument();
  });

  it("re-check is throttled", async () => {
    const verify = vi.fn().mockResolvedValue(undefined);
    renderWith(verify, 60_000);
    await emit(user);
    await showTab();
    expect(verify).toHaveBeenCalledTimes(1);
  });
});
