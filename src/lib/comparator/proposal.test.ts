import { describe, expect, it } from "vitest";
import { toProposalPrice, toProposalPrices } from "@/lib/comparator/proposal";

const raw = {
  proposalTitle: "A",
  powerTermItems: [0.07123456789, 0.0000005],
  annualPowerTermCost: 100.005,
  consumedEnergyItems: [0.1234565],
  annualEnergyCost: 2.675,
  extraServices: 1.23456,
  iva: 21.005,
  electricalTax: 0.135,
  totalAnnualPrice: 1.015,
};

describe("toProposalPrice (BmApp ConsumptionReportMapper + FormatUtils)", () => {
  it("rounds items to 6 decimals and costs to 2, leaving extraServices and iva raw", () => {
    expect(toProposalPrice(raw)).toEqual({
      proposalTitle: "A",
      powerTermItems: [0.071235, 0.000001],
      annualPowerTermCost: 100.01,
      consumedEnergyItems: [0.123457],
      annualEnergyCost: 2.68,
      extraServices: 1.23456,
      iva: 21.005,
      electricalTax: 0.14,
      totalAnnualPrice: 1.02,
    });
  });

  it.each([
    null,
    "x",
    { ...raw, proposalTitle: 1 },
    { ...raw, powerTermItems: ["1"] },
    { ...raw, iva: undefined },
    { ...raw, totalAnnualPrice: Number.NaN },
  ])("rejects malformed entry %#", (entry) => {
    expect(toProposalPrice(entry)).toBeNull();
  });

  it("skips malformed entries in a list", () => {
    expect(toProposalPrices([raw, { foo: 1 }]).map((p) => p.proposalTitle)).toEqual(["A"]);
    expect(toProposalPrices(undefined)).toEqual([]);
  });
});
