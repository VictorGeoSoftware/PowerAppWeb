import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BmApiError } from "./bm-fetch";

const reportApiError = vi.fn();
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ user: { getIdToken: async () => "tok" }, reportApiError }),
}));

import { useBmFetch } from "./use-bm-fetch";

describe("useBmFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the response on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    const { result } = renderHook(() => useBmFetch());
    await expect(result.current("price-table-results")).resolves.toBeInstanceOf(Response);
    expect(reportApiError).not.toHaveBeenCalled();
  });

  it("reports errors to the auth provider and rethrows them", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"message":"No"}', { status: 403 })));
    const { result } = renderHook(() => useBmFetch());
    await expect(result.current("price-table-results")).rejects.toBeInstanceOf(BmApiError);
    expect(reportApiError).toHaveBeenCalledWith(expect.objectContaining({ status: 403, message: "No" }));
  });
});
