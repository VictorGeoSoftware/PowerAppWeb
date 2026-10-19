import { describe, expect, it } from "vitest";
import { calculateComparatorSummary } from "@/lib/comparator/calculate";
import type {
  ConsumptionSession,
  CurrentConditions,
} from "@/lib/gate/fee-first";
import { visibleProposals } from "@/lib/proposals/visibility";
import {
  buildComparatorReportRequest,
  comparatorPdfFileName,
} from "./comparator-report";

const proposal = (proposalTitle: string, total: number) => ({
  proposalTitle,
  powerTermItems: [0.081234, 0.04],
  annualPowerTermCost: 300.5,
  consumedEnergyItems: [0.13, 0.11],
  annualEnergyCost: 248.51,
  extraServices: 0,
  iva: 115.39,
  electricalTax: 28.04,
  totalAnnualPrice: total,
});

const session: ConsumptionSession = {
  jobId: "job-1",
  cups: "ES0031607515707001RC",
  holderName: "Ana Pérez",
  address: "Calle Mayor 1",
  feeType: "3.0TD",
  iva: 21,
  electricTaxPercent: 5.11269632,
  powerRows: [
    { period: "P1", value: 4.6 },
    { period: "P2", value: 5 },
  ],
  energyRows: [
    { period: "P1", value: 1234.7 },
    { period: "P2", value: 800 },
  ],
  powerPeriods: ["P1", "P2"],
  energyPeriods: ["P1", "P2"],
  proposals: [
    proposal("Barata", 700),
    proposal("Media", 1050),
    proposal("Cara", 1250),
  ],
};

const conditions: CurrentConditions = {
  powerTermPriceByPeriod: { P1: "0,1", P2: "0.2" },
  energyPriceByPeriod: { P1: "0,15", P2: "0.12" },
  extraServices: "12,5",
  companyName: "Iberdrola",
};

const build = (
  s = session,
  c: CurrentConditions | null = conditions,
  fixed: Record<string, string> = {},
  hidden = {},
) => {
  const summary = calculateComparatorSummary(s, c, fixed);
  return buildComparatorReportRequest(
    s,
    summary,
    visibleProposals(summary.proposals, hidden),
    fixed,
  );
};

describe("buildComparatorReportRequest", () => {
  it("matches the BmApp body for a full study", () => {
    const summary = calculateComparatorSummary(session, conditions, {
      Media: "12,5",
    });
    const body = buildComparatorReportRequest(
      session,
      summary,
      summary.proposals,
      { Media: "12,5" },
    );
    expect(body).toMatchObject({
      title: "COMPARATIVO ANUAL DE PRECIOS FIJOS",
      supplyHolder: "Ana Pérez",
      supplyAddress: "Calle Mayor 1",
      cups: "ES0031607515707001RC",
      tariffName: "3.0TD",
      powerTermRows: [
        { period: "P1", value: 4.6 },
        { period: "P2", value: 5 },
      ],
      energyConsumedRows: [
        { period: "P1", value: 1234 },
        { period: "P2", value: 800 },
      ],
      iva: "21.00 %",
      impuestoElectrico: "5.11 %",
    });
    const c = summary.customerConditions;
    expect(body.customerConditions).toEqual({
      title: "CONDICIONES ACTUALES",
      powerTermItems: [0.1, 0.2],
      annualPowerTermCost: c.annualPowerTermCost,
      consumedEnergyItems: [0.15, 0.12],
      annualEnergyCost: c.annualEnergyCost,
      extraServices: "12.50",
      electricalTax: c.electricTax,
      iva: c.iva,
      totalAnnualPrice: c.totalAnnualPrice,
    });
    expect(body.proposals[0]).toEqual({
      title: "Barata",
      powerTermItems: [0.081234, 0.04],
      annualPowerTermCost: "300.50",
      consumedEnergyItems: [0.13, 0.11],
      annualEnergyCost: "248.51",
      extraServices: "0.00",
      electricalTax: "28.04",
      iva: "115.39",
      totalAnnualPrice: "700.00",
      annualPriceDifference: (
        Math.round((summary.customerTotalAnnualPrice - 700) * 100) / 100
      ).toFixed(2),
      annualSavingsPercentage: summary.annualSavingsPercentageByTitle.Barata,
    });
    // Fixed amount passes through as typed; IVA and total are recalculated.
    expect(body.proposals[1].extraServices).toBe("12,5");
    expect(body.proposals[1].totalAnnualPrice).toBe("1062.50");
    expect(body.proposals[1].iva).toBe("118.02");
    expect(Number.isInteger(body.proposals[1].annualSavingsPercentage)).toBe(
      true,
    );
  });

  it("uses '--' for blank holder, address and CUPS", () => {
    const body = build({
      ...session,
      holderName: "  ",
      address: undefined,
      cups: "",
    });
    expect([body.supplyHolder, body.supplyAddress, body.cups]).toEqual([
      "--",
      "--",
      "--",
    ]);
  });

  it("blank fixed amount becomes '0.00'", () => {
    expect(
      build(session, conditions, { Barata: " " }).proposals[0].extraServices,
    ).toBe("0.00");
  });

  it("without customer prices: empty customer column and null delta/percentage", () => {
    const body = build(session, null);
    expect(body.customerConditions).toEqual({
      title: "CONDICIONES ACTUALES",
      powerTermItems: [],
      annualPowerTermCost: "",
      consumedEnergyItems: [],
      annualEnergyCost: "",
      extraServices: "",
      electricalTax: "",
      iva: "",
      totalAnnualPrice: "",
    });
    expect(body.proposals[0].annualPriceDifference).toBeNull();
    expect(body.proposals[0].annualSavingsPercentage).toBeNull();
  });

  it("includes only visible proposals, in table order", () => {
    expect(
      build(session, conditions, {}, { Media: false }).proposals.map(
        (p) => p.title,
      ),
    ).toEqual(["Barata", "Cara"]);
  });
});

describe("comparatorPdfFileName", () => {
  it("uses local yyyyMMdd_HHmmss", () => {
    expect(comparatorPdfFileName(new Date(2026, 9, 19, 15, 30, 45))).toBe(
      "comparador_20261019_153045.pdf",
    );
    expect(comparatorPdfFileName(new Date(2026, 0, 2, 3, 4, 5))).toBe(
      "comparador_20260102_030405.pdf",
    );
  });
});
