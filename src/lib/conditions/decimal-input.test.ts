import { describe, expect, it } from "vitest";
import { isFilledPrice } from "@/lib/gate/fee-first";
import { isValidDecimalInput } from "./decimal-input";

describe("isValidDecimalInput (BmApp regex)", () => {
  it.each(["", "5", "5.", ",5", "0,12345678", "1,12345678", "12.5"])("accepts %j", (v) => {
    expect(isValidDecimalInput(v)).toBe(true);
  });
  it.each(["1.123456789", "a", "-1", "1.2.3", "1,2.3", " 1", "1 ", "1e3"])("rejects %j", (v) => {
    expect(isValidDecimalInput(v)).toBe(false);
  });
});

describe("isFilledPrice (gate rule)", () => {
  it.each(["0", "0,0", "", "abc", undefined])("%j is not filled", (v) => {
    expect(isFilledPrice(v)).toBe(false);
  });
  it.each(["0,1", ".5", "0.12345678"])("%j is filled", (v) => {
    expect(isFilledPrice(v)).toBe(true);
  });
});
