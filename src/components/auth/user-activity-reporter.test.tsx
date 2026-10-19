import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ value: { user: null as unknown, status: "loading" as string, signOutUser: vi.fn() } }));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => auth.value }));

import { UserActivityReporter } from "./user-activity-reporter";

const user = { email: "b@x.es", displayName: "B", getIdToken: async () => "t" };
let visibility: DocumentVisibilityState = "visible";

const setVisibility = (v: DocumentVisibilityState) =>
  act(() => {
    visibility = v;
    document.dispatchEvent(new Event("visibilitychange"));
  });
const pagehide = () => act(() => void window.dispatchEvent(new Event("pagehide")));
const events = (send: ReturnType<typeof vi.fn>) => send.mock.calls.map((c) => c[1]);

describe("UserActivityReporter", () => {
  beforeEach(() => {
    visibility = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    auth.value = { user, status: "granted", signOutUser: vi.fn() };
  });
  afterEach(() => vi.restoreAllMocks());

  it("granted → one online; hidden → offline; visible → online", () => {
    const send = vi.fn(async () => {});
    render(<UserActivityReporter send={send} />);
    expect(send).toHaveBeenCalledWith(user, "online");
    setVisibility("hidden");
    setVisibility("visible");
    expect(events(send)).toEqual(["online", "offline", "online"]);
  });

  it("deduplicates hidden + pagehide and repeated visible", () => {
    const send = vi.fn(async () => {});
    render(<UserActivityReporter send={send} />);
    setVisibility("visible");
    setVisibility("hidden");
    pagehide();
    expect(events(send)).toEqual(["online", "offline"]);
  });

  it.each(["loading", "verifying", "signed-out", "error"])("sends nothing while %s", (status) => {
    auth.value = { user: status === "verifying" ? user : null, status, signOutUser: vi.fn() };
    const send = vi.fn(async () => {});
    render(<UserActivityReporter send={send} />);
    setVisibility("hidden");
    pagehide();
    expect(send).not.toHaveBeenCalled();
  });

  it("removes listeners after sign-out", () => {
    const send = vi.fn(async () => {});
    const { rerender } = render(<UserActivityReporter send={send} />);
    auth.value = { user: null, status: "signed-out", signOutUser: vi.fn() };
    rerender(<UserActivityReporter send={send} />);
    setVisibility("hidden");
    pagehide();
    expect(events(send)).toEqual(["online"]);
  });

  it("a failing call does not sign out", async () => {
    const fetch = vi.fn(async () => new Response("", { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    render(<UserActivityReporter />);
    await act(async () => {});
    expect(fetch).toHaveBeenCalled();
    expect(auth.value.signOutUser).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
