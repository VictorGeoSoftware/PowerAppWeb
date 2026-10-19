import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PUSH_TOKEN_KEY,
  clearStoredPushToken,
  needsRegistration,
  pushPlatform,
  pushSupport,
  readStoredPushToken,
  registerPushToken,
  storePushToken,
  unregisterPush,
  type PushEnv,
} from "./push";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";

const env = (over: Partial<PushEnv> & { ua?: string; standalone?: boolean } = {}): PushEnv => ({
  nav: { userAgent: over.ua ?? ANDROID, maxTouchPoints: 5, standalone: over.standalone, serviceWorker: {} },
  win: { Notification: {}, PushManager: {} },
  vapidKey: "vapid",
  fcmSupported: true,
  ...over,
});

describe("pushSupport", () => {
  it.each<[string, PushEnv, string]>([
    ["Android Chrome", env(), "available"],
    ["no VAPID key", env({ vapidKey: undefined }), "unsupported"],
    ["no PushManager", env({ win: { Notification: {} } }), "unsupported"],
    ["no Notification", env({ win: { PushManager: {} } }), "unsupported"],
    ["FCM unsupported", env({ fcmSupported: false }), "unsupported"],
    ["iOS Safari tab (no push APIs)", env({ ua: IPHONE, win: {}, fcmSupported: false }), "needs-install"],
    ["iOS installed", env({ ua: IPHONE, standalone: true }), "available"],
  ])("%s", (_, e, expected) => {
    expect(pushSupport(e)).toBe(expected);
  });
});

it("pushPlatform", () => {
  expect(pushPlatform({ userAgent: IPHONE, maxTouchPoints: 5 })).toBe("ios");
  expect(pushPlatform({ userAgent: ANDROID, maxTouchPoints: 5 })).toBe("android");
  expect(pushPlatform({ userAgent: MAC, maxTouchPoints: 0 })).toBe("desktop");
});

describe("stored token", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips and ignores garbage", () => {
    expect(readStoredPushToken()).toBeNull();
    storePushToken({ uid: "u1", token: "t1" });
    expect(readStoredPushToken()).toEqual({ uid: "u1", token: "t1" });
    clearStoredPushToken();
    expect(readStoredPushToken()).toBeNull();
    localStorage.setItem(PUSH_TOKEN_KEY, "{bad");
    expect(readStoredPushToken()).toBeNull();
  });

  it("re-registers only when the token or the Broker changed", () => {
    expect(needsRegistration(null, "u1", "t1")).toBe(true);
    expect(needsRegistration({ uid: "u1", token: "t1" }, "u1", "t1")).toBe(false);
    expect(needsRegistration({ uid: "u1", token: "t1" }, "u1", "t2")).toBe(true);
    expect(needsRegistration({ uid: "u1", token: "t1" }, "u2", "t1")).toBe(true);
  });
});

it("registerPushToken POSTs token and platform", async () => {
  const fetchFn = vi.fn().mockResolvedValue(new Response("{}"));
  await registerPushToken(fetchFn, "t1", "android");
  expect(fetchFn).toHaveBeenCalledWith("push/web-tokens", expect.objectContaining({ method: "POST" }));
  expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ token: "t1", platform: "android" });
});

describe("unregisterPush", () => {
  const user = { uid: "u1", getIdToken: async () => "id" };
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("does nothing without a stored token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await unregisterPush(user);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("DELETEs the Broker's own token and swallows failures", async () => {
    storePushToken({ uid: "u1", token: "t1" });
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(unregisterPush(user)).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/bm/push/web-tokens");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body)).toEqual({ token: "t1" });
  });

  it("does not DELETE a token stored for another Broker", async () => {
    storePushToken({ uid: "other", token: "t1" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await unregisterPush(user);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
