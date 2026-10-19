import { afterEach, describe, expect, it, vi } from "vitest";
import { activityPayload, sendUserActivity } from "./user-activity";

const user = (email: string | null, displayName: string | null = null) => ({
  email,
  displayName,
  getIdToken: vi.fn(async () => "tok"),
});

describe("activityPayload", () => {
  it("uses displayName when present, else the email local part", () => {
    expect(activityPayload({ email: " a.b@x.es ", displayName: "Ana" })).toEqual({ name: "Ana", email: "a.b@x.es" });
    expect(activityPayload({ email: "a.b@x.es", displayName: "  " })).toEqual({ name: "a.b", email: "a.b@x.es" });
    expect(activityPayload({ email: "a.b@x.es", displayName: null })).toEqual({ name: "a.b", email: "a.b@x.es" });
  });

  it("is null for a blank email", () => {
    expect(activityPayload({ email: "  ", displayName: "Ana" })).toBeNull();
    expect(activityPayload({ email: null, displayName: "Ana" })).toBeNull();
  });
});

describe("sendUserActivity", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts the payload with keepalive and the cached token", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const u = user("a@x.es", "Ana");
    await sendUserActivity(u, "online");
    expect(u.getIdToken).toHaveBeenCalledWith(false);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/bm/user-activity/online");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body as string)).toEqual({ name: "Ana", email: "a@x.es" });
    const headers = new Headers(init.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Authorization")).toBe("Bearer tok");
  });

  it("sends nothing without an email", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await sendUserActivity(user(""), "offline");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("swallows network errors and non-2xx responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    await expect(sendUserActivity(user("a@x.es"), "offline")).resolves.toBeUndefined();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    await expect(sendUserActivity(user("a@x.es"), "proposals-response")).resolves.toBeUndefined();
  });
});
