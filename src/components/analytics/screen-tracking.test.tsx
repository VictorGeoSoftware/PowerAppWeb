import { act, render } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/fetch-consumption";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
const trackScreen = vi.fn();
vi.mock("@/lib/analytics/tracker", () => ({ getAnalyticsTracker: () => ({ trackScreen, track: vi.fn() }) }));

import { RouteScreenTracking, TrackScreen, useScreenOverride } from "./screen-tracking";

let setOpen: (open: boolean) => void;
function Scanner() {
  const [open, set] = useState(false);
  setOpen = set;
  useScreenOverride(open ? "cups_scanner" : null);
  return null;
}

const ui = (n = 0) => (
  <StrictMode>
    <RouteScreenTracking>
      <Scanner />
      <span>{n}</span>
    </RouteScreenTracking>
  </StrictMode>
);

const sent = () => trackScreen.mock.calls.map((c) => c[0]);

describe("screen tracking", () => {
  beforeEach(() => {
    pathname = "/fetch-consumption";
  });

  it("sends once per entry, ignores re-renders, re-sends on path change and A -> B -> A", () => {
    const { rerender } = render(ui());
    rerender(ui(1));
    expect(sent()).toEqual(["fetch_consumption"]);
    pathname = "/proposals";
    rerender(ui(2));
    pathname = "/configuration";
    rerender(ui(3));
    pathname = "/proposals";
    rerender(ui(4));
    expect(sent()).toEqual(["fetch_consumption", "proposals", "configuration", "proposals"]);
  });

  it("scanner open -> cups_scanner, close -> fetch_consumption again", () => {
    render(ui());
    act(() => setOpen(true));
    act(() => setOpen(false));
    expect(sent()).toEqual(["fetch_consumption", "cups_scanner", "fetch_consumption"]);
  });

  it("unknown paths send nothing", () => {
    pathname = "/";
    render(ui());
    expect(trackScreen).not.toHaveBeenCalled();
  });

  it("TrackScreen sends its name once", () => {
    render(
      <StrictMode>
        <TrackScreen name="auth_login" />
      </StrictMode>,
    );
    expect(sent()).toEqual(["auth_login"]);
  });

  it("useScreenOverride without a tracking provider is harmless", () => {
    render(<Scanner />);
    act(() => setOpen(true));
    expect(trackScreen).not.toHaveBeenCalled();
  });
});
