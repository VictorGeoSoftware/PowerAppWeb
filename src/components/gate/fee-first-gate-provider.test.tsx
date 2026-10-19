import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/";
const replace = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ replace }) }));
vi.mock("@/components/auth/auth-provider", () => ({ FullScreenSpinner: () => <div role="status" /> }));

import type { FeeFirstStage } from "@/lib/gate/fee-first";
import { saveConditions } from "@/lib/gate/storage";
import { FeeFirstGateGuard, FeeFirstGateProvider, gateRedirect, useFeeFirstGate } from "./fee-first-gate-provider";

const session = { powerPeriods: ["P1"], energyPeriods: ["P1"] };
const complete = {
  powerTermPriceByPeriod: { P1: "0.1" },
  energyPriceByPeriod: { P1: "0.2" },
  extraServices: "",
  companyName: "Endesa",
};

let gate: ReturnType<typeof useFeeFirstGate>;
function Probe() {
  gate = useFeeFirstGate();
  return null;
}

const renderGuarded = (initialSession: typeof session | null) =>
  render(
    <FeeFirstGateProvider initialSession={initialSession}>
      <Probe />
      <FeeFirstGateGuard>
        <p>pantalla</p>
      </FeeFirstGateGuard>
    </FeeFirstGateProvider>,
  );

describe("gateRedirect", () => {
  const table: [FeeFirstStage, string, string | null][] = [
    ["CONSUMPTION_REQUIRED", "/", "/fetch-consumption"],
    ["CONSUMPTION_REQUIRED", "/fetch-consumption", null],
    ["CONSUMPTION_REQUIRED", "/current-conditions", "/fetch-consumption"],
    ["CONSUMPTION_REQUIRED", "/proposals", "/fetch-consumption"],
    ["CONSUMPTION_REQUIRED", "/configuration", "/fetch-consumption"],
    ["CURRENT_CONDITIONS_REQUIRED", "/", "/current-conditions"],
    ["CURRENT_CONDITIONS_REQUIRED", "/fetch-consumption", "/current-conditions"],
    ["CURRENT_CONDITIONS_REQUIRED", "/current-conditions", null],
    ["CURRENT_CONDITIONS_REQUIRED", "/proposals", "/current-conditions"],
    ["CURRENT_CONDITIONS_REQUIRED", "/configuration", "/current-conditions"],
    ["UNLOCKED", "/", "/current-conditions"],
    ["UNLOCKED", "/fetch-consumption", "/current-conditions"],
    ["UNLOCKED", "/current-conditions", null],
    ["UNLOCKED", "/proposals", null],
    ["UNLOCKED", "/configuration", null],
  ];
  it.each(table)("%s at %s -> %s", (stage, path, target) => {
    expect(gateRedirect(stage, path)).toBe(target);
  });
});

describe("FeeFirstGateGuard", () => {
  beforeEach(() => {
    replace.mockReset();
    localStorage.clear();
  });

  it("blocked route redirects and never renders the screen", () => {
    pathname = "/proposals";
    renderGuarded(null);
    expect(replace).toHaveBeenCalledWith("/fetch-consumption");
    expect(screen.queryByText("pantalla")).toBeNull();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("reachable route renders", () => {
    pathname = "/proposals";
    saveConditions(complete);
    renderGuarded(session);
    expect(gate.stage).toBe("UNLOCKED");
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText("pantalla")).toBeInTheDocument();
  });

  it("re-checks on stage change: new study sends the Broker to the fetch step", () => {
    pathname = "/proposals";
    saveConditions(complete);
    renderGuarded(session);
    act(() => gate.startNewStudy());
    expect(gate.stage).toBe("CONSUMPTION_REQUIRED");
    expect(replace).toHaveBeenCalledWith("/fetch-consumption");
  });

  it("conditions persist and are reloaded; the session is not", () => {
    pathname = "/fetch-consumption";
    const { unmount } = renderGuarded(null);
    act(() => gate.setConditions(complete));
    unmount();
    renderGuarded(null);
    expect(gate.conditions).toEqual(complete);
    expect(gate.session).toBeNull();
    expect(gate.stage).toBe("CONSUMPTION_REQUIRED");
  });

  it("publishing a session moves the stage forward", () => {
    pathname = "/fetch-consumption";
    renderGuarded(null);
    act(() => gate.setSession(session));
    expect(gate.stage).toBe("CURRENT_CONDITIONS_REQUIRED");
    expect(replace).toHaveBeenCalledWith("/current-conditions");
  });
});

describe("proposal fixed amounts", () => {
  const proposal = (proposalTitle: string) => ({
    proposalTitle,
    powerTermItems: [0.1],
    annualPowerTermCost: 1,
    consumedEnergyItems: [0.2],
    annualEnergyCost: 2,
    extraServices: 0,
    iva: 0.63,
    electricalTax: 0.15,
    totalAnnualPrice: 3.78,
  });
  const withProposals = (...titles: string[]) => ({ ...session, proposals: titles.map(proposal) });

  beforeEach(() => {
    replace.mockReset();
    localStorage.clear();
    pathname = "/current-conditions";
  });

  it("sets known titles only, persists and reloads", () => {
    const { unmount } = renderGuarded(withProposals("A", "B"));
    expect(gate.proposalFixedAmounts).toEqual({ A: "", B: "" });
    act(() => gate.setProposalFixedAmount("A", "12,5"));
    act(() => gate.setProposalFixedAmount("Z", "9"));
    expect(gate.proposalFixedAmounts).toEqual({ A: "12,5", B: "" });
    unmount();
    renderGuarded(withProposals("A", "B"));
    expect(gate.proposalFixedAmounts).toEqual({ A: "12,5", B: "" });
  });

  it("a refreshed report keeps current titles and drops missing ones", () => {
    renderGuarded(withProposals("A", "B"));
    act(() => gate.setProposalFixedAmount("A", "1"));
    act(() => gate.setProposalFixedAmount("B", "2"));
    act(() => gate.setSession(withProposals("B", "C")));
    expect(gate.proposalFixedAmounts).toEqual({ B: "2", C: "" });
    act(() => gate.setSession(withProposals("A", "B")));
    expect(gate.proposalFixedAmounts).toEqual({ A: "", B: "2" });
  });

  it("startNewStudy clears them", () => {
    renderGuarded(withProposals("A"));
    act(() => gate.setProposalFixedAmount("A", "3"));
    act(() => gate.startNewStudy());
    act(() => gate.setSession(withProposals("A")));
    expect(gate.proposalFixedAmounts).toEqual({ A: "" });
    expect(localStorage.getItem("bm.proposalFixedAmounts")).toBeNull();
  });
});

describe("proposal visibility", () => {
  const proposal = (proposalTitle: string) => ({
    proposalTitle,
    powerTermItems: [0.1],
    annualPowerTermCost: 1,
    consumedEnergyItems: [0.2],
    annualEnergyCost: 2,
    extraServices: 0,
    iva: 0.63,
    electricalTax: 0.15,
    totalAnnualPrice: 3.78,
  });
  const withProposals = (...titles: string[]) => ({ ...session, proposals: titles.map(proposal) });

  beforeEach(() => {
    replace.mockReset();
    localStorage.clear();
    pathname = "/current-conditions";
  });

  it("defaults to visible, ignores unknown titles and persists across remount", () => {
    const { unmount } = renderGuarded(withProposals("A", "B"));
    expect(gate.proposalVisibility).toEqual({ A: true, B: true });
    act(() => gate.setProposalVisibility("B", false));
    act(() => gate.setProposalVisibility("Z", false));
    expect(gate.proposalVisibility).toEqual({ A: true, B: false });
    unmount();
    renderGuarded(withProposals("A", "B"));
    expect(gate.proposalVisibility).toEqual({ A: true, B: false });
    act(() => gate.setProposalVisibility("B", true));
    expect(localStorage.getItem("bm.proposalVisibility")).toBeNull();
  });

  it("a refreshed report keeps current titles and drops missing ones", () => {
    renderGuarded(withProposals("A", "B"));
    act(() => gate.setProposalVisibility("A", false));
    act(() => gate.setProposalVisibility("B", false));
    act(() => gate.setSession(withProposals("B", "C")));
    expect(gate.proposalVisibility).toEqual({ B: false, C: true });
    act(() => gate.setSession(withProposals("A", "B")));
    expect(gate.proposalVisibility).toEqual({ A: true, B: false });
  });

  it("hideProposalsOnce runs once per signature, only hides existing titles and survives remount", () => {
    const { unmount } = renderGuarded(withProposals("A", "B"));
    act(() => gate.hideProposalsOnce("j@1.0", new Set(["A", "Z"])));
    expect(gate.proposalVisibility).toEqual({ A: false, B: true });
    act(() => gate.setProposalVisibility("A", true));
    act(() => gate.hideProposalsOnce("j@1.0", new Set(["A", "B"])));
    expect(gate.proposalVisibility).toEqual({ A: true, B: true });
    unmount();
    renderGuarded(withProposals("A", "B"));
    act(() => gate.hideProposalsOnce("j@1.0", new Set(["A"])));
    expect(gate.proposalVisibility).toEqual({ A: true, B: true });
    act(() => gate.setProposalVisibility("A", false));
    act(() => gate.hideProposalsOnce("j@2.0", new Set(["B"])));
    expect(gate.proposalVisibility).toEqual({ A: false, B: false });
  });

  it("startNewStudy resets visibility and the signature", () => {
    renderGuarded(withProposals("A"));
    act(() => gate.hideProposalsOnce("j@1.0", new Set(["A"])));
    act(() => gate.startNewStudy());
    act(() => gate.setSession(withProposals("A")));
    expect(gate.proposalVisibility).toEqual({ A: true });
    expect(localStorage.getItem("bm.proposalVisibility")).toBeNull();
    act(() => gate.hideProposalsOnce("j@1.0", new Set(["A"])));
    expect(gate.proposalVisibility).toEqual({ A: false });
  });
});
