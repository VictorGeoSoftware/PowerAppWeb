import { describe, expect, it } from "vitest";
import { type ConsumptionReportResponse, toConsumptionSession } from "./report";

const sampleReport = (over: Partial<ConsumptionReportResponse["consumptionData"]> = {}): ConsumptionReportResponse => ({
  success: true,
  userData: { cups_code: "ES0031607515707001RC", customer_details: { name: "Ana", address: null } },
  consumptionData: {
    cups: "ES0031607515707001RC",
    feeType: "2.0TD",
    annualConsumptionP1: 1234.5,
    annualConsumptionP2: 0,
    annualConsumptionP3: 800,
    annualConsumptionP4: 0,
    annualConsumptionP5: 0,
    annualConsumptionP6: 0,
    subscribedPowerP1: 4.6,
    subscribedPowerP2: 4.6,
    subscribedPowerP3: 0,
    subscribedPowerP4: 0,
    subscribedPowerP5: 0,
    subscribedPowerP6: 0,
    ...over,
  },
  proposals: [{ proposalTitle: "X" }],
  iva: 21,
  impuestoElectrico: 5.11,
});

describe("toConsumptionSession", () => {
  it("maps the report and drops zero periods", () => {
    expect(toConsumptionSession(sampleReport(), "job-1")).toEqual({
      jobId: "job-1",
      cups: "ES0031607515707001RC",
      feeType: "2.0TD",
      iva: 21,
      electricTaxPercent: 5.11,
      holderName: "Ana",
      powerRows: [
        { period: "P1", value: 4.6 },
        { period: "P2", value: 4.6 },
      ],
      energyRows: [
        { period: "P1", value: 1234.5 },
        { period: "P3", value: 800 },
      ],
      powerPeriods: ["P1", "P2"],
      energyPeriods: ["P1", "P3"],
      proposals: [{ proposalTitle: "X" }],
    });
  });

  it("falls back to consumptionData.cups", () => {
    const r = sampleReport({ cups: "ES0031607515707001RC0F" });
    r.userData = { cups_code: "" };
    const s = toConsumptionSession(r, "j");
    expect(s.cups).toBe("ES0031607515707001RC0F");
    expect(s.holderName).toBeUndefined();
  });
});
