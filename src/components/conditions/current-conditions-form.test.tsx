import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => "/current-conditions", useRouter: () => ({ push }) }));

import { FeeFirstGateProvider, useFeeFirstGate } from "@/components/gate/fee-first-gate-provider";
import type { ConsumptionSession } from "@/lib/gate/fee-first";
import { CurrentConditionsForm } from "./current-conditions-form";

const session: ConsumptionSession = {
  powerPeriods: ["P1", "P2"],
  energyPeriods: ["P1", "P2", "P3"],
  cups: "ES0031607515707001RC",
  holderName: "ANA",
  address: "C/ Mayor 1",
};

let gate: ReturnType<typeof useFeeFirstGate>;
function Probe() {
  gate = useFeeFirstGate();
  return null;
}

const renderForm = () =>
  render(
    <FeeFirstGateProvider initialSession={session}>
      <Probe />
      <CurrentConditionsForm />
    </FeeFirstGateProvider>,
  );

const type = (name: string, value: string) => fireEvent.change(screen.getByRole("textbox", { name }), { target: { value } });
const valueOf = (name: string) => (screen.getByRole("textbox", { name }) as HTMLInputElement).value;
const stored = () => JSON.parse(localStorage.getItem("bm.currentConditions") ?? "null");
const cta = () => screen.queryByRole("button", { name: "Ir a las propuestas de precios" });

function fillAll() {
  type("Comercializadora actual", "Endesa");
  for (const p of ["P1", "P2"]) type(`Potencia ${p}`, "0,1");
  for (const p of ["P1", "P2", "P3"]) type(`Energía ${p}`, "0.2");
}

describe("CurrentConditionsForm", () => {
  beforeEach(() => {
    localStorage.clear();
    push.mockReset();
  });

  it("renders customer data and one row per report period", () => {
    renderForm();
    expect(screen.getByText("DATOS DEL CLIENTE")).toBeInTheDocument();
    expect(valueOf("Titular")).toBe("ANA");
    expect(valueOf("Dirección")).toBe("C/ Mayor 1");
    expect(screen.getByText("ES0031607515707001RC")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Comercializadora actual" })).toHaveAttribute(
      "placeholder",
      "Introduce la comercializadora",
    );
    expect(screen.getByText("TÉRMINO DE POTENCIA")).toBeInTheDocument();
    expect(screen.getByText("ENERGÍA CONSUMIDA")).toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: /^Potencia P\d$/ })).toHaveLength(2);
    expect(screen.getAllByRole("textbox", { name: /^Energía P\d$/ })).toHaveLength(3);
    expect(screen.getByRole("textbox", { name: "Importe total anual" })).toHaveAttribute("placeholder", "0.00€");
    expect(cta()).not.toBeInTheDocument();
  });

  it("uses the decimal keypad and 16px text on every price input", () => {
    renderForm();
    for (const input of screen.getAllByRole("textbox", { name: /^(Potencia|Energía) P\d$|Importe total anual/ })) {
      expect(input).toHaveAttribute("inputmode", "decimal");
      expect(input).toHaveAttribute("type", "text");
      expect(input).toHaveAttribute("placeholder");
      expect(input.className).toContain("text-base");
    }
  });

  it("ignores keystrokes that fail the BmApp regex", () => {
    renderForm();
    type("Potencia P1", "0,5");
    for (const bad of ["a", "-1", "0,5.1", "0,123456789"]) type("Potencia P1", bad);
    expect(valueOf("Potencia P1")).toBe("0,5");
    type("Importe total anual", "12x");
    expect(valueOf("Importe total anual")).toBe("");
  });

  it("persists valid changes raw to bm.currentConditions", () => {
    renderForm();
    type("Energía P2", "0,12345678");
    type("Importe total anual", "15,5");
    expect(stored()).toEqual({
      powerTermPriceByPeriod: {},
      energyPriceByPeriod: { P2: "0,12345678" },
      extraServices: "15,5",
      companyName: null,
    });
  });

  it("unlocks when complete, routes to proposals, and re-locks on a zero price", () => {
    renderForm();
    fillAll();
    expect(gate.stage).toBe("UNLOCKED");
    fireEvent.click(cta()!);
    expect(push).toHaveBeenCalledWith("/proposals");
    type("Energía P3", "0");
    expect(gate.stage).toBe("CURRENT_CONDITIONS_REQUIRED");
    expect(cta()).not.toBeInTheDocument();
  });

  it("keeps holder and address edits in the session only", () => {
    renderForm();
    type("Titular", "LUIS");
    type("Dirección", "");
    expect(gate.session).toMatchObject({ holderName: "LUIS", address: "" });
    expect(valueOf("Titular")).toBe("LUIS");
    expect(stored()).toBeNull();
    expect(gate.completed).toBe(0);
  });
});

describe("Copiar precios de una propuesta", () => {
  const proposal = (title: string, power: number[], energy: number[], extraServices: number) => ({
    proposalTitle: title,
    powerTermItems: power,
    annualPowerTermCost: 1,
    consumedEnergyItems: energy,
    annualEnergyCost: 1,
    extraServices,
    iva: 21,
    electricalTax: 1,
    totalAnnualPrice: 1,
  });
  const withProposals: ConsumptionSession = {
    ...session,
    proposals: [proposal("Fija A", [0.1, 0.2], [0.11, 0.12, 0.13], 0), proposal("Fija B", [0.3, 0.4], [0.21, 0.22, 0.23], 12.5)],
  };
  const renderWith = (s: ConsumptionSession) =>
    render(
      <FeeFirstGateProvider initialSession={s}>
        <Probe />
        <CurrentConditionsForm />
      </FeeFirstGateProvider>,
    );
  const copyButton = () => screen.getByRole("button", { name: "Copiar precios de una propuesta" });

  beforeEach(() => localStorage.clear());

  it("opens the sheet with the first proposal preselected and copies the chosen one", async () => {
    renderWith(withProposals);
    type("Comercializadora actual", "Endesa");
    fireEvent.click(copyButton());
    expect(await screen.findByText("Copiar precios desde propuesta")).toBeInTheDocument();
    expect(screen.getByText("Solo se muestran propuestas compatibles con tu tarifa.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Fija A" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Fija B" }));
    fireEvent.click(screen.getByRole("button", { name: "Copiar" }));
    expect(valueOf("Potencia P1")).toBe("0.3");
    expect(valueOf("Potencia P2")).toBe("0.4");
    expect(valueOf("Energía P3")).toBe("0.23");
    expect(valueOf("Importe total anual")).toBe("12.50");
    expect(valueOf("Comercializadora actual")).toBe("Endesa");
    expect(screen.getByRole("status")).toHaveTextContent("Precios copiados desde Fija B");
    expect(gate.stage).toBe("UNLOCKED");
    expect(stored().powerTermPriceByPeriod.P1).toBe("0.3");
  });

  it("Cancelar leaves the conditions unchanged", async () => {
    renderWith(withProposals);
    fireEvent.click(copyButton());
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(valueOf("Potencia P1")).toBe("");
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("does nothing without proposals", () => {
    renderWith(session);
    fireEvent.click(copyButton());
    expect(screen.queryByText("Copiar precios desde propuesta")).not.toBeInTheDocument();
  });
});
