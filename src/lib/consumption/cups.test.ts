import { describe, expect, it } from "vitest";
import { computeControlCode, fixOcrErrors, isValidCups, normalize, toSubmittableCups } from "./cups";

describe("CUPS (BmApp CupsCodeParser / backend CupsValidationTest fixtures)", () => {
  it("accepts valid 20- and 22-char codes", () => {
    expect(isValidCups("ES0031607515707001RC")).toBe(true);
    expect(isValidCups("ES0031607515707001RC0F")).toBe(true);
    expect(isValidCups("ES0031607515707001RC1P")).toBe(true);
  });

  it("normalizes lowercase and separators", () => {
    expect(isValidCups("es 0031-6075-1570-7001 rc")).toBe(true);
    expect(isValidCups("  ES.0031.6075.1570.7001.RC.0F  ")).toBe(true);
    expect(normalize("es 0031-6075 rc")).toBe("ES00316075RC");
  });

  it("rejects wrong control code, letters, length and frontier", () => {
    for (const bad of [
      "ES0031607515707001AA",
      "ES0031607515707001RD",
      "ES003160AB15707001RC",
      "ES003160751570700",
      "ES0031607515707001RC0FX",
      "ES0031607515707001RCFF",
      "ES0031607515707001RC00",
      "ES0031607515707001R", // 19
      "ES0031607515707001RC0", // 21
      "",
    ])
      expect(isValidCups(bad), bad).toBe(false);
  });

  it("fixes OCR look-alikes in digit and control zones", () => {
    expect(fixOcrErrors("ESOO316O7515707OO1RC")).toBe("ES0031607515707001RC");
    expect(fixOcrErrors("ES0031607515707001R2")).toBe("ES0031607515707001RZ");
    expect(fixOcrErrors("ESIL5BZG0000000000AA")).toBe("ES1158260000000000AA");
    expect(fixOcrErrors("SHORT")).toBe("SHORT");
    expect(isValidCups("ES0O31607515707001RC")).toBe(true);
  });

  it("submits the corrected code", () => {
    expect(toSubmittableCups("es 0O31 6075 1570 7001 rc")).toBe("ES0031607515707001RC");
  });

  it("computes the control code", () => {
    expect(computeControlCode("0031607515707001")).toBe("RC");
    expect(computeControlCode("123")).toBeNull();
  });
});
