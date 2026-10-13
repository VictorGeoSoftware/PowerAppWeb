import { describe, expect, it } from "vitest";
import { BmApiError } from "@/lib/api/bm-fetch";
import {
  ACCESS_DENIED_MESSAGE,
  ACCESS_REVOKED_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
  classifySessionError,
} from "./session-errors";

describe("classifySessionError", () => {
  it("403 forces logout with the backend message", () => {
    expect(classifySessionError(new BmApiError(403, "Vinculada a otro dispositivo"))).toEqual({
      kind: "forced",
      message: "Vinculada a otro dispositivo",
    });
  });

  it("403 without message falls back to access denied", () => {
    expect(classifySessionError(new BmApiError(403, ""))).toEqual({ kind: "forced", message: ACCESS_DENIED_MESSAGE });
  });

  it("401 forces logout with session expired", () => {
    expect(classifySessionError(new BmApiError(401, "Invalid token"))).toEqual({
      kind: "forced",
      message: SESSION_EXPIRED_MESSAGE,
    });
  });

  it.each(["auth/user-token-expired", "auth/user-disabled", "auth/user-not-found", "auth/invalid-user-token"])(
    "Firebase %s forces logout with access revoked",
    (code) => {
      expect(classifySessionError(Object.assign(new Error(code), { code }))).toEqual({
        kind: "forced",
        message: ACCESS_REVOKED_MESSAGE,
      });
    },
  );

  it.each([
    ["5xx", new BmApiError(500, "boom")],
    ["proxy 502", new BmApiError(502, "Backend unavailable")],
    ["network", new TypeError("Failed to fetch")],
    ["firebase network", Object.assign(new Error("x"), { code: "auth/network-request-failed" })],
    ["null", null],
  ])("%s is transient", (_, error) => {
    expect(classifySessionError(error)).toEqual({ kind: "transient" });
  });
});
