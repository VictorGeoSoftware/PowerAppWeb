import { describe, expect, it } from "vitest";
import {
  bestProposalAmong,
  calculateAnnualSavingsPercentage,
  calculateComparatorSummary,
  emptyComparatorSummary,
  recalculateProposalWithAdditionalAmount,
  selectUncompetitiveProposals,
  type ComparatorSummary,
} from "@/lib/comparator/calculate";
import type { ProposalPrice } from "@/lib/comparator/proposal";
import type { ConsumptionSession, CurrentConditions } from "@/lib/gate/fee-first";

const proposal = (title: string, total: number, iva = 100): ProposalPrice => ({
  proposalTitle: title,
  powerTermItems: [0.1],
  annualPowerTermCost: 10,
  consumedEnergyItems: [0.1],
  annualEnergyCost: 10,
  extraServices: 0,
  iva,
  electricalTax: 1,
  totalAnnualPrice: total,
});

const session: ConsumptionSession = {
  jobId: "J",
  feeType: "2.0TD",
  iva: 21,
  electricTaxPercent: 5.11269632,
  powerPeriods: ["P1"],
  energyPeriods: ["P1"],
  powerRows: [{ period: "P1", value: 4.6 }],
  energyRows: [{ period: "P1", value: 1000.9 }],
  proposals: [proposal("A", 500)],
};

const conditions = (power: string, energy: string): CurrentConditions => ({
  companyName: "X",
  powerTermPriceByPeriod: { P1: power },
  energyPriceByPeriod: { P1: energy },
  extraServices: "",
});

describe("calculateComparatorSummary", () => {
  it("returns the empty summary without a session", () => {
    expect(calculateComparatorSummary(null, conditions("1", "1"), {})).toEqual(emptyComparatorSummary());
  });

  it.each([null, conditions("", ""), conditions("0", "0,0")])(
    "has no customer column without customer prices (%#), but still recalculates proposals",
    (c) => {
      const s = calculateComparatorSummary(session, c, { A: "10" });
      expect(s.customerConditions.totalAnnualPrice).toBe("");
      expect(s.customerTotalAnnualPrice).toBe(0);
      expect(s.annualPriceDeltaByTitle).toEqual({});
      expect(s.annualSavingsPercentageByTitle).toEqual({});
      expect(s.proposals[0].totalAnnualPrice).toBe(510);
    },
  );

  it("truncates annual kWh to an integer like BmApp", () => {
    const s = calculateComparatorSummary(session, conditions("0", "1"), {});
    expect(s.customerConditions.annualEnergyCost).toBe("1000.00");
  });

  it("ignores prototype keys used as titles or periods", () => {
    const s = calculateComparatorSummary({ ...session, proposals: [proposal("constructor", 10)] }, conditions("0", "1"), {});
    expect(s.proposals[0].totalAnnualPrice).toBe(10);
  });
});

describe("recalculateProposalWithAdditionalAmount", () => {
  it("adds the amount and its IVA, rounded half-even to 2 decimals", () => {
    const p = recalculateProposalWithAdditionalAmount(proposal("A", 500, 100), 12.5, 21);
    expect(p.iva).toBe(102.62); // 102.625 -> half-even (Kotlin round)
    expect(p.totalAnnualPrice).toBe(512.5);
  });

  it.each([0, -5, Number.NaN])("leaves the proposal unchanged for %d", (amount) => {
    const original = proposal("A", 500);
    expect(recalculateProposalWithAdditionalAmount(original, amount, 21)).toBe(original);
  });
});

describe("calculateAnnualSavingsPercentage", () => {
  it("is 0 when the customer total is not positive", () => {
    expect(calculateAnnualSavingsPercentage(0, 100)).toBe(0);
  });
  it("rounds half up", () => {
    expect(calculateAnnualSavingsPercentage(200, 185)).toBe(8);
  });
});

const summaryOf = (...entries: [string, number][]): ComparatorSummary => ({
  ...emptyComparatorSummary(),
  proposals: entries.map(([t], i) => proposal(t, 1000 - (entries[i][1] / 100) * 1000)),
  customerTotalAnnualPrice: 1000,
  annualSavingsPercentageByTitle: Object.fromEntries(entries),
  annualPriceDeltaByTitle: Object.fromEntries(entries.map(([t, s]) => [t, s * 10])),
});

// Mirrors BmApp SelectUncompetitiveProposalsUseCaseTest.
describe("selectUncompetitiveProposals", () => {
  it("hides proposals at or beyond the threshold", () => {
    const s = summaryOf(["Cheaper", 20], ["Slightly worse", -14], ["Exactly at the limit", -15], ["Much worse", -40]);
    expect(selectUncompetitiveProposals(s)).toEqual(new Set(["Exactly at the limit", "Much worse"]));
  });

  it("hides nothing without customer prices", () => {
    expect(selectUncompetitiveProposals({ ...summaryOf(["X", -80]), customerTotalAnnualPrice: 0 }).size).toBe(0);
  });

  it("ignores proposals with no comparison available", () => {
    const s = { ...summaryOf(["X", -80]), annualSavingsPercentageByTitle: {} };
    expect(selectUncompetitiveProposals(s).size).toBe(0);
  });

  it("keeps the cheapest when every proposal is uncompetitive", () => {
    const s = summaryOf(["A", -30], ["B", -20], ["C", -50]);
    expect(selectUncompetitiveProposals(s)).toEqual(new Set(["A", "C"]));
  });

  it("threshold is configurable", () => {
    const s = summaryOf(["Worse by twenty", -20], ["Cheaper", 20]);
    expect(selectUncompetitiveProposals(s, 25).size).toBe(0);
    expect(selectUncompetitiveProposals(s, 20)).toEqual(new Set(["Worse by twenty"]));
  });
});

describe("bestProposalAmong", () => {
  it("returns the cheapest proposal that beats the customer", () => {
    const s = summaryOf(["A", 10], ["B", 30], ["C", -5]);
    expect(bestProposalAmong(s, s.proposals)?.proposalTitle).toBe("B");
  });
  it("returns null when none beats the customer or there are no customer prices", () => {
    const s = summaryOf(["C", -5]);
    expect(bestProposalAmong(s, s.proposals)).toBeNull();
    expect(bestProposalAmong({ ...s, customerTotalAnnualPrice: 0 }, s.proposals)).toBeNull();
  });
});
