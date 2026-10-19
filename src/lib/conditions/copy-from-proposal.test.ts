import { describe, expect, it } from "vitest";
import { copyPricesFromProposal, initialSelection, toDecimalInput } from "./copy-from-proposal";
import type { ConsumptionSession } from "@/lib/gate/fee-first";
import { toProposalPrices } from "@/lib/comparator/proposal";

const proposal = (title: string, power: number[], energy: number[], extraServices = 0) => ({
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

const P6 = ["P1", "P2", "P3", "P4", "P5", "P6"];

describe("toDecimalInput", () => {
  it.each([
    [0.123456, "0.123456"],
    [0.1, "0.1"],
    [5, "5"],
    [0, "0"],
    [0.000000004, "0"],
    [0.000000005, "0.00000001"],
  ])("%s -> %s", (v, expected) => expect(toDecimalInput(v)).toBe(expected));

  it("missing item -> empty", () => expect(toDecimalInput(undefined)).toBe(""));
});

describe("copyPricesFromProposal", () => {
  const session: ConsumptionSession = {
    powerPeriods: P6,
    energyPeriods: P6,
    proposals: [
      proposal("A", [1, 2, 3, 4, 5, 6], [1, 1, 1, 1, 1, 1]),
      proposal("B", [0.1, 0.2, 0.3, 0.4, 0.5, 0.6], [0.11, 0.12, 0.13, 0.14, 0.15, 0.16], 12.5),
    ],
  };
  const conditions = {
    companyName: "Iberdrola",
    powerTermPriceByPeriod: { P1: "9" },
    energyPriceByPeriod: {},
    extraServices: "3",
  };

  it("copies a 3.0TD proposal and keeps the supplier", () => {
    expect(copyPricesFromProposal(session, conditions, "B")).toEqual({
      companyName: "Iberdrola",
      powerTermPriceByPeriod: { P1: "0.1", P2: "0.2", P3: "0.3", P4: "0.4", P5: "0.5", P6: "0.6" },
      energyPriceByPeriod: { P1: "0.11", P2: "0.12", P3: "0.13", P4: "0.14", P5: "0.15", P6: "0.16" },
      extraServices: "12.50",
    });
  });

  it("matches by index; missing items become empty", () => {
    const s: ConsumptionSession = { powerPeriods: ["P1", "P3"], energyPeriods: ["P1", "P2", "P3"], proposals: [proposal("C", [7], [0.1234567, 0.2])] };
    expect(copyPricesFromProposal(s, null, "C")).toEqual({
      companyName: null,
      powerTermPriceByPeriod: { P1: "7", P3: "" },
      energyPriceByPeriod: { P1: "0.123457", P2: "0.2", P3: "" },
      extraServices: "0.00",
    });
  });

  it("unknown title -> null", () => {
    expect(copyPricesFromProposal(session, conditions, "Z")).toBeNull();
  });
});

describe("initialSelection", () => {
  const list = toProposalPrices([proposal("A", [], []), proposal("B", [], [])]);
  it("keeps a valid previous selection", () => expect(initialSelection(list, "B")).toBe("B"));
  it("falls back to the first proposal", () => expect(initialSelection(list, "X")).toBe("A"));
  it("null when empty", () => expect(initialSelection([], null)).toBeNull());
});
