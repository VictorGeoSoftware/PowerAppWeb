import { describe, expect, it } from "vitest";
import {
  formatFixedHalfUp,
  parseDecimal,
  roundHalfEven,
  roundToInt,
  toDoubleOrNull,
  toTwoDecimals,
} from "@/lib/comparator/rounding";

describe("roundHalfEven (Kotlin round)", () => {
  it.each([
    [0.5, 0],
    [1.5, 2],
    [2.5, 2],
    [-2.5, -2],
    [-1.5, -2],
    [2.4, 2],
    [2.6, 3],
  ])("%d -> %d", (x, r) => expect(roundHalfEven(x)).toBe(r));

  it("keeps the sign of zero like Math.rint", () => {
    expect(Object.is(roundHalfEven(-0.4), -0)).toBe(true);
  });
});

describe("roundToInt (Kotlin roundToInt)", () => {
  it("rounds half up and never returns -0", () => {
    expect(roundToInt(2.5)).toBe(3);
    expect(roundToInt(-2.5)).toBe(-2);
    expect(Object.is(roundToInt(-0.4), 0)).toBe(true);
  });
});

describe("formatFixedHalfUp (Java %.nf)", () => {
  it("rounds the shortest decimal half up, unlike toFixed", () => {
    expect((1.005).toFixed(2)).toBe("1.00");
    expect(formatFixedHalfUp(1.005, 2)).toBe("1.01");
    expect(formatFixedHalfUp(99.995, 2)).toBe("100.00");
    expect(formatFixedHalfUp(5e-7, 6)).toBe("0.000001");
    expect(formatFixedHalfUp(12345600, 2)).toBe("12345600.00");
  });

  it("keeps the minus sign of negative and negative-zero values", () => {
    expect(formatFixedHalfUp(-1.005, 2)).toBe("-1.01");
    expect(formatFixedHalfUp(-0, 2)).toBe("-0.00");
  });

  it("toTwoDecimals rounds half-even first, then formats", () => {
    expect(toTwoDecimals(0.125)).toBe("0.12");
  });
});

describe("parseDecimal (Kotlin toDoubleOrNull)", () => {
  it.each([
    ["1,5", 1.5],
    ["1.", 1],
    [",5", 0.5],
    ["", 0],
    ["  ", 0],
    ["abc", 0],
    ["1,2,3", 0],
    ["1d", 1],
    ["1e3", 1000],
    [" 2 ", 2],
  ])("%s -> %d", (input, value) => expect(parseDecimal(input)).toBe(value));

  it("handles null and undefined", () => {
    expect(parseDecimal(null)).toBe(0);
    expect(parseDecimal(undefined)).toBe(0);
  });

  it("rejects hex and garbage", () => {
    expect(toDoubleOrNull("0x10")).toBeNull();
    expect(toDoubleOrNull("1..2")).toBeNull();
  });
});
