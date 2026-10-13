import { afterEach, describe, expect, it, vi } from "vitest";
import { clearLocalSessionData, logoutFromBackend } from "./logout";

const tokenCalls: boolean[] = [];
const user = {
  getIdToken: async (force?: boolean) => {
    tokenCalls.push(Boolean(force));
    return "tok";
  },
};

describe("logoutFromBackend", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs /auth/logout through the proxy with the cached token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await logoutFromBackend(user);
    expect(tokenCalls).toEqual([false]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/bm/auth/logout");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok");
  });

  it.each([
    ["500", () => Promise.resolve(new Response("boom", { status: 500 }))],
    ["network", () => Promise.reject(new TypeError("Failed to fetch"))],
  ])("swallows %s failures", async (_, impl) => {
    vi.stubGlobal("fetch", vi.fn(impl));
    await expect(logoutFromBackend(user)).resolves.toBeUndefined();
  });
});

describe("clearLocalSessionData", () => {
  it("keeps the Bound Device id", () => {
    localStorage.setItem("bm.deviceId", "web-abc");
    clearLocalSessionData();
    expect(localStorage.getItem("bm.deviceId")).toBe("web-abc");
  });
});
