import { beforeEach, describe, expect, it, vi } from "vitest";

const popup = vi.fn();
const redirect = vi.fn();
vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: class {
    setCustomParameters = vi.fn();
  },
  signInWithPopup: (...a: unknown[]) => popup(...a),
  signInWithRedirect: (...a: unknown[]) => redirect(...a),
}));

import { signInWithGoogle } from "./google-sign-in";

const auth = {} as never;

describe("signInWithGoogle", () => {
  beforeEach(() => {
    popup.mockReset();
    redirect.mockReset();
  });

  it("uses popup", async () => {
    popup.mockResolvedValue({});
    await signInWithGoogle(auth);
    expect(popup).toHaveBeenCalledOnce();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("falls back to redirect when popup is blocked", async () => {
    popup.mockRejectedValue({ code: "auth/popup-blocked" });
    await signInWithGoogle(auth);
    expect(redirect).toHaveBeenCalledOnce();
  });

  it("rethrows other errors", async () => {
    popup.mockRejectedValue({ code: "auth/popup-closed-by-user" });
    await expect(signInWithGoogle(auth)).rejects.toEqual({ code: "auth/popup-closed-by-user" });
    expect(redirect).not.toHaveBeenCalled();
  });
});
