import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PremiumReportButton } from "./premium-report-button";

describe("PremiumReportButton", () => {
  it("is a disabled ghost text button named Informe completo with a 44 px target", () => {
    render(<PremiumReportButton />);
    const button = screen.getByRole("button", { name: "Informe completo" });
    expect(button.textContent).toBe("Informe completo");
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.className).toContain("h-11");
    expect(button.className).toContain("text-foreground");
  });
});
