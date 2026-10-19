import { describe, expect, it, vi } from "vitest";
import { isAnalyticsAllowed, isAnalyticsDebug } from "./policy";
import { SCREEN_BY_PATH, screenForPath } from "./screens";
import { type AnalyticsSdk, createFirebaseTracker, getAnalyticsTracker, noOpTracker, sanitizeName, sanitizeParams } from "./tracker";

describe("isAnalyticsAllowed", () => {
  it.each([
    [{}, false],
    [{ enabled: "false", measurementId: "G-1" }, false],
    [{ enabled: "TRUE", measurementId: "G-1" }, false],
    [{ enabled: "true" }, false],
    [{ enabled: "true", measurementId: "  " }, false],
    [{ enabled: "true", measurementId: "G-1" }, true],
  ])("%j -> %s", (env, allowed) => {
    expect(isAnalyticsAllowed(env)).toBe(allowed);
  });

  it("debug only with exactly true", () => {
    expect(isAnalyticsDebug({ debug: "true" })).toBe(true);
    expect(isAnalyticsDebug({ debug: "1" })).toBe(false);
  });
});

describe("screens", () => {
  it("matches BmAppRouteAnalytics names", () => {
    expect(SCREEN_BY_PATH).toEqual({
      "/fetch-consumption": "fetch_consumption",
      "/current-conditions": "current_conditions",
      "/proposals": "proposals",
      "/configuration": "configuration",
    });
    expect(screenForPath("/")).toBeNull();
    expect(screenForPath("/proposals?x=1")).toBeNull();
  });
});

describe("getAnalyticsTracker", () => {
  it("is the no-op when the flag is unset (tests, E2E, dev)", () => {
    expect(getAnalyticsTracker()).toBe(noOpTracker);
  });
});

describe("sanitize", () => {
  it("names", () => {
    expect(sanitizeName("proposal-pdf.ok")).toBe("proposal_pdf_ok");
    expect(sanitizeName("1st")).toBe("e_1st");
    expect(sanitizeName("a".repeat(50))).toHaveLength(40);
  });
  it("params keep primitives only", () => {
    expect(sanitizeParams({ a: "x".repeat(150), b: 2, c: true, d: { e: 1 }, f: null, g: NaN })).toEqual({
      a: "x".repeat(100),
      b: 2,
      c: 1,
    });
  });
});

function fakeSdk(supported = true) {
  const sdk = {
    isSupported: vi.fn(async () => supported),
    initializeAnalytics: vi.fn(() => ({ analytics: true })),
    logEvent: vi.fn(),
  };
  return sdk;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("createFirebaseTracker", () => {
  it("initializes once without automatic page_view and delivers calls queued before init", async () => {
    const sdk = fakeSdk();
    const app = { app: true };
    const tracker = createFirebaseTracker({ loadSdk: async () => sdk as AnalyticsSdk, getApp: () => app, debug: false });
    tracker.trackScreen("auth_login");
    expect(sdk.logEvent).not.toHaveBeenCalled();
    await flush();
    tracker.trackScreen("proposals");
    expect(sdk.initializeAnalytics).toHaveBeenCalledTimes(1);
    expect(sdk.initializeAnalytics).toHaveBeenCalledWith(app, { config: { send_page_view: false } });
    expect(sdk.logEvent.mock.calls).toEqual([
      [{ analytics: true }, "screen_view", { firebase_screen: "auth_login", firebase_screen_class: "auth_login" }],
      [{ analytics: true }, "screen_view", { firebase_screen: "proposals", firebase_screen_class: "proposals" }],
    ]);
  });

  it("adds debug_mode only in debug", async () => {
    const sdk = fakeSdk();
    const tracker = createFirebaseTracker({ loadSdk: async () => sdk as AnalyticsSdk, getApp: () => ({}), debug: true });
    tracker.trackScreen("configuration");
    await flush();
    expect(sdk.logEvent.mock.calls[0][2]).toEqual({
      firebase_screen: "configuration",
      firebase_screen_class: "configuration",
      debug_mode: true,
    });
  });

  it("is a no-op when unsupported or when loading fails", async () => {
    const sdk = fakeSdk(false);
    const tracker = createFirebaseTracker({ loadSdk: async () => sdk as AnalyticsSdk, getApp: () => ({}), debug: false });
    tracker.trackScreen("proposals");
    await flush();
    tracker.track("x");
    expect(sdk.initializeAnalytics).not.toHaveBeenCalled();
    expect(sdk.logEvent).not.toHaveBeenCalled();

    const failing = createFirebaseTracker({ loadSdk: () => Promise.reject(new Error("blocked")), getApp: () => ({}), debug: false });
    failing.trackScreen("proposals");
    await flush();
  });

  it("track sanitizes event names and params", async () => {
    const sdk = fakeSdk();
    const tracker = createFirebaseTracker({ loadSdk: async () => sdk as AnalyticsSdk, getApp: () => ({}), debug: false });
    await flush();
    tracker.track("pdf-export", { ok: true, obj: {} as never });
    expect(sdk.logEvent).toHaveBeenCalledWith({ analytics: true }, "pdf_export", { ok: 1 });
  });
});
