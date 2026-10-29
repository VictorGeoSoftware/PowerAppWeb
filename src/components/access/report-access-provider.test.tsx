import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { uid: "A" } as { uid: string } | null,
  bmFetch: vi.fn(),
}));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("@/lib/api/use-bm-fetch", () => ({ useBmFetch: () => state.bmFetch }));

import { BmApiError } from "@/lib/api/bm-fetch";
import { ReportAccessProvider, useReportAccess } from "./report-access-provider";

const premium = { tier: "PREMIUM", capabilities: ["COMPREHENSIVE_COMPARATOR_PDF"] };
const basic = { tier: "BASIC", capabilities: [] };
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function Probe() {
  const { comprehensiveReport, refresh } = useReportAccess();
  return (
    <>
      <span data-testid="flag">{String(comprehensiveReport)}</span>
      <button onClick={refresh}>refresh</button>
    </>
  );
}

const flag = () => screen.getByTestId("flag").textContent;
const flush = () => act(async () => {});
const ui = (interval = 60_000) => (
  <ReportAccessProvider recheckIntervalMs={interval}>
    <Probe />
  </ReportAccessProvider>
);

function setVisibility(value: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("ReportAccessProvider", () => {
  beforeEach(() => {
    state.user = { uid: "A" };
    state.bmFetch.mockReset();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => {
    vi.useRealTimers();
    setVisibility("visible");
  });

  it("defaults to false outside a provider", () => {
    render(<Probe />);
    expect(flag()).toBe("false");
  });

  it("checks me/access after sign-in and shows the capability", async () => {
    state.bmFetch.mockResolvedValue(ok(premium));
    render(ui());
    expect(flag()).toBe("false");
    await flush();
    expect(state.bmFetch).toHaveBeenCalledWith("me/access", expect.objectContaining({ cache: "no-store" }));
    expect(flag()).toBe("true");
  });

  it.each([
    ["basic", () => ok(basic)],
    ["tier PREMIUM without capability", () => ok({ tier: "PREMIUM", capabilities: [] })],
    ["non-JSON", () => new Response("<html>", { status: 200 })],
    ["missing capabilities", () => ok({ tier: "PREMIUM" })],
  ])("hides for %s", async (_name, response) => {
    state.bmFetch.mockResolvedValue(response());
    render(ui());
    await flush();
    expect(flag()).toBe("false");
  });

  it.each([
    ["500", new BmApiError(500, "boom")],
    ["401", new BmApiError(401, "expired")],
    ["403", new BmApiError(403, "denied")],
    ["network", new TypeError("fetch failed")],
  ])("fails closed and silently on %s (useBmFetch owns forced logout)", async (_name, error) => {
    state.bmFetch.mockResolvedValueOnce(ok(premium));
    render(ui(0));
    await flush();
    expect(flag()).toBe("true");
    state.bmFetch.mockRejectedValueOnce(error);
    await act(async () => screen.getByText("refresh").click());
    expect(flag()).toBe("false");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("downgrade and upgrade on visibility after the throttle, not before", async () => {
    state.bmFetch.mockResolvedValueOnce(ok(premium));
    render(ui());
    await flush();
    expect(flag()).toBe("true");

    state.bmFetch.mockResolvedValue(ok(basic));
    vi.setSystemTime(1_000_000 + 30_000);
    await act(async () => setVisibility("visible"));
    expect(state.bmFetch).toHaveBeenCalledTimes(1);
    expect(flag()).toBe("true");

    vi.setSystemTime(1_000_000 + 61_000);
    await act(async () => setVisibility("hidden"));
    expect(state.bmFetch).toHaveBeenCalledTimes(1);
    await act(async () => setVisibility("visible"));
    expect(state.bmFetch).toHaveBeenCalledTimes(2);
    expect(flag()).toBe("false");

    state.bmFetch.mockResolvedValue(ok(premium));
    vi.setSystemTime(1_000_000 + 130_000);
    await act(async () => screen.getByText("refresh").click());
    expect(flag()).toBe("true");
  });

  it("refresh (entering Propuestas) is throttled to once a minute", async () => {
    state.bmFetch.mockResolvedValue(ok(premium));
    render(ui());
    await flush();
    await act(async () => screen.getByText("refresh").click());
    expect(state.bmFetch).toHaveBeenCalledTimes(1);
    vi.setSystemTime(1_000_000 + 60_000);
    await act(async () => screen.getByText("refresh").click());
    expect(state.bmFetch).toHaveBeenCalledTimes(2);
  });

  it("resets on user change and never shows A's capability to B", async () => {
    state.bmFetch.mockResolvedValueOnce(ok(premium));
    const { rerender } = render(ui());
    await flush();
    expect(flag()).toBe("true");

    let resolveB!: (r: Response) => void;
    state.bmFetch.mockReturnValueOnce(new Promise<Response>((r) => (resolveB = r)));
    state.user = { uid: "B" };
    rerender(ui());
    expect(flag()).toBe("false");
    expect(state.bmFetch).toHaveBeenCalledTimes(2); // new uid is not throttled
    await act(async () => resolveB(ok(basic)));
    expect(flag()).toBe("false");
  });

  it("ignores a late response for a previous user", async () => {
    let resolveA!: (r: Response) => void;
    state.bmFetch.mockReturnValueOnce(new Promise<Response>((r) => (resolveA = r)));
    const { rerender } = render(ui());
    state.bmFetch.mockReturnValueOnce(new Promise<Response>(() => {}));
    state.user = { uid: "B" };
    rerender(ui());
    await act(async () => resolveA(ok(premium)));
    expect(flag()).toBe("false");
  });

  it("drops out-of-order responses", async () => {
    let resolveFirst!: (r: Response) => void;
    let resolveSecond!: (r: Response) => void;
    state.bmFetch
      .mockReturnValueOnce(new Promise<Response>((r) => (resolveFirst = r)))
      .mockReturnValueOnce(new Promise<Response>((r) => (resolveSecond = r)));
    render(ui(0));
    await act(async () => screen.getByText("refresh").click());
    await act(async () => resolveSecond(ok(basic)));
    await act(async () => resolveFirst(ok(premium)));
    expect(flag()).toBe("false");
  });

  it("signed out: no call and false", async () => {
    state.user = null;
    render(ui());
    await flush();
    expect(state.bmFetch).not.toHaveBeenCalled();
    expect(flag()).toBe("false");
  });
});

describe("ReportAccessProvider.invalidate (premium_required)", () => {
  function InvalidateProbe() {
    const { comprehensiveReport, invalidate } = useReportAccess();
    return (
      <>
        <span data-testid="flag">{String(comprehensiveReport)}</span>
        <button onClick={invalidate}>invalidate</button>
      </>
    );
  }
  beforeEach(() => {
    state.user = { uid: "A" };
    state.bmFetch.mockReset();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => vi.useRealTimers());

  it("hides immediately and forces a re-check, ignoring the throttle", async () => {
    state.bmFetch.mockResolvedValueOnce(ok(premium));
    render(
      <ReportAccessProvider>
        <InvalidateProbe />
      </ReportAccessProvider>,
    );
    await flush();
    expect(flag()).toBe("true");
    let resolve!: (r: Response) => void;
    state.bmFetch.mockReturnValueOnce(new Promise<Response>((r) => (resolve = r)));
    act(() => screen.getByText("invalidate").click());
    expect(flag()).toBe("false"); // before the re-check answers
    expect(state.bmFetch).toHaveBeenCalledTimes(2); // not throttled
    await act(async () => resolve(ok(basic)));
    expect(flag()).toBe("false");
  });

  it("restores the action if the forced re-check still grants it", async () => {
    state.bmFetch.mockImplementation(async () => ok(premium));
    render(
      <ReportAccessProvider>
        <InvalidateProbe />
      </ReportAccessProvider>,
    );
    await flush();
    await act(async () => screen.getByText("invalidate").click());
    await flush();
    expect(state.bmFetch).toHaveBeenCalledTimes(2);
    expect(flag()).toBe("true");
  });

  it("is a no-op outside a provider", () => {
    render(<InvalidateProbe />);
    act(() => screen.getByText("invalidate").click());
    expect(flag()).toBe("false");
  });
});
