import { describe, expect, it } from "vitest";
import { COMPREHENSIVE_COMPARATOR_PDF, parseReportAccess } from "./report-access";

describe("parseReportAccess", () => {
  it("grants only when capabilities contains the exact capability", () => {
    expect(COMPREHENSIVE_COMPARATOR_PDF).toBe("COMPREHENSIVE_COMPARATOR_PDF");
    expect(parseReportAccess({ tier: "PREMIUM", capabilities: ["COMPREHENSIVE_COMPARATOR_PDF"] })).toEqual({
      comprehensiveReport: true,
    });
  });

  it("ignores tier: PREMIUM without capability is denied, BASIC with capability is granted", () => {
    expect(parseReportAccess({ tier: "PREMIUM", capabilities: [] }).comprehensiveReport).toBe(false);
    expect(parseReportAccess({ tier: "BASIC", capabilities: ["COMPREHENSIVE_COMPARATOR_PDF"] }).comprehensiveReport).toBe(
      true,
    );
  });

  it("ignores unknown extra capabilities", () => {
    expect(parseReportAccess({ capabilities: ["OTHER", "COMPREHENSIVE_COMPARATOR_PDF"] }).comprehensiveReport).toBe(true);
    expect(parseReportAccess({ capabilities: ["OTHER"] }).comprehensiveReport).toBe(false);
  });

  it.each([
    null,
    undefined,
    "COMPREHENSIVE_COMPARATOR_PDF",
    42,
    [],
    {},
    { tier: "PREMIUM" },
    { capabilities: "COMPREHENSIVE_COMPARATOR_PDF" },
    { capabilities: { 0: "COMPREHENSIVE_COMPARATOR_PDF" } },
    { capabilities: ["comprehensive_comparator_pdf"] },
    { capabilities: [" COMPREHENSIVE_COMPARATOR_PDF"] },
    { capabilities: [["COMPREHENSIVE_COMPARATOR_PDF"]] },
    { isAdmin: true, admin: true, capabilities: [] },
  ])("fails closed for %j", (body) => {
    expect(parseReportAccess(body).comprehensiveReport).toBe(false);
  });
});
