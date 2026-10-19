import { describe, expect, it } from "vitest";
import golden from "@/lib/comparator/__golden__/comparator-cases.json";
import {
  bestProposalAmong,
  calculateComparatorSummary,
  selectUncompetitiveProposals,
} from "@/lib/comparator/calculate";
import { formatFixedHalfUp, parseDecimal, roundToInt, roundToTwoDecimals } from "@/lib/comparator/rounding";
import type { ConsumptionSession, CurrentConditions } from "@/lib/gate/fee-first";

type GoldenSession = {
  feeType: string;
  iva: number;
  electricTaxPercent: number;
  powerRows: { period: string; value: number }[];
  energyRows: { period: string; value: number }[];
  proposals: unknown[];
};

const toSession = (s: GoldenSession | null): ConsumptionSession | null =>
  s && {
    ...s,
    jobId: "job",
    powerPeriods: s.powerRows.map((r) => r.period),
    energyPeriods: s.energyRows.map((r) => r.period),
  };

describe("comparator golden cases (generated from BmApp Kotlin)", () => {
  it("has enough cases", () => {
    expect(golden.cases.length).toBeGreaterThanOrEqual(20);
  });

  it.each(golden.primitives.parseDecimal)("parseDecimal($input)", ({ input, value }) => {
    expect(parseDecimal(input)).toBe(value);
  });

  it.each(golden.primitives.format)("format/round $value", ({ value, f2, f6, round2, roundToInt: r }) => {
    expect(formatFixedHalfUp(value, 2)).toBe(f2);
    expect(formatFixedHalfUp(value, 6)).toBe(f6);
    expect(roundToTwoDecimals(value)).toBe(round2);
    expect(roundToInt(value)).toBe(r);
  });

  it.each(golden.cases.map((c) => [c.name, c] as const))("%s", (_, c) => {
    const summary = calculateComparatorSummary(
      toSession(c.input.session as GoldenSession | null),
      c.input.conditions as CurrentConditions | null,
      c.input.fixedAmountByTitle as Record<string, string>,
    );
    const e = c.expected;
    expect(summary.proposals).toEqual(e.proposals);
    expect(summary.customerConditions).toEqual(e.customerConditions);
    expect(summary.customerTotalAnnualPrice).toBe(e.customerTotalAnnualPrice);
    expect(summary.annualPriceDeltaByTitle).toEqual(e.annualPriceDeltaByTitle);
    expect(summary.annualSavingsPercentageByTitle).toEqual(e.annualSavingsPercentageByTitle);
    expect(bestProposalAmong(summary, summary.proposals)?.proposalTitle ?? null).toBe(e.bestProposalTitle);
    expect([...selectUncompetitiveProposals(summary)].sort()).toEqual(e.uncompetitiveTitles);
    expect([...selectUncompetitiveProposals(summary, 25)].sort()).toEqual(e.uncompetitiveTitlesThreshold25);
  });
});
