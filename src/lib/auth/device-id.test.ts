import { beforeEach, describe, expect, it } from "vitest";
import { DEVICE_ID_STORAGE_KEY, getOrCreateDeviceId } from "./device-id";

describe("getOrCreateDeviceId", () => {
  beforeEach(() => localStorage.clear());

  it("creates a web- prefixed UUID within the 64-char backend column", () => {
    const id = getOrCreateDeviceId();
    expect(id).toMatch(/^web-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(id.length).toBeLessThanOrEqual(64);
    expect(localStorage.getItem(DEVICE_ID_STORAGE_KEY)).toBe(id);
  });

  it("is stable across calls", () => {
    expect(getOrCreateDeviceId()).toBe(getOrCreateDeviceId());
  });

  it("reuses a stored id", () => {
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, "web-existing");
    expect(getOrCreateDeviceId()).toBe("web-existing");
  });
});
