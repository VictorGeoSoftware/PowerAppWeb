import { describe, expect, it } from "vitest";
import { autoHideSignature, isProposalVisible, visibleProposals } from "./visibility";

describe("proposal visibility", () => {
  it("defaults to visible and keeps report order", () => {
    const proposals = [{ proposalTitle: "A" }, { proposalTitle: "B" }, { proposalTitle: "C" }];
    expect(visibleProposals(proposals, { B: false, C: true })).toEqual([{ proposalTitle: "A" }, { proposalTitle: "C" }]);
    expect(isProposalVisible({}, "toString")).toBe(true);
  });

  it("signature uses Kotlin Double.toString", () => {
    expect(autoHideSignature("j", 1234.5)).toBe("j@1234.5");
    expect(autoHideSignature("j", 0)).toBe("j@0.0");
    expect(autoHideSignature("j", 800)).toBe("j@800.0");
  });
});
