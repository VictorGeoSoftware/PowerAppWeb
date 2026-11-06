import { beforeEach, describe, expect, it, vi } from "vitest";

const bmFetch = vi.fn();
vi.mock("@/lib/api/bm-fetch", () => ({ bmFetch: (...a: unknown[]) => bmFetch(...a) }));

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
    bmFetch.mockResolvedValue(new Response());
  });

  it("posts the user payload without a device id", async () => {
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
    });
  });
});
