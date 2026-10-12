// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proxyToBackend } from "./backend-proxy";

const BASE = "http://backend.test";
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("BM_BACKEND_URL", BASE);
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const req = (path: string, init: RequestInit = {}) =>
  new Request(`http://localhost:9003/api/bm/${path}`, init);
const auth = { authorization: "Bearer T" };

describe("proxyToBackend", () => {
  it("forwards GET with token and query, returns status/body/content-type", async () => {
    fetchMock.mockResolvedValue(
      new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json", "set-cookie": "x=1" } }),
    );
    const res = await proxyToBackend(req("price-table-results?x=1", { headers: auth }), ["price-table-results"]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/price-table-results?x=1`);
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect((init.headers as Headers).get("authorization")).toBe("Bearer T");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await res.json()).toEqual({ ok: true });
  });

  it("passes backend error statuses through unchanged", async () => {
    fetchMock.mockResolvedValue(new Response('{"error":"forbidden"}', { status: 403 }));
    const res = await proxyToBackend(req("user-data", { method: "POST", headers: auth }), ["user-data"]);
    expect(res.status).toBe(403);
  });

  it("returns 401 without Bearer token and does not call backend", async () => {
    const res = await proxyToBackend(req("price-table-results"), ["price-table-results"]);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, message: "Missing Authorization header" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([[["admin", "users"]], [[]], [["reports", ".."]], [["auth", ""]]])(
    "returns 404 for non-allowlisted or unsafe path %j",
    async (segments) => {
      const res = await proxyToBackend(req("x", { headers: auth }), segments);
      expect(res.status).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("returns 502 when backend is unreachable", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const res = await proxyToBackend(req("price-table-results", { headers: auth }), ["price-table-results"]);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ success: false, message: "Backend unavailable" });
  });

  it("forwards multipart body bytes and content-type", async () => {
    fetchMock.mockResolvedValue(new Response('{"jobId":"j1"}', { status: 202 }));
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array([37, 80, 68, 70])], { type: "application/pdf" }), "bill.pdf");
    const original = new Request("http://localhost/x", { method: "POST", body: form });
    const contentType = original.headers.get("content-type")!;
    const bytes = new Uint8Array(await original.clone().arrayBuffer());

    const res = await proxyToBackend(
      req("fetch-user-consumption-report", { method: "POST", headers: { ...auth, "content-type": contentType }, body: bytes }),
      ["fetch-user-consumption-report"],
    );

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Headers).get("content-type")).toBe(contentType);
    expect(new Uint8Array(init.body as ArrayBuffer)).toEqual(bytes);
    expect(res.status).toBe(202);
  });

  it("returns binary PDF responses intact", async () => {
    const pdf = new Uint8Array([37, 80, 68, 70, 0, 255]);
    fetchMock.mockResolvedValue(
      new Response(pdf, { status: 200, headers: { "content-type": "application/pdf", "content-disposition": "attachment" } }),
    );
    const res = await proxyToBackend(
      req("reports/comparator-pdf", { method: "POST", headers: auth, body: "{}" }),
      ["reports", "comparator-pdf"],
    );
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe("attachment");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(pdf);
  });
});
