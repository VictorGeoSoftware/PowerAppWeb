import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/configuration", useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/components/auth/auth-provider", () => ({ FullScreenSpinner: () => <div role="status" /> }));

import { FeeFirstGateProvider } from "@/components/gate/fee-first-gate-provider";
import type { ConsumptionSession } from "@/lib/gate/fee-first";
import { ProposalVisibilityList } from "./proposal-visibility-list";

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

const session: ConsumptionSession = {
  jobId: "job-1",
  powerPeriods: ["P1"],
  energyPeriods: ["P1"],
  proposals: [proposal("Alfa"), proposal("IBERDROLA PLAN ESTABLE A CO 5")],
};

const renderList = (s: ConsumptionSession | null = session) =>
  render(
    <FeeFirstGateProvider initialSession={s}>
      <ProposalVisibilityList />
    </FeeFirstGateProvider>,
  );

describe("ProposalVisibilityList", () => {
  beforeEach(() => localStorage.clear());

  it("shows BmApp copy and one switch per proposal named by its full title", () => {
    renderList();
    expect(screen.getByRole("heading", { name: "Propuestas visibles" })).toBeTruthy();
    expect(screen.getByText("Usa el botón a la izquierda de la propuesta para ocultarla/mostrarla")).toBeTruthy();
    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(2);
    expect(screen.getByRole("switch", { name: "IBERDROLA PLAN ESTABLE A CO 5" })).toBeTruthy();
    expect(switches.every((s) => s.getAttribute("aria-checked") === "true")).toBe(true);
  });

  it("clicking the row text or the switch toggles once and dims hidden rows", () => {
    renderList();
    const sw = screen.getByRole("switch", { name: "Alfa" });
    const row = screen.getAllByTestId("proposal-visibility-row")[0];
    fireEvent.click(screen.getByText("Alfa"));
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(row.className).toContain("opacity-45");
    expect(localStorage.getItem("bm.proposalVisibility")).toBe('{"Alfa":false}');
    fireEvent.click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(row.className).not.toContain("opacity-45");
  });

  it("no session renders heading and an empty list", () => {
    renderList(null);
    expect(screen.getByRole("heading", { name: "Propuestas visibles" })).toBeTruthy();
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
  });
});
