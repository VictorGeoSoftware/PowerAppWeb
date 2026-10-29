import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BmApiError, bmFetch } from "./bm-fetch";

const user = { getIdToken: vi.fn() };
beforeEach(() => user.getIdToken.mockResolvedValue("TOKEN"));
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockReset());

describe("bmFetch", () => {
  it("calls the same-origin proxy with the bearer token", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    await bmFetch(user, "/user-data", { method: "POST" }, true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/bm/user-data");
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer TOKEN");
    expect(user.getIdToken).toHaveBeenCalledWith(true);
  });

  it.each([
    ['{"message":"No autorizada"}', "No autorizada"],
    ['{"error":"boom"}', "boom"],
    ["plain", "plain"],
    ["", "HTTP 403"],
  ])("throws BmApiError with backend message %s", async (body, message) => {
    fetchMock.mockResolvedValue(new Response(body, { status: 403 }));
    const error = await bmFetch(user, "user-data").catch((e) => e);
    expect(error).toBeInstanceOf(BmApiError);
    expect(error).toMatchObject({ status: 403, message });
  });
});

describe("BmApiError code", () => {
  it("parses the ReportErrorResponse code", async () => {
    fetchMock.mockResolvedValue(
      new Response('{"success":false,"code":"premium_required","message":"x"}', { status: 403 }),
    );
    const error = await bmFetch(user, "reports/premium-pdf").catch((e) => e);
    expect(error).toMatchObject({ status: 403, code: "premium_required", message: "x" });
  });
  it.each(['{"message":"no"}', "plain", '{"code":5}'])("has no code for %s", async (body) => {
    fetchMock.mockResolvedValue(new Response(body, { status: 403 }));
    const error = await bmFetch(user, "x").catch((e) => e);
    expect(error.code).toBeUndefined();
  });
  it("constructor stays compatible", () => {
    expect(new BmApiError(404, "m")).toMatchObject({ status: 404, message: "m", code: undefined });
    expect(new BmApiError(404, "m", "study_not_found").code).toBe("study_not_found");
  });
});
