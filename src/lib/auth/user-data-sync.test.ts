import { beforeEach, describe, expect, it, vi } from "vitest";

const bmFetch = vi.fn();
vi.mock("@/lib/api/bm-fetch", () => ({ bmFetch: (...a: unknown[]) => bmFetch(...a) }));

import { DEVICE_ID_STORAGE_KEY } from "./device-id";
import { syncUserData } from "./user-data-sync";

const user = {
  uid: "u1",
  email: "b@bm.es",
  displayName: "Broker",
  photoURL: null,
  providerData: [{ providerId: "password" }],
} as never;

describe("syncUserData", () => {
  beforeEach(() => {
    localStorage.clear();
    bmFetch.mockResolvedValue(new Response());
  });

  it("always sends the persisted browser device id as phoneUuid", async () => {
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, "web-abc");
    await syncUserData(user);
    const [, path, init, force] = bmFetch.mock.calls[0];
    expect(path).toBe("user-data");
    expect(force).toBe(true);
    expect(JSON.parse(init.body)).toEqual({
      uid: "u1",
      email: "b@bm.es",
      displayName: "Broker",
      photoURL: null,
      providerIds: ["password"],
      phoneUuid: "web-abc",
    });
  });

  it("creates a device id on first sync", async () => {
    await syncUserData(user);
    expect(JSON.parse(bmFetch.mock.calls[0][2].body).phoneUuid).toMatch(/^web-/);
  });
});
