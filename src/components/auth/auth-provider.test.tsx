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

import { AuthProvider, SESSION_EXPIRED_MESSAGE, useAuth } from "./auth-provider";

function Probe() {
  const { status, notice } = useAuth();
  return (
    <p>
      {status}|{notice ?? ""}
    </p>
  );
}

const user = { uid: "u1", email: "b@bm.es" };
const renderWith = (verifyAccess: () => Promise<void>) =>
  render(
    <AuthProvider verifyAccess={verifyAccess}>
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
