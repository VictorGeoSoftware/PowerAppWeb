import { describe, expect, it } from "vitest";
import {
  bestSavingLabel,
  deltaLabel,
  deltaTone,
  isValidFixedAmountInput,
  kotlinDoubleToString,
  middleEllipsize,
  percentLabel,
  sixDecimals,
} from "./format";

describe("kotlinDoubleToString", () => {
  it.each([
    [4.6, "4.6"],
    [5, "5.0"],
    [0, "0.0"],
    [-0, "-0.0"],
    [0.0001, "1.0E-4"],
    [0.00012345, "1.2345E-4"],
    [0.001, "0.001"],
    [0.123456, "0.123456"],
    [1234567.5, "1234567.5"],
    [1e7, "1.0E7"],
    [12345678.9, "1.23456789E7"],
    [-2.5, "-2.5"],
  ])("%s -> %s", (x, s) => expect(kotlinDoubleToString(x)).toBe(s));
});

describe("labels", () => {
  it("percent, six decimals", () => {
    expect(percentLabel(5.11269632)).toBe("5.11 %");
    expect(percentLabel(21)).toBe("21.00 %");
    expect(sixDecimals(0.1)).toBe("0.100000");
  });

  it("delta text and tone", () => {
    expect(deltaLabel(-29.51, -10)).toBe("-29.51€ (-10%)");
    expect(deltaLabel(12.3, 4)).toBe("12.30€ (4%)");
    expect(deltaLabel(12.3)).toBe("12.30€");
    expect(deltaLabel(undefined)).toBe("--");
    expect(deltaTone(-1)).toBe("negative");
    expect(deltaTone(1)).toBe("positive");
    expect(deltaTone(0)).toBe("neutral");
    expect(deltaTone(undefined)).toBe("neutral");
  });

  it("best saving rounds then formats", () => {
    expect(bestSavingLabel(189.666)).toBe("189.67");
    expect(bestSavingLabel(5)).toBe("5.00");
  });
});

describe("middleEllipsize", () => {
  it("keeps short titles and cuts long ones in the middle", () => {
    expect(middleEllipsize("Propuesta 1")).toBe("Propuesta 1");
    expect(middleEllipsize("12345678901234567")).toBe("12345678901234567");
    expect(middleEllipsize("IBERDROLA PLAN ESTABLE A CO 5")).toBe("IBERDRO...E A CO 5");
  });
});

describe("isValidFixedAmountInput", () => {
  it.each([
    ["", true],
    ["12", true],
    ["12,5", true],
    ["12.50", true],
    [".5", true],
    ["12.505", false],
    ["1a", false],
    ["-1", false],
    ["1,2,3", false],
  ])("%j -> %s", (v, ok) => expect(isValidFixedAmountInput(v)).toBe(ok));
});
